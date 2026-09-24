//! `manifest.json`: the single source of truth for what is published on the lake.
//!
//! The manifest is the only object that is ever overwritten. It is written with an
//! `If-Match` precondition on the `ETag` it was read with, so two API replicas can never
//! publish on top of each other even if the redis lease is lost.

use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use object_store::path::Path;
use object_store::{
    Attribute, Attributes, ObjectStore, ObjectStoreExt, PutMode, PutOptions, PutPayload,
    UpdateVersion,
};
use serde::{Deserialize, Serialize};

use super::DumpError;

pub(crate) const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Manifest {
    pub(crate) format_version: u32,
    /// Increments on every publish.
    pub(crate) version: u64,
    pub(crate) generated_at: Option<DateTime<Utc>>,
    /// Base URL every `key` is served under (no trailing slash).
    pub(crate) public_url: String,
    /// Key of the current `DuckLake` catalog, if one has been built.
    pub(crate) catalog: Option<String>,
    /// `DuckDB` version the catalog was written with; readers need at least this version.
    pub(crate) duckdb_version: Option<String>,
    pub(crate) last_fold_at: Option<DateTime<Utc>>,
    pub(crate) tables: BTreeMap<String, TableState>,
    /// Data objects that dropped out of `tables`, with the time they did. The sweep keeps
    /// them for a grace period counted from then, so readers of an older manifest or
    /// catalog (the MCP server, `DuckLake` clients) never hit a deleted file.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub(crate) retired: BTreeMap<String, DateTime<Utc>>,
}

impl Manifest {
    pub(crate) fn empty(public_url: &str) -> Self {
        Self {
            format_version: FORMAT_VERSION,
            version: 0,
            generated_at: None,
            public_url: public_url.trim_end_matches('/').to_owned(),
            catalog: None,
            duckdb_version: None,
            last_fold_at: None,
            tables: BTreeMap::new(),
            retired: BTreeMap::new(),
        }
    }

    pub(crate) fn url(&self, key: &str) -> String {
        format!("{}/{key}", self.public_url)
    }

    /// Every data object the manifest references (catalog excluded).
    pub(crate) fn referenced_keys(&self) -> impl Iterator<Item = &str> {
        self.tables
            .values()
            .flat_map(|t| t.files.iter().map(|f| f.key.as_str()))
    }

    /// Records every key of `previous` this manifest no longer references as retired at
    /// `now`, and forgets retirements older than `grace`: the sweep has deleted those
    /// objects, and would anyway, since an object is never newer than its retirement.
    pub(crate) fn retire_unreferenced(
        &mut self,
        previous: &HashSet<String>,
        now: DateTime<Utc>,
        grace: chrono::Duration,
    ) {
        let current: HashSet<String> = self.referenced_keys().map(str::to_owned).collect();
        let newly_retired: Vec<String> = previous.difference(&current).cloned().collect();
        self.retired
            .retain(|k, at| !current.contains(k) && now - *at < grace);
        for key in newly_retired {
            self.retired.entry(key).or_insert(now);
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PolicyKind {
    Incremental,
    Snapshot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum TableStatus {
    /// No complete generation yet (initial load or breaking schema change in progress).
    Building,
    Ready,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Column {
    pub(crate) name: String,
    #[serde(rename = "type")]
    pub(crate) ch_type: String,
    /// Comment of the base table column, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) comment: Option<String>,
}

impl Column {
    /// What readers depend on: a comment change is not a schema change.
    pub(crate) fn shape(&self) -> (&str, &str) {
        (&self.name, &self.ch_type)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct TableState {
    pub(crate) policy: PolicyKind,
    pub(crate) status: TableStatus,
    /// Columns of the `dump.<table>` view, in order.
    pub(crate) columns: Vec<Column>,
    /// Watermark column and partition expression (incremental tables only), so readers can
    /// reproduce the "latest row wins" rule without reading the code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) watermark: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) partition_expr: Option<String>,
    /// Generation readers should use; `0` while the first one is still building.
    #[serde(default)]
    pub(crate) generation: u32,
    /// Generation whose bases are still being built (initial load or schema change).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) building: Option<u32>,
    /// `hi` of the last exported delta window (unix seconds). Rows with
    /// `watermark <= watermark_hi` are covered by the published files.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) watermark_hi: Option<i64>,
    #[serde(default)]
    pub(crate) files: Vec<FileEntry>,
}

impl TableState {
    pub(crate) fn new(policy: PolicyKind, columns: Vec<Column>) -> Self {
        Self {
            policy,
            status: TableStatus::Building,
            columns,
            watermark: None,
            partition_expr: None,
            generation: 0,
            building: None,
            watermark_hi: None,
            files: Vec::new(),
        }
    }

    pub(crate) fn base(&self, generation: u32, partition: u64) -> Option<&FileEntry> {
        self.files.iter().find(|f| {
            f.kind == FileKind::Base && f.generation == generation && f.partition == Some(partition)
        })
    }

    pub(crate) fn files_of(
        &self,
        generation: u32,
        kind: FileKind,
    ) -> impl Iterator<Item = &FileEntry> {
        self.files
            .iter()
            .filter(move |f| f.generation == generation && f.kind == kind)
    }

    /// Delta and residual files of a generation: everything not covered by a base.
    pub(crate) fn increments(&self, generation: u32) -> impl Iterator<Item = &FileEntry> {
        self.files.iter().filter(move |f| {
            f.generation == generation && matches!(f.kind, FileKind::Delta | FileKind::Residual)
        })
    }

    /// Files readers of the current generation should union.
    pub(crate) fn published_files(&self) -> Vec<&FileEntry> {
        match self.policy {
            PolicyKind::Snapshot => self.files.iter().collect(),
            PolicyKind::Incremental => self
                .files
                .iter()
                .filter(|f| f.generation == self.generation)
                .collect(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum FileKind {
    /// One partition, exported with `FINAL`, rows with `watermark <= hi`.
    Base,
    /// Rows with `watermark` in `(lo, hi]`, one hourly window, any partition.
    Delta,
    /// Folded hourly deltas: rows in `(lo, hi]` not yet covered by a base.
    Residual,
    /// Full table export.
    Snapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FileEntry {
    pub(crate) key: String,
    pub(crate) kind: FileKind,
    #[serde(default)]
    pub(crate) generation: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) partition: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) lo: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) hi: Option<i64>,
    pub(crate) rows: u64,
    pub(crate) bytes: u64,
    /// Rows per partition (delta and residual files), used to decide which partitions need
    /// a rebuild and when the file is fully covered.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub(crate) rows_by_partition: BTreeMap<u64, u64>,
    pub(crate) built_at: DateTime<Utc>,
}

/// The manifest together with the `ETag` it was read with.
pub(crate) struct LoadedManifest {
    pub(crate) manifest: Manifest,
    pub(crate) e_tag: Option<String>,
}

pub(crate) async fn load(
    store: &Arc<dyn ObjectStore>,
    key: &str,
    public_url: &str,
) -> Result<LoadedManifest, DumpError> {
    match store.get(&Path::from(key)).await {
        Ok(result) => {
            let e_tag = result.meta.e_tag.clone();
            let bytes = result.bytes().await?;
            let manifest: Manifest = serde_json::from_slice(&bytes)?;
            if manifest.format_version != FORMAT_VERSION {
                return Err(DumpError::ManifestFormat(manifest.format_version));
            }
            Ok(LoadedManifest { manifest, e_tag })
        }
        Err(object_store::Error::NotFound { .. }) => Ok(LoadedManifest {
            manifest: Manifest::empty(public_url),
            e_tag: None,
        }),
        Err(e) => Err(e.into()),
    }
}

/// Publishes the manifest, failing with [`DumpError::ManifestConflict`] if it changed since
/// it was loaded. Returns the new `ETag`.
pub(crate) async fn publish(
    store: &Arc<dyn ObjectStore>,
    key: &str,
    manifest: &Manifest,
    e_tag: Option<&str>,
) -> Result<Option<String>, DumpError> {
    let mode = match e_tag {
        Some(e_tag) => PutMode::Update(UpdateVersion {
            e_tag: Some(e_tag.to_owned()),
            version: None,
        }),
        None => PutMode::Create,
    };
    let body = serde_json::to_vec_pretty(manifest)?;
    let result = store
        .put_opts(
            &Path::from(key),
            PutPayload::from(body),
            PutOptions {
                mode,
                attributes: Attributes::from_iter([
                    (Attribute::ContentType, "application/json"),
                    (Attribute::CacheControl, "max-age=60"),
                ]),
                ..Default::default()
            },
        )
        .await;
    match result {
        Ok(r) => Ok(r.e_tag),
        Err(
            object_store::Error::Precondition { .. } | object_store::Error::AlreadyExists { .. },
        ) => Err(DumpError::ManifestConflict),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_round_trips_through_json() {
        let mut manifest = Manifest::empty("https://data.example.com/");
        let mut table = TableState::new(
            PolicyKind::Incremental,
            vec![Column {
                name: "match_id".to_owned(),
                ch_type: "UInt64".to_owned(),
                comment: None,
            }],
        );
        table.files.push(FileEntry {
            key: "v1/tables/match_player/g1/delta/a.parquet".to_owned(),
            kind: FileKind::Delta,
            generation: 1,
            partition: None,
            lo: Some(10),
            hi: Some(20),
            rows: 3,
            bytes: 100,
            rows_by_partition: BTreeMap::from([(5, 3)]),
            built_at: Utc::now(),
        });
        manifest.tables.insert("match_player".to_owned(), table);

        let json = serde_json::to_string(&manifest).unwrap();
        let back: Manifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back.public_url, "https://data.example.com");
        assert_eq!(
            back.tables["match_player"].files[0].rows_by_partition[&5],
            3
        );
        assert_eq!(
            manifest.url("v1/x.parquet"),
            "https://data.example.com/v1/x.parquet"
        );
    }

    fn snapshot_file(key: &str) -> FileEntry {
        FileEntry {
            key: key.to_owned(),
            kind: FileKind::Snapshot,
            generation: 0,
            partition: None,
            lo: None,
            hi: None,
            rows: 1,
            bytes: 1,
            rows_by_partition: BTreeMap::new(),
            built_at: Utc::now(),
        }
    }

    #[test]
    fn dropped_files_are_retired_when_they_leave_the_manifest() {
        let grace = chrono::Duration::hours(24);
        let t0 = Utc::now();
        let mut manifest = Manifest::empty("https://data.example.com");
        let mut table = TableState::new(PolicyKind::Snapshot, Vec::new());
        table.files.push(snapshot_file("a"));
        manifest.tables.insert("t".to_owned(), table);

        let previous = HashSet::from(["a".to_owned(), "b".to_owned()]);
        manifest.retire_unreferenced(&previous, t0, grace);
        assert_eq!(manifest.retired, BTreeMap::from([("b".to_owned(), t0)]));

        // Still unreferenced an hour later: the original retirement time is kept.
        let t1 = t0 + chrono::Duration::hours(1);
        manifest.retire_unreferenced(&HashSet::from(["a".to_owned()]), t1, grace);
        assert_eq!(manifest.retired, BTreeMap::from([("b".to_owned(), t0)]));

        // Past the grace period the entry is forgotten.
        let t2 = t0 + grace;
        manifest.retire_unreferenced(&HashSet::from(["a".to_owned()]), t2, grace);
        assert!(manifest.retired.is_empty());

        let json = serde_json::to_string(&manifest).unwrap();
        assert!(!json.contains("retired"));
    }

    #[test]
    fn a_referenced_key_is_never_retired() {
        let t0 = Utc::now();
        let mut manifest = Manifest::empty("https://data.example.com");
        manifest.retired.insert("a".to_owned(), t0);
        let mut table = TableState::new(PolicyKind::Snapshot, Vec::new());
        table.files.push(snapshot_file("a"));
        manifest.tables.insert("t".to_owned(), table);

        manifest.retire_unreferenced(&HashSet::new(), t0, chrono::Duration::hours(24));
        assert!(manifest.retired.is_empty());
    }
}
