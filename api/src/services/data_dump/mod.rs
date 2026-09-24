//! Hourly incremental dump of the public tables to the R2 data lake.
//!
//! One replica (redis lease) runs a tick every hour: hourly delta files for incremental
//! tables, fresh snapshots for the small ones, a bounded amount of partition rebuilds
//! (compaction), a `DuckLake` catalog, and finally a conditional write of `manifest.json`,
//! the only state there is. Any failure leaves the manifest untouched and the next tick
//! resumes from it; objects nobody references are swept a day after they drop out of it.

use core::time::Duration;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use object_store::path::Path;
use object_store::{Attribute, Attributes, ObjectStore, PutOptions, PutPayload};
use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;
use sqlx::{Pool, Postgres};
use tracing::{error, info, warn};

use self::compaction::{Params, Reason};
use self::export::Exporter;
use self::lease::Lease;
use self::manifest::{Column, FileEntry, FileKind, Manifest, PolicyKind, TableState, TableStatus};
use self::policy::{Policy, TABLES, TablePolicy};
use crate::SHUTDOWN_TOKEN;
use crate::context::DataDumpConfig;
use crate::routes::v1::data_privacy::update_row_policy;

pub(crate) mod catalog;
mod compaction;
mod export;
mod lease;
pub(crate) mod manifest;
mod policy;
mod sql;
mod sweep;

const TICK: Duration = Duration::from_secs(3600);
const HOUR: i64 = 3600;
const SWEEP_GRACE: Duration = Duration::from_hours(24);
const CATALOG_RETENTION: Duration = Duration::from_hours(7 * 24);
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
}

pub(crate) struct DataDump {
    pub(crate) config: DataDumpConfig,
    /// `dump_user`: reads the `dump.*` views and writes to R2 through the named collection.
    pub(crate) ch_dump: clickhouse::Client,
    /// Admin client for the GDPR row policies.
    pub(crate) ch_admin: clickhouse::Client,
    pub(crate) pg: Pool<Postgres>,
    pub(crate) redis: MultiplexedConnection,
    pub(crate) store: Arc<dyn ObjectStore>,
    pub(crate) work_dir: PathBuf,
}

fn forced_key(table: &str) -> String {
    format!("data_dump:forced:{table}")
}

/// Queues the partitions holding an account's rows for an immediate rebuild, so a privacy
/// deletion is scrubbed from the lake on the next tick instead of the rolling refresh.
pub(crate) async fn queue_account_scrub(
    mut redis: MultiplexedConnection,
    ch: clickhouse::Client,
    account_id: u32,
) {
    for table in TABLES {
        let Policy::Incremental { partition_expr, .. } = table.policy else {
            continue;
        };
        let partitions = match ch
            .query(&sql::account_partitions(partition_expr, account_id))
            .fetch_all::<u64>()
            .await
        {
            Ok(p) => p,
            Err(e) => {
                warn!("data dump: could not resolve partitions of account {account_id}: {e}");
                continue;
            }
        };
        if partitions.is_empty() {
            continue;
        }
        if let Err(e) = redis
            .sadd::<_, _, ()>(forced_key(table.name), partitions)
            .await
        {
            warn!("data dump: could not queue scrub for account {account_id}: {e}");
        }
    }
}

fn ts(unix: i64) -> String {
    DateTime::from_timestamp(unix, 0).map_or_else(
        || unix.to_string(),
        |d| d.format("%Y%m%dT%H%M%SZ").to_string(),
    )
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
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(TICK);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                tick.tick().await;
                if SHUTDOWN_TOKEN.is_cancelled() {
                    return;
                }
                this.tick().await;
            }
        });
    }

    fn key(&self, rest: &str) -> String {
        format!("{}/{rest}", self.config.prefix.trim_matches('/'))
    }

    async fn tick(&self) {
        let run_id = uuid::Uuid::new_v4().simple().to_string()[..12].to_owned();
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
        match self.run(&run_id).await {
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
            store: self.store.clone(),
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
        let previously_referenced: HashSet<String> =
            manifest.referenced_keys().map(str::to_owned).collect();

        // The policies filter protected accounts out of the INVOKER views for the dump user.
        update_row_policy(&self.pg, &self.ch_admin).await?;

        let now_hi = exporter
            .fetch_i64(&sql::now_hi(self.config.lag_secs), "now")
            .await?;
        let fold_due = manifest
            .last_fold_at
            .is_none_or(|t| Utc::now() - t > FOLD_EVERY);

        let mut first_error: Option<DumpError> = None;
        // Forced partitions rebuilt in this tick. They leave the redis queue only after the
        // manifest referencing their new files is published; a tick that dies before that
        // must rebuild them again, or a privacy scrub would be lost.
        let mut forced_done: Vec<(&'static str, u64)> = Vec::new();
        for table in TABLES {
            shutdown_check()?;
            let result = match table.policy {
                Policy::Snapshot => {
                    self.export_snapshot(&exporter, &mut manifest, table, now_hi)
                        .await
                }
                Policy::Incremental { .. } => {
                    self.export_incremental(
                        &exporter,
                        &mut manifest,
                        table,
                        now_hi,
                        fold_due,
                        &mut forced_done,
                    )
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
        }
        if fold_due {
            manifest.last_fold_at = Some(Utc::now());
        }

        let next_version = manifest.version + 1;
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

        manifest.retire_unreferenced(
            &previously_referenced,
            Utc::now(),
            chrono::Duration::from_std(SWEEP_GRACE).unwrap_or(chrono::Duration::hours(24)),
        );
        manifest.version = next_version;
        manifest.generated_at = Some(Utc::now());
        manifest::publish(&self.store, &manifest_key, &manifest, e_tag.as_deref()).await?;
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
        self.clear_forced(forced_done).await;

        self.sweep(&manifest).await?;

        first_error.map_or(Ok(()), Err)
    }

    /// Deletes data files a day after they left the manifest, and superseded catalogs.
    async fn sweep(&self, manifest: &Manifest) -> Result<(), DumpError> {
        let referenced: HashSet<String> = manifest.referenced_keys().map(str::to_owned).collect();
        sweep::sweep(
            &self.store,
            &self.key("tables/"),
            &referenced,
            &manifest.retired,
            SWEEP_GRACE,
        )
        .await?;
        // A catalog is uploaded in the tick that retires its predecessor, so its upload time
        // is the predecessor's retirement time.
        let catalogs: HashSet<String> = manifest.catalog.iter().cloned().collect();
        sweep::sweep(
            &self.store,
            &self.key("catalog/"),
            &catalogs,
            &BTreeMap::new(),
            CATALOG_RETENTION,
        )
        .await?;
        Ok(())
    }

    async fn clear_forced(&self, done: Vec<(&'static str, u64)>) {
        let mut redis = self.redis.clone();
        for (table, partition) in done {
            if let Err(e) = redis.srem::<_, _, ()>(forced_key(table), partition).await {
                warn!("data dump: could not clear forced partition {table}/{partition}: {e}");
            }
        }
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

    #[expect(clippy::too_many_lines)]
    async fn export_incremental(
        &self,
        exporter: &Exporter,
        manifest: &mut Manifest,
        table: &TablePolicy,
        now_hi: i64,
        fold_due: bool,
        forced_done: &mut Vec<(&'static str, u64)>,
    ) -> Result<(), DumpError> {
        let Policy::Incremental {
            watermark,
            partition_expr,
        } = table.policy
        else {
            return Ok(());
        };
        let nc = self.config.named_collection.as_str();
        let name = table.name;
        let columns = self.fetch_columns(exporter, name).await?;
        let state = manifest
            .tables
            .entry(name.to_owned())
            .or_insert_with(|| TableState::new(PolicyKind::Incremental, columns.clone()));
        state.watermark = Some(watermark.to_owned());
        state.partition_expr = Some(partition_expr.to_owned());
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
                let next = state.generation + 1;
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
                    let hi = (lo + HOUR).min(now_hi);
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
                        if let Some(written) = exporter.export(&sql, &key, &step).await? {
                            let rows_by_partition = exporter
                                .partition_counts(
                                    &sql::file_partition_counts(nc, &key, partition_expr),
                                    &step,
                                )
                                .await?;
                            entries.push(FileEntry {
                                key,
                                kind: FileKind::Delta,
                                generation,
                                partition: None,
                                lo: Some(lo),
                                hi: Some(hi),
                                rows: written.rows,
                                bytes: written.bytes,
                                rows_by_partition,
                                built_at: Utc::now(),
                            });
                        }
                    }
                    state.files.extend(entries);
                    state.watermark_hi = Some(hi);
                    lo = hi;
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
                    watermark_hi - self.config.fold_after_secs,
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
                if let Some(written) = exporter.export(&sql, &key, &step).await? {
                    let rows_by_partition = exporter
                        .partition_counts(
                            &sql::file_partition_counts(nc, &key, partition_expr),
                            &step,
                        )
                        .await?;
                    state.files.push(FileEntry {
                        key,
                        kind: FileKind::Residual,
                        generation,
                        partition: None,
                        lo: Some(fold.lo),
                        hi: Some(fold.hi),
                        rows: written.rows,
                        bytes: written.bytes,
                        rows_by_partition,
                        built_at: Utc::now(),
                    });
                }
                state.files.retain(|f| !fold.keys.contains(&f.key));
                info!(
                    "data dump: {name} g{generation} folded {} hourly deltas",
                    fold.keys.len()
                );
            }
        }

        // Bounded rebuild work on the generation being built, or the current one.
        let target_gen = state.building.unwrap_or(state.generation);
        let forced: BTreeSet<u64> = self
            .redis
            .clone()
            .smembers::<_, Vec<u64>>(forced_key(name))
            .await
            .unwrap_or_default()
            .into_iter()
            .collect();
        let params = Params {
            budget: self.config.rebuild_per_tick,
            threshold_divisor: 100,
            threshold_min: 20_000,
            max_base_age_secs: self.config.max_base_age_secs,
        };
        let plan =
            compaction::plan_rebuilds(state, target_gen, &actual, &forced, watermark_hi, &params);
        for rebuild in plan {
            shutdown_check()?;
            let p = rebuild.partition;
            let key = self.key(&format!(
                "tables/{name}/g{target_gen}/base/part-{p}/{}-{}.parquet",
                ts(watermark_hi),
                exporter.run_id
            ));
            let sql = sql::base_export(nc, name, &key, partition_expr, p, watermark, watermark_hi);
            let written = exporter
                .export(&sql, &key, &format!("{name}-g{target_gen}-base-{p}"))
                .await?;
            state.files.retain(|f| {
                !(f.kind == FileKind::Base && f.generation == target_gen && f.partition == Some(p))
            });
            if let Some(written) = written {
                state.files.push(FileEntry {
                    key,
                    kind: FileKind::Base,
                    generation: target_gen,
                    partition: Some(p),
                    lo: None,
                    hi: Some(watermark_hi),
                    rows: written.rows,
                    bytes: written.bytes,
                    rows_by_partition: BTreeMap::new(),
                    built_at: Utc::now(),
                });
            }
            info!(
                "data dump: {name} g{target_gen} rebuilt partition {p} ({:?})",
                rebuild.reason
            );
            if rebuild.reason == Reason::Forced {
                forced_done.push((name, p));
            }
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
            move || catalog::build(&dir, &manifest)
        })
        .await?;
        let result = async {
            let built = built?;
            let bytes = tokio::fs::read(&built.path).await?;
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
        let _ = tokio::fs::remove_dir_all(&dir).await;
        result
    }
}
