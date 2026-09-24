use core::time::Duration;
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};

use arc_swap::ArcSwapOption;
use duckdb::arrow::datatypes::SchemaRef;
use duckdb::arrow::record_batch::RecordBatch;
use duckdb::{AccessMode, Config, Connection};
use regex::Regex;
use tokio::sync::Semaphore;
use tracing::{debug, info, warn};

use crate::context::McpSnapshotConfig;
use crate::services::data_dump::manifest::{Manifest, PolicyKind, TableStatus};

pub(crate) const DATABASE: &str = "deadlock";
pub(crate) const SCHEMA: &str = "main";
pub(crate) const MAX_ROWS: usize = 1024;
pub(crate) const QUERY_TIMEOUT: Duration = Duration::from_secs(300);
const REFRESH_INTERVAL: Duration = Duration::from_secs(300);
const MAX_CONCURRENT_QUERIES: usize = 4;
const MEMORY_LIMIT: &str = "6GB";
/// Remote parquet scans wait on R2, not the CPU: more threads mean more requests in flight.
const THREADS: i64 = 16;
const MAX_TEMP_DIRECTORY_SIZE: &str = "8GB";

static IDENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z_][A-Za-z0-9_]*$").unwrap());

#[derive(Debug, thiserror::Error)]
pub enum CatalogError {
    #[error("Manifest fetch error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Manifest parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("DuckDB error: {0}")]
    DuckDb(#[from] duckdb::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Catalog build task failed: {0}")]
    Join(#[from] tokio::task::JoinError),
    #[error("The data lake manifest lists no ready table")]
    Empty,
    #[error("The data lake manifest has no DuckLake catalog")]
    NoCatalog,
    #[error("Catalog mismatch: built {built:?}, expected {expected:?}")]
    Mismatch {
        built: Vec<String>,
        expected: Vec<String>,
    },
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum QueryError {
    #[error("The snapshot catalog is still loading, retry in a few seconds")]
    NotReady,
    #[error("Query timed out after {} seconds", QUERY_TIMEOUT.as_secs())]
    Timeout,
    #[error("Query execution was cancelled")]
    Cancelled,
    #[error("Only read queries are allowed: SELECT, WITH, FROM, DESCRIBE, SHOW or SUMMARIZE")]
    NotReadOnly,
    #[error(transparent)]
    DuckDb(#[from] duckdb::Error),
}

pub(crate) struct ColumnInfo {
    pub(crate) name: String,
    pub(crate) data_type: String,
    pub(crate) nullable: bool,
    pub(crate) comment: Option<String>,
}

pub(crate) struct TableInfo {
    pub(crate) comment: String,
    pub(crate) columns: Vec<ColumnInfo>,
}

/// A read-only `DuckDB` database of views over one version of the data lake's `DuckLake`
/// catalog.
pub(crate) struct Snapshot {
    /// `Connection` is `!Sync`; queries clone their own connection under the lock.
    conn: Mutex<Connection>,
    dir: PathBuf,
    pub(crate) tables: BTreeMap<String, TableInfo>,
    /// Manifest version the views were built from.
    version: u64,
}

impl Drop for Snapshot {
    fn drop(&mut self) {
        if let Err(e) = std::fs::remove_dir_all(&self.dir) {
            warn!(
                "Failed to remove snapshot database {}: {e}",
                self.dir.display()
            );
        }
    }
}

pub(crate) struct QueryOutput {
    pub(crate) schema: SchemaRef,
    /// At most `MAX_ROWS` rows in total.
    pub(crate) batches: Vec<RecordBatch>,
    pub(crate) truncated: bool,
}

/// `DuckDB` views over the public data lake, rebuilt whenever its manifest changes.
///
/// Each rebuild downloads the lake's `DuckLake` catalog, attaches it as `lake` and writes a
/// fresh database file of annotated views over its tables, then reopens that read-only, so
/// user queries cannot create or modify anything. The catalog's per-file column statistics
/// let `DuckDB` skip every parquet file a `match_id` or `start_time` filter excludes.
pub(crate) struct SnapshotCatalog {
    http: reqwest::Client,
    manifest_url: String,
    work_dir: PathBuf,
    snapshot: ArcSwapOption<Snapshot>,
    query_permits: Semaphore,
}

impl SnapshotCatalog {
    pub(crate) fn new(config: &McpSnapshotConfig) -> Result<Self, CatalogError> {
        let work_dir = std::env::temp_dir().join("deadlock-mcp");
        let _ = std::fs::remove_dir_all(&work_dir);
        std::fs::create_dir_all(&work_dir)?;
        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()?,
            manifest_url: config.manifest_url.clone(),
            work_dir,
            snapshot: ArcSwapOption::empty(),
            query_permits: Semaphore::new(MAX_CONCURRENT_QUERIES),
        })
    }

    pub(crate) fn snapshot(&self) -> Option<Arc<Snapshot>> {
        self.snapshot.load_full()
    }

    pub(crate) fn spawn_refresh_loop(self: Arc<Self>) {
        tokio::spawn(async move {
            loop {
                match self.refresh().await {
                    Ok(true) => info!("MCP snapshot catalog rebuilt"),
                    Ok(false) => debug!("MCP snapshot catalog unchanged"),
                    Err(e) => warn!("MCP snapshot catalog refresh failed: {e}"),
                }
                tokio::time::sleep(REFRESH_INTERVAL).await;
            }
        });
    }

    pub(crate) async fn query(&self, sql: String) -> Result<QueryOutput, QueryError> {
        let snapshot = self.snapshot().ok_or(QueryError::NotReady)?;
        let deadline = tokio::time::Instant::now() + QUERY_TIMEOUT;
        let _permit = tokio::time::timeout_at(deadline, self.query_permits.acquire())
            .await
            .map_err(|_| QueryError::Timeout)?
            .map_err(|_| QueryError::Cancelled)?;
        let conn = snapshot
            .conn
            .lock()
            .map_err(|_| QueryError::Cancelled)?
            .try_clone()?;
        let interrupt = conn.interrupt_handle();
        let task = tokio::task::spawn_blocking(move || {
            // Keeps the database alive while the cloned connection runs.
            let _snapshot = snapshot;
            run_query(&conn, &sql)
        });
        let Ok(joined) = tokio::time::timeout_at(deadline, task).await else {
            interrupt.interrupt();
            return Err(QueryError::Timeout);
        };
        joined.map_err(|_| QueryError::Cancelled)?
    }

    /// Rebuilds the catalog if the lake's manifest changed. Returns whether a rebuild happened.
    async fn refresh(&self) -> Result<bool, CatalogError> {
        let manifest: Manifest = self
            .http
            .get(&self.manifest_url)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        if self
            .snapshot()
            .is_some_and(|p| p.version == manifest.version)
        {
            return Ok(false);
        }
        let catalog = manifest.catalog.as_deref().ok_or(CatalogError::NoCatalog)?;
        let lake = self
            .http
            .get(manifest.url(catalog))
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;
        let snapshot = self.build(&manifest, lake).await?;
        self.snapshot.store(Some(Arc::new(snapshot)));
        Ok(true)
    }

    async fn build(
        &self,
        manifest: &Manifest,
        lake: bytes::Bytes,
    ) -> Result<Snapshot, CatalogError> {
        let tables: BTreeMap<String, TableMeta> = manifest
            .tables
            .iter()
            .filter(|(name, t)| {
                t.status == TableStatus::Ready
                    && IDENT.is_match(name)
                    && !t.published_files().is_empty()
            })
            .map(|(name, t)| {
                let files = t.published_files();
                let export = match t.policy {
                    PolicyKind::Incremental => "incremental export (hourly deltas plus per-partition base files; \
                        a row can appear twice with different `created_at`, the newest wins)",
                    PolicyKind::Snapshot => "hourly full snapshot",
                };
                let table = TableMeta {
                    comment: format!(
                        "ClickHouse table default.{name}, {export}; {} parquet file(s), manifest v{}",
                        files.len(),
                        manifest.version
                    ),
                    column_types: t
                        .columns
                        .iter()
                        .map(|c| {
                            let mut text = format!("ClickHouse type: {}", c.ch_type);
                            if let Some(comment) = &c.comment {
                                text.push_str(". ");
                                text.push_str(comment);
                            }
                            (c.name.clone(), text)
                        })
                        .collect(),
                };
                (name.clone(), table)
            })
            .collect();
        if tables.is_empty() {
            return Err(CatalogError::Empty);
        }
        info!(
            "Rebuilding MCP snapshot catalog from manifest v{}: {} tables",
            manifest.version,
            tables.len()
        );

        let dir = self.work_dir.join(uuid::Uuid::new_v4().to_string());
        let db = Database {
            path: dir.join(format!("{DATABASE}.duckdb")),
            lake_path: dir.join("lake").join("catalog.ducklake"),
            work_dir: self.work_dir.clone(),
            data_url: format!("{}/", manifest.public_url.trim_end_matches('/')),
        };
        let (conn, tables) = tokio::task::spawn_blocking({
            let dir = dir.clone();
            move || -> Result<_, CatalogError> {
                std::fs::create_dir_all(dir.join("lake"))?;
                std::fs::write(&db.lake_path, &lake)?;
                let tables = build_database(&db, &tables)?;
                let conn = db.open(AccessMode::ReadOnly)?;
                Ok((conn, tables))
            }
        })
        .await??;
        Ok(Snapshot {
            conn: Mutex::new(conn),
            dir,
            tables,
            version: manifest.version,
        })
    }
}

/// What the view of one published table is annotated with.
#[derive(Clone)]
struct TableMeta {
    comment: String,
    column_types: HashMap<String, String>,
}

struct Database {
    path: PathBuf,
    /// The downloaded `DuckLake` catalog, attached as `lake` on every open.
    lake_path: PathBuf,
    work_dir: PathBuf,
    data_url: String,
}

impl Database {
    fn dir(&self, name: &str) -> String {
        self.work_dir.join(name).to_string_lossy().into_owned()
    }

    /// Opens the database with the resource limits and the `DuckLake` catalog attached as
    /// `lake`. Read-only opens are additionally locked down: the only file system access
    /// left is the lake's URL prefix, the catalog plus `DuckDB`'s own temp and secret
    /// directories, and no setting can be changed afterwards.
    fn open(&self, access_mode: AccessMode) -> Result<Connection, CatalogError> {
        let read_only = matches!(access_mode, AccessMode::ReadOnly);
        let config = Config::default()
            .access_mode(access_mode)?
            .max_memory(MEMORY_LIMIT)?
            .threads(THREADS)?
            .with("extension_directory", self.dir("extensions"))?
            .with("temp_directory", self.dir("tmp"))?
            .with("secret_directory", self.dir("secrets"))?
            .with("max_temp_directory_size", MAX_TEMP_DIRECTORY_SIZE)?;
        let conn = Connection::open_with_flags(&self.path, config)?;
        if !read_only {
            conn.execute_batch("INSTALL httpfs; INSTALL icu; INSTALL ducklake;")?;
        }
        conn.execute_batch(
            "LOAD httpfs;
             LOAD icu;
             LOAD ducklake;
             SET autoinstall_known_extensions = false;
             SET autoload_known_extensions = false;
             SET http_retries = 5;
             SET http_retry_wait_ms = 500;
             SET http_retry_backoff = 2;
             SET parquet_metadata_cache = true;",
        )?;
        conn.execute_batch(&format!(
            "ATTACH {} AS lake (READ_ONLY);",
            sql_str(&format!("ducklake:{}", self.lake_path.to_string_lossy()))
        ))?;
        if read_only {
            let lake_dir = self
                .lake_path
                .parent()
                .map(|p| format!("{}/", p.to_string_lossy()))
                .unwrap_or_default();
            conn.execute_batch(&format!(
                "SET allowed_directories = [{}, {}, {}, {}];
                 SET enable_external_access = false;
                 SET lock_configuration = true;",
                sql_str(&format!("{}/", self.dir("tmp"))),
                sql_str(&format!("{}/", self.dir("secrets"))),
                sql_str(&lake_dir),
                sql_str(&self.data_url),
            ))?;
        }
        Ok(conn)
    }
}

fn sql_str(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn sql_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

/// Writes a database of views over the tables and views of the attached `DuckLake` catalog,
/// annotated with the manifest's table and column comments, and returns the catalog metadata
/// `list_tables`/`list_columns` serve.
fn build_database(
    db: &Database,
    manifest_tables: &BTreeMap<String, TableMeta>,
) -> Result<BTreeMap<String, TableInfo>, CatalogError> {
    let conn = db.open(AccessMode::ReadWrite)?;
    let lake: Vec<String> = conn
        .prepare(
            "SELECT table_name FROM duckdb_tables() WHERE database_name = 'lake'
             UNION ALL
             SELECT view_name FROM duckdb_views() WHERE database_name = 'lake' AND NOT internal
             ORDER BY 1",
        )?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    let mut expected = Vec::new();
    for name in lake.iter().filter(|n| IDENT.is_match(n)) {
        let Some(meta) = table_meta(manifest_tables, name) else {
            continue;
        };
        let view = sql_ident(name);
        conn.execute_batch(&format!("CREATE VIEW {view} AS SELECT * FROM lake.{view}"))?;
        conn.execute_batch(&format!(
            "COMMENT ON VIEW {view} IS {}",
            sql_str(&meta.comment)
        ))?;
        let mut describe = conn.prepare(&format!("DESCRIBE {view}"))?;
        let view_columns: Vec<String> = describe
            .query_map([], |row| row.get(0))?
            .collect::<Result<_, _>>()?;
        for (column, ch_type) in &meta.column_types {
            if view_columns.contains(column) {
                conn.execute_batch(&format!(
                    "COMMENT ON COLUMN {view}.{} IS {}",
                    sql_ident(column),
                    sql_str(ch_type)
                ))?;
            }
        }
        expected.push(name.clone());
    }

    let mut tables: BTreeMap<String, TableInfo> = conn
        .prepare(&format!(
            "SELECT view_name, comment FROM duckdb_views() WHERE database_name = {}",
            sql_str(DATABASE)
        ))?
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                TableInfo {
                    comment: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    columns: Vec::new(),
                },
            ))
        })?
        .collect::<Result<_, _>>()?;
    let mut columns = conn.prepare(&format!(
        "SELECT table_name, column_name, data_type, is_nullable, comment
         FROM duckdb_columns() WHERE database_name = {} ORDER BY table_name, column_index",
        sql_str(DATABASE)
    ))?;
    for row in columns.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            ColumnInfo {
                name: row.get(1)?,
                data_type: row.get(2)?,
                nullable: row.get(3)?,
                comment: row.get(4)?,
            },
        ))
    })? {
        let (table, column) = row?;
        if let Some(info) = tables.get_mut(&table) {
            info.columns.push(column);
        }
    }
    let built: Vec<String> = tables.keys().cloned().collect();
    if expected.is_empty() || built != expected || tables.values().any(|t| t.columns.is_empty()) {
        return Err(CatalogError::Mismatch { built, expected });
    }
    drop(columns);
    conn.close().map_err(|(_, e)| e)?;
    Ok(tables)
}

/// Annotations for a relation of the catalog: a published table, or the `<table>_latest`
/// view the catalog adds over an incremental table. `None` for anything else.
fn table_meta(manifest_tables: &BTreeMap<String, TableMeta>, name: &str) -> Option<TableMeta> {
    if let Some(meta) = manifest_tables.get(name) {
        return Some(meta.clone());
    }
    let base = name.strip_suffix("_latest")?;
    let meta = manifest_tables.get(base)?;
    Some(TableMeta {
        comment: format!(
            "`{base}` with duplicates resolved: only the newest `created_at` row per \
             (`match_id`, `account_id`) is kept. Filters on `match_id`, `account_id` and \
             `start_time` are pushed below the deduplication."
        ),
        column_types: meta.column_types.clone(),
    })
}

/// Whether every statement of `sql` only reads. `DuckDB`'s own parser decides: it
/// serializes SELECT statements (which DESCRIBE, SHOW and SUMMARIZE are) and nothing else.
/// Syntax errors pass, so preparing the query reports them. The read-only database already
/// rejects writes; this keeps a query from detaching the catalog for everyone else.
fn is_read_only(conn: &Connection, sql: &str) -> duckdb::Result<bool> {
    let error_type: Option<String> = conn.query_row(
        "SELECT json_extract_string(json_serialize_sql(?::VARCHAR), '$.error_type')",
        [sql],
        |row| row.get(0),
    )?;
    Ok(error_type.as_deref() != Some("not implemented"))
}

pub(crate) fn run_query(conn: &Connection, sql: &str) -> Result<QueryOutput, QueryError> {
    if !is_read_only(conn, sql)? {
        return Err(QueryError::NotReadOnly);
    }
    let mut stmt = conn.prepare(sql)?;
    let mut batches = Vec::new();
    let mut remaining = MAX_ROWS;
    let mut truncated = false;
    for batch in stmt.query_arrow([])? {
        if batch.num_rows() > remaining {
            batches.push(batch.slice(0, remaining));
            truncated = true;
            break;
        }
        remaining -= batch.num_rows();
        batches.push(batch);
    }
    Ok(QueryOutput {
        schema: stmt.schema(),
        batches,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A database whose `DuckLake` catalog holds table `t` (data under `data/`) and view
    /// `t_latest`, the way the data dump publishes them.
    fn test_database() -> (Database, PathBuf) {
        let work_dir =
            std::env::temp_dir().join(format!("deadlock-mcp-test-{}", uuid::Uuid::new_v4()));
        let data_dir = work_dir.join("data");
        std::fs::create_dir_all(work_dir.join("lake")).unwrap();
        let db = Database {
            path: work_dir.join("deadlock.duckdb"),
            lake_path: work_dir.join("lake").join("catalog.ducklake"),
            work_dir: work_dir.clone(),
            data_url: format!("{}/", data_dir.to_string_lossy()),
        };
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(&format!(
            "INSTALL ducklake; LOAD ducklake;
             ATTACH {} AS l (DATA_PATH {});
             CREATE TABLE l.t AS SELECT 1 AS match_id, 2 AS account_id;
             CREATE VIEW l.t_latest AS SELECT * FROM l.t;
             DETACH l;",
            sql_str(&format!("ducklake:{}", db.lake_path.to_string_lossy())),
            sql_str(&db.data_url),
        ))
        .unwrap();
        (db, work_dir)
    }

    #[test]
    fn views_cover_the_catalog_tables_and_latest_views() {
        let (db, work_dir) = test_database();
        let meta = TableMeta {
            comment: "table t".to_owned(),
            column_types: HashMap::from([(
                "match_id".to_owned(),
                "ClickHouse type: UInt64".to_owned(),
            )]),
        };
        let tables = build_database(&db, &BTreeMap::from([("t".to_owned(), meta)])).unwrap();
        assert_eq!(tables.keys().collect::<Vec<_>>(), ["t", "t_latest"]);
        assert_eq!(tables["t"].comment, "table t");
        assert!(tables["t_latest"].comment.contains("newest"));
        assert_eq!(
            tables["t_latest"].columns[0].comment.as_deref(),
            Some("ClickHouse type: UInt64")
        );

        let ro = db.open(AccessMode::ReadOnly).unwrap();
        let out = run_query(&ro, "SELECT * FROM t_latest").unwrap();
        assert_eq!(out.batches[0].num_rows(), 1);
        drop(ro);
        std::fs::remove_dir_all(&work_dir).unwrap();
    }

    #[test]
    fn read_only_database_rejects_writes_and_settings() {
        let (db, work_dir) = test_database();
        let rw = db.open(AccessMode::ReadWrite).unwrap();
        rw.execute_batch("CREATE VIEW v AS SELECT * FROM lake.t")
            .unwrap();
        rw.close().unwrap();

        let ro = db.open(AccessMode::ReadOnly).unwrap();
        assert_eq!(
            run_query(&ro, "SELECT * FROM v").unwrap().batches[0].num_rows(),
            1
        );
        for sql in [
            "CREATE TABLE foo (a INT)",
            "CREATE VIEW w AS SELECT 2",
            "INSERT INTO lake.t VALUES (3, 4)",
            "SET memory_limit = '100GB'",
            "SET enable_external_access = true",
            "INSTALL json",
            "DETACH lake",
            "/* x */ DETACH lake",
            "SELECT 1; DETACH lake",
            "USE lake",
            "PRAGMA version",
            "SELECT * FROM read_csv('/etc/passwd')",
            "SELECT * FROM read_text('/proc/self/environ')",
            "SELECT * FROM read_csv('https://s3-cache.deadlock-api.com/other-bucket/x.csv')",
        ] {
            assert!(run_query(&ro, sql).is_err(), "{sql} should be rejected");
        }
        for sql in [
            "DESCRIBE v",
            "SHOW TABLES",
            "SUMMARIZE v",
            "FROM v",
            "SELECT FROM WHERE",
        ] {
            assert!(
                !matches!(run_query(&ro, sql), Err(QueryError::NotReadOnly)),
                "{sql} should pass the read-only check"
            );
        }
        assert_eq!(
            run_query(&ro, "SELECT count(*) FROM lake.t")
                .unwrap()
                .batches[0]
                .num_rows(),
            1,
            "the catalog must still be attached"
        );
        drop(ro);
        std::fs::remove_dir_all(&work_dir).unwrap();
    }
}
