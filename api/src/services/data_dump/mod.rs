//! Hourly incremental dump of the public tables to the R2 data lake.
//!
//! One replica (redis lease) runs a tick every hour: hourly delta files for incremental
//! tables, fresh snapshots for the small ones, a bounded amount of partition rebuilds
//! (compaction), a `DuckLake` catalog, and finally a conditional write of `manifest.json`,
//! the only state readers see. Any failure leaves the manifest untouched; the next tick
//! resumes from the working manifest checkpointed after every export (`checkpoint`), or from
//! the published one. Objects a published manifest dropped are swept at the start of the
//! next tick, so they outlive it by less than an hour.
//!
//! Privacy deletions need no work here: the row policies hide protected accounts from every
//! export, and the rolling refresh rebuilds each partition within `max_base_age_secs`.

use core::time::Duration;
use std::collections::{BTreeMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use db_clients::Lease;
use object_store::path::Path;
use object_store::{Attribute, Attributes, ObjectStore, PutOptions, PutPayload};
use redis::aio::ConnectionManager;
use sqlx::{Pool, Postgres};
use tracing::{error, info, warn};

use self::compaction::Params;
use self::export::{Exporter, Increment};
use self::manifest::{Column, FileEntry, FileKind, Manifest, PolicyKind, TableState, TableStatus};
use self::policy::{Policy, TABLES, TablePolicy};
use crate::SHUTDOWN_TOKEN;
use crate::context::DataDumpConfig;
use crate::services::feature_flags::{DATA_DUMP, FeatureFlags};
use crate::services::protected_accounts::update_row_policy;

pub(crate) mod catalog;
mod checkpoint;
mod compaction;
mod export;
pub(crate) mod manifest;
mod policy;
mod sql;
mod sweep;

const TICK: Duration = Duration::from_secs(3600);
const HOUR: i64 = 3600;
const FOLD_EVERY: chrono::Duration = chrono::Duration::hours(20);
const LEASE_KEY: &str = "data_dump:leader";

#[derive(Debug, thiserror::Error)]
pub(crate) enum DumpError {
    #[error("ClickHouse: {0}")]
    ClickHouse(#[from] clickhouse::error::Error),
    #[error("object store: {0}")]
    ObjectStore(#[from] object_store::Error),
    #[error("redis: {0}")]
    Redis(#[from] redis::RedisError),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("duckdb: {0}")]
    DuckDb(#[from] duckdb::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("task: {0}")]
    Join(#[from] tokio::task::JoinError),
    #[error("row policy: {0}")]
    RowPolicy(#[from] crate::error::APIError),
    #[error("manifest changed since it was loaded; another replica published")]
    ManifestConflict,
    #[error("unsupported manifest format version {0}")]
    ManifestFormat(u32),
    #[error("shutting down")]
    Shutdown,
    #[error("catalog: {0} data files not under the public URL")]
    CatalogPaths(i64),
}

pub(crate) struct DataDump {
    pub(crate) config: DataDumpConfig,
    /// `dump_user`: reads the `dump.*` views and writes to R2 through the named collection.
    pub(crate) ch_dump: clickhouse::Client,
    /// Admin client for the GDPR row policies.
    pub(crate) ch_admin: clickhouse::Client,
    pub(crate) pg: Pool<Postgres>,
    pub(crate) redis: ConnectionManager,
    pub(crate) feature_flags: FeatureFlags,
    pub(crate) store: Arc<dyn ObjectStore>,
    /// The same bucket as `store`, for the catalog build's `DuckDB` reads.
    pub(crate) footer_source: catalog::FooterSource,
    pub(crate) work_dir: PathBuf,
}

fn ts(unix: i64) -> String {
    DateTime::from_timestamp(unix, 0).map_or_else(
        || unix.to_string(),
        |d| d.format("%Y%m%dT%H%M%SZ").to_string(),
    )
}

/// One partition rebuild: what [`DataDump::export_base`] writes.
#[derive(Clone, Copy)]
struct BaseExport<'a> {
    name: &'a str,
    generation: u32,
    range: sql::BaseRange<'a>,
    watermark: &'a str,
    watermark_hi: i64,
}

/// Takes the `dump` view's current `columns` into `state`, starting a new generation when
/// they changed incompatibly (or when the table has none yet).
fn adopt_columns(name: &str, state: &mut TableState, columns: Vec<Column>) {
    if state.generation == 0 && state.building.is_none() {
        state.building = Some(1);
    }
    let old_shape: Vec<_> = state.columns.iter().map(Column::shape).collect();
    let new_shape: Vec<_> = columns.iter().map(Column::shape).collect();
    if new_shape != old_shape {
        let additive = old_shape.iter().all(|c| new_shape.contains(c));
        if additive {
            info!(
                "data dump: {name} gained columns; keeping generation {}",
                state.generation
            );
        } else if state.building.is_none() {
            let next = state.generation.saturating_add(1);
            warn!("data dump: {name} schema changed incompatibly; building generation {next}");
            state.building = Some(next);
        } else {
            warn!(
                "data dump: {name} schema changed again while generation {:?} is building",
                state.building
            );
        }
    }
    state.columns = columns;
}

fn shutdown_check() -> Result<(), DumpError> {
    if SHUTDOWN_TOKEN.is_cancelled() {
        return Err(DumpError::Shutdown);
    }
    Ok(())
}

impl DataDump {
    pub(crate) fn spawn(self) {
        let this = Arc::new(self);
        // Tracked, so a shutdown waits for the tick to give up its lease (see `tick`).
        crate::BACKGROUND_TASKS.spawn(async move {
            let mut tick = tokio::time::interval(TICK);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            while SHUTDOWN_TOKEN
                .run_until_cancelled(tick.tick())
                .await
                .is_some()
            {
                if !this.feature_flags.is_enabled(&DATA_DUMP) {
                    info!("data dump: disabled by its feature flag; skipping tick");
                    continue;
                }
                this.tick().await;
            }
        });
    }

    fn key(&self, rest: &str) -> String {
        format!("{}/{rest}", self.config.prefix.trim_matches('/'))
    }

    async fn tick(&self) {
        let run_id: String = uuid::Uuid::new_v4()
            .simple()
            .to_string()
            .chars()
            .take(12)
            .collect();
        let lease = match Lease::acquire(
            self.redis.clone(),
            LEASE_KEY,
            &run_id,
            Duration::from_secs(self.config.lease_ttl_secs),
        )
        .await
        {
            Ok(Some(lease)) => lease,
            Ok(None) => {
                info!("data dump: another replica holds the lease; skipping tick");
                return;
            }
            Err(e) => {
                error!("data dump: lease acquisition failed: {e}");
                return;
            }
        };
        info!(run_id, "data dump tick started");
        let started = std::time::Instant::now();
        // Exports run for hours, longer than the shutdown grace period. Dropping one mid-way
        // is safe: its queries keep running server-side and the next leader kills them first
        // (`kill_orphans`), nothing is published until the manifest write at the end, and the
        // next leader resumes from the last checkpoint.
        // Releasing the lease right away lets the replica replacing this one take over.
        let result = SHUTDOWN_TOKEN
            .run_until_cancelled(self.run(&run_id))
            .await
            .unwrap_or(Err(DumpError::Shutdown));
        match result {
            Ok(()) => info!(
                run_id,
                secs = started.elapsed().as_secs(),
                "data dump tick finished"
            ),
            Err(e) => error!(
                run_id,
                secs = started.elapsed().as_secs(),
                "data dump tick failed: {e}"
            ),
        }
        lease.release().await;
    }

    async fn run(&self, run_id: &str) -> Result<(), DumpError> {
        let exporter = Exporter {
            ch: self.ch_dump.clone(),
            store: Arc::clone(&self.store),
            named_collection: self.config.named_collection.clone(),
            run_id: run_id.to_owned(),
        };
        // Exports of a replaced container keep running server-side; nobody would record them.
        if let Err(e) = self.ch_dump.query(&sql::kill_orphans()).execute().await {
            warn!("data dump: could not kill orphaned queries: {e}");
        }

        let manifest_key = self.key("manifest.json");
        let manifest::LoadedManifest {
            mut manifest,
            e_tag,
        } = manifest::load(&self.store, &manifest_key, &self.config.public_url).await?;
        manifest.public_url = self.config.public_url.trim_end_matches('/').to_owned();
        // Readers re-read the manifest far more often than hourly (the MCP server every 5
        // minutes), so whatever the previous publish dropped can go before this tick uploads.
        if let Some(published_at) = manifest.generated_at
            && let Err(e) = self.sweep(&manifest, published_at).await
        {
            warn!("data dump: sweep failed: {e}");
        }

        // Resume an unfinished tick. Its uploads are newer than the published manifest, so the
        // sweep above left them alone.
        if let Some(working) = checkpoint::load(&self.redis, &manifest).await {
            info!(
                version = manifest.version,
                "data dump: resuming the unfinished tick from its checkpoint"
            );
            manifest = working;
            manifest.public_url = self.config.public_url.trim_end_matches('/').to_owned();
        }

        // The policies filter protected accounts out of the INVOKER views for the dump user.
        update_row_policy(&self.pg, &self.ch_admin).await?;

        let now_hi = exporter
            .fetch_i64(&sql::now_hi(self.config.lag_secs), "now")
            .await?;
        let fold_due = manifest
            .last_fold_at
            .is_none_or(|t| Utc::now().signed_duration_since(t) > FOLD_EVERY);

        let mut first_error: Option<DumpError> = None;
        for table in TABLES {
            shutdown_check()?;
            let result = match table.policy {
                Policy::Snapshot => {
                    self.export_snapshot(&exporter, &mut manifest, table, now_hi)
                        .await
                }
                Policy::Incremental { .. } => {
                    self.export_incremental(&exporter, &mut manifest, table, now_hi, fold_due)
                        .await
                }
            };
            if let Err(e) = result {
                error!("data dump: table {} failed: {e}", table.name);
                if matches!(e, DumpError::Shutdown) {
                    return Err(e);
                }
                first_error.get_or_insert(e);
            }
            checkpoint::save(&self.redis, &manifest).await;
        }
        if fold_due {
            manifest.last_fold_at = Some(Utc::now());
        }

        let next_version = manifest.version.saturating_add(1);
        if manifest
            .tables
            .values()
            .any(|t| t.status == TableStatus::Ready)
        {
            match self.build_catalog(&manifest, next_version, run_id).await {
                Ok((key, duckdb_version)) => {
                    manifest.catalog = Some(key);
                    manifest.duckdb_version = Some(duckdb_version);
                }
                Err(e) => {
                    error!("data dump: catalog build failed, keeping the previous catalog: {e}");
                    first_error.get_or_insert(e);
                }
            }
        }

        manifest.version = next_version;
        manifest.generated_at = Some(Utc::now());
        manifest::publish(&self.store, &manifest_key, &manifest, e_tag.as_deref()).await?;
        checkpoint::clear(&self.redis).await;
        info!(
            version = manifest.version,
            url = manifest.url(&manifest_key),
            tables = ?manifest
                .tables
                .iter()
                .map(|(n, t)| format!("{n}:{:?}:{}files", t.status, t.published_files().len()))
                .collect::<Vec<_>>(),
            "data dump manifest published"
        );
        first_error.map_or(Ok(()), Err)
    }

    /// Deletes data files and catalogs `manifest`, published at `published_at`, no longer
    /// references.
    async fn sweep(
        &self,
        manifest: &Manifest,
        published_at: DateTime<Utc>,
    ) -> Result<(), DumpError> {
        let referenced: HashSet<String> = manifest.referenced_keys().map(str::to_owned).collect();
        sweep::sweep(&self.store, &self.key("tables/"), &referenced, published_at).await?;
        let catalogs: HashSet<String> = manifest.catalog.iter().cloned().collect();
        sweep::sweep(&self.store, &self.key("catalog/"), &catalogs, published_at).await?;
        Ok(())
    }

    async fn fetch_columns(
        &self,
        exporter: &Exporter,
        table: &str,
    ) -> Result<Vec<Column>, DumpError> {
        #[derive(clickhouse::Row, serde::Deserialize)]
        struct ColumnRow {
            name: String,
            #[serde(rename = "type")]
            ch_type: String,
            comment: String,
        }
        Ok(exporter
            .ch
            .query(&sql::columns(table))
            .fetch_all::<ColumnRow>()
            .await?
            .into_iter()
            .map(|c| Column {
                name: c.name,
                ch_type: c.ch_type,
                comment: (!c.comment.is_empty()).then_some(c.comment),
            })
            .collect())
    }

    async fn export_snapshot(
        &self,
        exporter: &Exporter,
        manifest: &mut Manifest,
        table: &TablePolicy,
        now_hi: i64,
    ) -> Result<(), DumpError> {
        let columns = self.fetch_columns(exporter, table.name).await?;
        let key = self.key(&format!(
            "tables/{}/snapshot/{}-{}.parquet",
            table.name,
            ts(now_hi),
            exporter.run_id
        ));
        let sql = sql::snapshot_export(&self.config.named_collection, table.name, &key);
        let Some(written) = exporter
            .export(&sql, &key, &format!("{}-snapshot", table.name))
            .await?
        else {
            warn!(
                "data dump: {} is empty; keeping the previous snapshot",
                table.name
            );
            return Ok(());
        };
        let state = manifest
            .tables
            .entry(table.name.to_owned())
            .or_insert_with(|| TableState::new(PolicyKind::Snapshot, Vec::new()));
        state.columns = columns;
        state.status = TableStatus::Ready;
        state.watermark_hi = Some(now_hi);
        state.files = vec![FileEntry {
            key,
            kind: FileKind::Snapshot,
            generation: 0,
            partition: None,
            lo: None,
            hi: Some(now_hi),
            rows: written.rows,
            bytes: written.bytes,
            rows_by_partition: BTreeMap::new(),
            built_at: Utc::now(),
        }];
        Ok(())
    }

    /// Takes the table's state out of `manifest` for the export and puts it back however the
    /// export ends, so a failed table still publishes the progress it made.
    async fn export_incremental(
        &self,
        exporter: &Exporter,
        manifest: &mut Manifest,
        table: &TablePolicy,
        now_hi: i64,
        fold_due: bool,
    ) -> Result<(), DumpError> {
        let name = table.name;
        let columns = self.fetch_columns(exporter, name).await?;
        let mut state = manifest
            .tables
            .remove(name)
            .unwrap_or_else(|| TableState::new(PolicyKind::Incremental, columns.clone()));
        adopt_columns(name, &mut state, columns);
        let result = self
            .export_incremental_state(exporter, manifest, &mut state, table, now_hi, fold_due)
            .await;
        manifest.tables.insert(name.to_owned(), state);
        result
    }

    /// Saves `manifest` with `state` as the table `name` as the tick's checkpoint.
    async fn checkpoint(&self, manifest: &Manifest, name: &str, state: &TableState) {
        let mut working = manifest.clone();
        working.tables.insert(name.to_owned(), state.clone());
        checkpoint::save(&self.redis, &working).await;
    }

    #[expect(clippy::too_many_lines, reason = "one sequential export pipeline")]
    async fn export_incremental_state(
        &self,
        exporter: &Exporter,
        manifest: &Manifest,
        state: &mut TableState,
        table: &TablePolicy,
        now_hi: i64,
        fold_due: bool,
    ) -> Result<(), DumpError> {
        let Policy::Incremental {
            watermark,
            partition_expr,
            chunk_column,
        } = table.policy
        else {
            return Ok(());
        };
        let nc = self.config.named_collection.as_str();
        let name = table.name;
        state.watermark = Some(watermark.to_owned());
        state.partition_expr = Some(partition_expr.to_owned());
        let generations: Vec<u32> = (state.generation > 0)
            .then_some(state.generation)
            .into_iter()
            .chain(state.building)
            .collect();

        // Hourly deltas. The first run only sets the watermark: every base built from now on
        // covers everything up to it.
        match state.watermark_hi {
            None => state.watermark_hi = Some(now_hi),
            Some(mut lo) => {
                while lo < now_hi {
                    shutdown_check()?;
                    let hi = lo.saturating_add(HOUR).min(now_hi);
                    let mut entries = Vec::new();
                    for &generation in &generations {
                        let key = self.key(&format!(
                            "tables/{name}/g{generation}/delta/{}-{}-{}.parquet",
                            ts(lo),
                            ts(hi),
                            exporter.run_id
                        ));
                        let sql = sql::delta_export(nc, name, &key, watermark, lo, hi);
                        let step = format!("{name}-g{generation}-delta-{}", ts(hi));
                        let increment = Increment {
                            kind: FileKind::Delta,
                            generation,
                            lo,
                            hi,
                        };
                        if let Some(entry) = exporter
                            .export_increment(&sql, key, &step, partition_expr, increment)
                            .await?
                        {
                            entries.push(entry);
                        }
                    }
                    state.files.extend(entries);
                    state.watermark_hi = Some(hi);
                    lo = hi;
                    self.checkpoint(manifest, name, state).await;
                }
            }
        }
        let watermark_hi = state.watermark_hi.unwrap_or(now_hi);

        // Probe: raw rows per partition in ClickHouse (one column, cheap).
        let actual = exporter
            .partition_counts(
                &sql::table_partition_counts(name, partition_expr),
                &format!("{name}-probe"),
            )
            .await?;

        // Fold hourly deltas older than a day into one residual per generation.
        if fold_due {
            for &generation in &generations {
                let Some(fold) = compaction::plan_fold(
                    state,
                    generation,
                    watermark_hi.saturating_sub(self.config.fold_after_secs),
                ) else {
                    continue;
                };
                shutdown_check()?;
                let cutoffs = compaction::residual_cutoffs(state, generation, fold.lo);
                let key = self.key(&format!(
                    "tables/{name}/g{generation}/residual/{}-{}-{}.parquet",
                    ts(fold.lo),
                    ts(fold.hi),
                    exporter.run_id
                ));
                let sql = sql::residual_export(
                    nc,
                    name,
                    &key,
                    &sql::Residual {
                        partition_expr,
                        watermark,
                        lo: fold.lo,
                        hi: fold.hi,
                        cutoffs: &cutoffs,
                    },
                );
                let step = format!("{name}-g{generation}-residual");
                let increment = Increment {
                    kind: FileKind::Residual,
                    generation,
                    lo: fold.lo,
                    hi: fold.hi,
                };
                if let Some(entry) = exporter
                    .export_increment(&sql, key, &step, partition_expr, increment)
                    .await?
                {
                    state.files.push(entry);
                }
                state.files.retain(|f| !fold.keys.contains(&f.key));
                info!(
                    "data dump: {name} g{generation} folded {} hourly deltas",
                    fold.keys.len()
                );
                self.checkpoint(manifest, name, state).await;
            }
        }

        // Bounded rebuild work on the generation being built, or the current one.
        let target_gen = state.building.unwrap_or(state.generation);
        let params = Params {
            budget: self.config.rebuild_per_tick,
            threshold_divisor: 100,
            threshold_min: 20_000,
            skip_pending_newest: 3,
            max_base_age_secs: self.config.max_base_age_secs,
        };
        let plan = compaction::plan_rebuilds(state, target_gen, &actual, watermark_hi, &params);
        for rebuild in plan {
            shutdown_check()?;
            let p = rebuild.partition;
            let base = BaseExport {
                name,
                generation: target_gen,
                range: sql::BaseRange {
                    partition_expr,
                    partition: p,
                    chunk_column,
                    chunk: compaction::Chunk::default(),
                },
                watermark,
                watermark_hi,
            };
            let estimate = compaction::estimate_base_bytes(
                state,
                p,
                actual.get(&p).copied().unwrap_or_default(),
            );
            // All files of the new base are written before the old ones are replaced, so a
            // failure halfway keeps the old base; its uploads are swept as unreferenced.
            let files = self.export_base(exporter, &base, estimate).await?;
            let chunks = files.len();
            state.files.retain(|f| {
                !(f.kind == FileKind::Base && f.generation == target_gen && f.partition == Some(p))
            });
            state.files.extend(files);
            info!(
                "data dump: {name} g{target_gen} rebuilt partition {p} in {chunks} files ({:?})",
                rebuild.reason
            );
            self.checkpoint(manifest, name, state).await;
        }

        // A building generation becomes current once every partition has a base.
        if let Some(building) = state.building
            && actual.keys().all(|&p| state.base(building, p).is_some())
        {
            info!("data dump: {name} generation {building} is complete");
            state.generation = building;
            state.building = None;
            state.status = TableStatus::Ready;
            state.files.retain(|f| f.generation == building);
        }

        // Drop increments every partition of which a base now covers, and bases of partitions
        // that no longer exist.
        for &generation in &generations {
            let covered = compaction::covered_files(state, generation);
            state.files.retain(|f| !covered.contains(&f.key));
        }
        state.files.retain(|f| {
            f.kind != FileKind::Base || f.partition.is_some_and(|p| actual.contains_key(&p))
        });
        Ok(())
    }

    /// Exports one partition's base as files of at most `compaction::MAX_FILE_BYTES`: split
    /// into chunk-column ranges of about equal row counts by the `estimate`, and any file that
    /// still comes out too big is deleted and exported again in smaller pieces.
    async fn export_base(
        &self,
        exporter: &Exporter,
        base: &BaseExport<'_>,
        estimate: u64,
    ) -> Result<Vec<FileEntry>, DumpError> {
        let BaseExport {
            name,
            generation,
            range,
            watermark,
            watermark_hi,
        } = *base;
        let p = range.partition;
        let step = format!("{name}-g{generation}-base-{p}");
        let mut todo = self
            .split_chunk(
                exporter,
                name,
                &range,
                compaction::chunk_count(estimate),
                &step,
            )
            .await?;
        // Popped from the back: export in chunk-column order.
        todo.reverse();
        let mut files = Vec::new();
        let mut seq = 0u32;
        while let Some(chunk) = todo.pop() {
            shutdown_check()?;
            let range = sql::BaseRange { chunk, ..range };
            let key = self.key(&format!(
                "tables/{name}/g{generation}/base/part-{p}/{}-{}-{seq}.parquet",
                ts(watermark_hi),
                exporter.run_id
            ));
            let sql = sql::base_export(
                &self.config.named_collection,
                name,
                &key,
                &range,
                watermark,
                watermark_hi,
            );
            let chunk_step = format!("{step}-{seq}");
            seq = seq.saturating_add(1);
            let Some(written) = exporter.export(&sql, &key, &chunk_step).await? else {
                continue;
            };
            if written.bytes > compaction::MAX_FILE_BYTES {
                let parts = compaction::chunk_count(written.bytes).max(2);
                let pieces = self
                    .split_chunk(exporter, name, &range, parts, &chunk_step)
                    .await?;
                if pieces.len() > 1 {
                    warn!(
                        key,
                        bytes = written.bytes,
                        "data dump: base file over the size limit; exporting it in {} pieces",
                        pieces.len()
                    );
                    exporter.delete(&key).await?;
                    todo.extend(pieces.into_iter().rev());
                    continue;
                }
                warn!(
                    key,
                    bytes = written.bytes,
                    "data dump: base file over the size limit cannot be split further"
                );
            }
            files.push(FileEntry {
                key,
                kind: FileKind::Base,
                generation,
                partition: Some(p),
                lo: None,
                hi: Some(watermark_hi),
                rows: written.rows,
                bytes: written.bytes,
                rows_by_partition: BTreeMap::new(),
                built_at: Utc::now(),
            });
        }
        Ok(files)
    }

    /// `range`'s chunk cut into up to `parts` pieces at row quantiles of the chunk column.
    async fn split_chunk(
        &self,
        exporter: &Exporter,
        name: &str,
        range: &sql::BaseRange<'_>,
        parts: usize,
        step: &str,
    ) -> Result<Vec<compaction::Chunk>, DumpError> {
        if parts < 2 {
            return Ok(vec![range.chunk]);
        }
        let bounds = exporter
            .fetch_u64s(
                &sql::chunk_bounds(name, range, parts),
                &format!("{step}-bounds"),
            )
            .await?;
        Ok(range.chunk.split(&bounds))
    }

    /// Builds the catalog and uploads it as the versioned and the current object.
    async fn build_catalog(
        &self,
        manifest: &Manifest,
        version: u64,
        run_id: &str,
    ) -> Result<(String, String), DumpError> {
        let dir = self.work_dir.join(run_id);
        let built = tokio::task::spawn_blocking({
            let dir = dir.clone();
            let manifest = manifest.clone();
            let source = self.footer_source.clone();
            move || catalog::build(&dir, &manifest, &source)
        })
        .await?;
        let result = async {
            let built = built?;
            // Shared by both uploads without copying the file.
            let bytes = bytes::Bytes::from(tokio::fs::read(&built.path).await?);
            let versioned = self.key(&format!("catalog/{version}.ducklake"));
            let current = self.key("catalog.ducklake");
            for (key, cache_control) in [
                (&versioned, "max-age=31536000, immutable"),
                (&current, "max-age=60"),
            ] {
                self.store
                    .put_opts(
                        &Path::from(key.as_str()),
                        PutPayload::from(bytes.clone()),
                        PutOptions {
                            attributes: Attributes::from_iter([
                                (Attribute::ContentType, "application/octet-stream"),
                                (Attribute::CacheControl, cache_control),
                            ]),
                            ..Default::default()
                        },
                    )
                    .await?;
            }
            Ok((versioned, built.duckdb_version))
        }
        .await;
        if let Err(e) = tokio::fs::remove_dir_all(&dir).await {
            warn!("data dump: failed to remove {dir:?}: {e}");
        }
        result
    }
}
