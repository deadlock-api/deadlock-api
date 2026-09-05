use core::time::Duration;
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};

use arc_swap::ArcSwapOption;
use duckdb::arrow::datatypes::SchemaRef;
use duckdb::arrow::record_batch::RecordBatch;
use duckdb::{AccessMode, Config, Connection};
use futures::TryStreamExt;
use object_store::aws::AmazonS3Builder;
use object_store::path::Path;
use object_store::{ObjectMeta, ObjectStore, ObjectStoreExt, RetryConfig};
use regex::Regex;
use tokio::sync::Semaphore;
use tracing::{debug, info, warn};

use super::ddl::parse_ddl;
use crate::context::McpSnapshotConfig;

pub(crate) const DATABASE: &str = "deadlock";
pub(crate) const SCHEMA: &str = "main";
pub(crate) const MAX_ROWS: usize = 1024;
pub(crate) const QUERY_TIMEOUT: Duration = Duration::from_secs(300);
const REFRESH_INTERVAL: Duration = Duration::from_secs(300);
const MAX_CONCURRENT_QUERIES: usize = 4;
const MEMORY_LIMIT: &str = "6GB";
const THREADS: i64 = 4;
const MAX_TEMP_DIRECTORY_SIZE: &str = "8GB";

static PART_SUFFIX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"_\d+$").unwrap());
static IDENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z_][A-Za-z0-9_]*$").unwrap());

#[derive(Debug, thiserror::Error)]
pub enum CatalogError {
    #[error("Object store error: {0}")]
    ObjectStore(#[from] object_store::Error),
    #[error("DuckDB error: {0}")]
    DuckDb(#[from] duckdb::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Catalog build task failed: {0}")]
    Join(#[from] tokio::task::JoinError),
    #[error("Snapshot bucket listing returned no parquet files")]
    Empty,
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

/// A read-only `DuckDB` database of views over one version of the parquet dump.
pub(crate) struct Snapshot {
    /// `Connection` is `!Sync`; queries clone their own connection under the lock.
    conn: Mutex<Connection>,
    dir: PathBuf,
    pub(crate) tables: BTreeMap<String, TableInfo>,
    listing: Vec<ObjectMeta>,
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

/// `DuckDB` views over the public parquet dumps, rebuilt whenever the dump changes.
///
/// Each rebuild writes a fresh database file of views (like `catalog.py` did) and reopens
/// it read-only, so user queries cannot create or modify anything.
pub(crate) struct SnapshotCatalog {
    store: Arc<dyn ObjectStore>,
    /// `{endpoint}/{bucket}/{prefix}`: the only URL prefix queries may read from.
    data_url: String,
    prefix: String,
    work_dir: PathBuf,
    snapshot: ArcSwapOption<Snapshot>,
    query_permits: Semaphore,
}

impl SnapshotCatalog {
    pub(crate) fn new(config: &McpSnapshotConfig) -> Result<Self, CatalogError> {
        let store: Arc<dyn ObjectStore> = Arc::new(
            AmazonS3Builder::new()
                .with_endpoint(&config.endpoint)
                .with_bucket_name(&config.bucket)
                .with_skip_signature(true)
                .with_allow_http(true)
                .with_retry(RetryConfig {
                    max_retries: 3,
                    retry_timeout: Duration::from_secs(10),
                    ..Default::default()
                })
                .build()?,
        );
        let work_dir = std::env::temp_dir().join("deadlock-mcp");
        let _ = std::fs::remove_dir_all(&work_dir);
        std::fs::create_dir_all(&work_dir)?;
        Ok(Self {
            store,
            data_url: format!(
                "{}/{}/{}",
                config.endpoint.trim_end_matches('/'),
                config.bucket,
                config.prefix
            ),
            prefix: config.prefix.clone(),
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
        joined
            .map_err(|_| QueryError::Cancelled)?
            .map_err(QueryError::DuckDb)
    }

    /// Rebuilds the catalog if the dump changed. Returns whether a rebuild happened.
    async fn refresh(&self) -> Result<bool, CatalogError> {
        let prefix = (!self.prefix.is_empty()).then(|| Path::from(self.prefix.as_str()));
        let mut listing: Vec<ObjectMeta> = self.store.list(prefix.as_ref()).try_collect().await?;

        let previous = self.snapshot();
        if let Some(previous) = &previous {
            // rustfs occasionally returns a short listing under load; never drop an object
            // that is still there.
            for meta in &previous.listing {
                if !listing.iter().any(|m| m.location == meta.location)
                    && let Ok(meta) = self.store.head(&meta.location).await
                {
                    warn!(
                        "Snapshot listing omitted {} but it still exists; keeping it",
                        meta.location
                    );
                    listing.push(meta);
                }
            }
        }
        listing.sort_by(|a, b| a.location.cmp(&b.location));
        if previous.is_some_and(|p| p.listing == listing) {
            return Ok(false);
        }

        let snapshot = self.build(listing).await?;
        self.snapshot.store(Some(Arc::new(snapshot)));
        Ok(true)
    }

    async fn build(&self, listing: Vec<ObjectMeta>) -> Result<Snapshot, CatalogError> {
        let files = group_by_table(&listing);
        if files.is_empty() {
            return Err(CatalogError::Empty);
        }
        info!("Rebuilding MCP snapshot catalog: {} tables", files.len());

        let ddl: BTreeMap<String, String> =
            futures::future::try_join_all(files.keys().filter_map(|name| {
                let path = Path::from(format!("{}{name}.sql", self.prefix));
                listing
                    .iter()
                    .any(|meta| meta.location == path)
                    .then_some(async move {
                        let bytes = self.store.get(&path).await?.bytes().await?;
                        Ok::<_, object_store::Error>((
                            name.clone(),
                            String::from_utf8_lossy(&bytes).into_owned(),
                        ))
                    })
            }))
            .await?
            .into_iter()
            .collect();

        let urls: BTreeMap<String, Vec<String>> = files
            .iter()
            .map(|(name, metas)| {
                let urls = metas
                    .iter()
                    .map(|meta| {
                        let key = meta.location.as_ref().trim_start_matches(&*self.prefix);
                        format!("{}{key}", self.data_url)
                    })
                    .collect();
                (name.clone(), urls)
            })
            .collect();
        let dir = self.work_dir.join(uuid::Uuid::new_v4().to_string());
        let db = Database {
            path: dir.join(format!("{DATABASE}.duckdb")),
            work_dir: self.work_dir.clone(),
            data_url: self.data_url.clone(),
        };
        let (conn, tables) = tokio::task::spawn_blocking({
            let dir = dir.clone();
            move || -> Result<_, CatalogError> {
                std::fs::create_dir_all(&dir)?;
                let tables = build_database(&db, &urls, &ddl)?;
                let conn = db.open(AccessMode::ReadOnly)?;
                Ok((conn, tables))
            }
        })
        .await??;
        Ok(Snapshot {
            conn: Mutex::new(conn),
            dir,
            tables,
            listing,
        })
    }
}

struct Database {
    path: PathBuf,
    work_dir: PathBuf,
    data_url: String,
}

impl Database {
    fn dir(&self, name: &str) -> String {
        self.work_dir.join(name).to_string_lossy().into_owned()
    }

    /// Opens the database with the resource limits. Read-only opens are additionally locked
    /// down: the only file system access left is the dump's URL prefix plus `DuckDB`'s own
    /// temp and secret directories, and no setting can be changed afterwards.
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
            conn.execute_batch("INSTALL httpfs; INSTALL icu;")?;
        }
        conn.execute_batch(
            "LOAD httpfs;
             LOAD icu;
             SET autoinstall_known_extensions = false;
             SET autoload_known_extensions = false;
             SET http_retries = 5;
             SET http_retry_wait_ms = 500;
             SET http_retry_backoff = 2;
             SET parquet_metadata_cache = true;",
        )?;
        if read_only {
            conn.execute_batch(&format!(
                "SET allowed_directories = [{}, {}, {}];
                 SET enable_external_access = false;
                 SET lock_configuration = true;",
                sql_str(&format!("{}/", self.dir("tmp"))),
                sql_str(&format!("{}/", self.dir("secrets"))),
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

/// Writes a database of views over the parquet files, with table and column comments,
/// and returns the catalog metadata `list_tables`/`list_columns` serve.
fn build_database(
    db: &Database,
    urls: &BTreeMap<String, Vec<String>>,
    ddl: &BTreeMap<String, String>,
) -> Result<BTreeMap<String, TableInfo>, CatalogError> {
    let conn = db.open(AccessMode::ReadWrite)?;
    for (name, files) in urls {
        let list = files
            .iter()
            .map(|u| sql_str(u))
            .collect::<Vec<_>>()
            .join(", ");
        let options = if files.len() > 1 {
            ", union_by_name => true"
        } else {
            ""
        };
        let view = sql_ident(name);
        conn.execute_batch(&format!(
            "CREATE VIEW {view} AS SELECT * FROM read_parquet([{list}]{options})"
        ))?;
        let (comment, column_types) = ddl.get(name).map_or_else(
            || ("Hourly parquet snapshot".to_owned(), HashMap::default()),
            |ddl| parse_ddl(ddl),
        );
        let comment = format!("{comment}; {} parquet file(s)", files.len());
        conn.execute_batch(&format!("COMMENT ON VIEW {view} IS {}", sql_str(&comment)))?;
        let mut describe = conn.prepare(&format!("DESCRIBE {view}"))?;
        let view_columns: Vec<String> = describe
            .query_map([], |row| row.get(0))?
            .collect::<Result<_, _>>()?;
        for (column, ch_type) in column_types {
            if view_columns.contains(&column) {
                conn.execute_batch(&format!(
                    "COMMENT ON COLUMN {view}.{} IS {}",
                    sql_ident(&column),
                    sql_str(&format!("ClickHouse type: {ch_type}"))
                ))?;
            }
        }
    }

    let mut tables: BTreeMap<String, TableInfo> = conn
        .prepare("SELECT view_name, comment FROM duckdb_views() WHERE NOT internal")?
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
    let mut columns = conn.prepare(
        "SELECT table_name, column_name, data_type, is_nullable, comment
         FROM duckdb_columns() WHERE NOT internal ORDER BY table_name, column_index",
    )?;
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
    let expected: Vec<String> = urls.keys().cloned().collect();
    if built != expected || tables.values().any(|t| t.columns.is_empty()) {
        return Err(CatalogError::Mismatch { built, expected });
    }
    drop(columns);
    conn.close().map_err(|(_, e)| e)?;
    Ok(tables)
}

/// Groups parquet objects into tables: `public/match_player/match_player_12.parquet` and
/// `public/heroes.parquet` become `match_player` and `heroes`.
fn group_by_table(listing: &[ObjectMeta]) -> BTreeMap<String, Vec<ObjectMeta>> {
    let mut tables: BTreeMap<String, Vec<ObjectMeta>> = BTreeMap::new();
    for meta in listing {
        let Some(file) = meta
            .location
            .filename()
            .and_then(|f| f.strip_suffix(".parquet"))
        else {
            continue;
        };
        let name = PART_SUFFIX.replace(file, "");
        if !IDENT.is_match(&name) {
            warn!(
                "Skipping {}: {name:?} is not a valid identifier",
                meta.location
            );
            continue;
        }
        tables
            .entry(name.into_owned())
            .or_default()
            .push(meta.clone());
    }
    tables
}

pub(crate) fn run_query(conn: &Connection, sql: &str) -> duckdb::Result<QueryOutput> {
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
    use chrono::Utc;

    use super::*;

    fn meta(location: &str) -> ObjectMeta {
        ObjectMeta {
            location: Path::from(location),
            last_modified: Utc::now(),
            size: 1,
            e_tag: None,
            version: None,
        }
    }

    #[test]
    fn groups_parts_and_ignores_other_objects() {
        let listing = vec![
            meta("public/heroes.parquet"),
            meta("public/heroes.sql"),
            meta("public/match_player/match_player_10.parquet"),
            meta("public/match_player/match_player_2.parquet"),
            meta("public/db_snapshot.ducklake"),
            meta("public/bad-name.parquet"),
        ];
        let tables = group_by_table(&listing);
        assert_eq!(
            tables.keys().collect::<Vec<_>>(),
            vec!["heroes", "match_player"]
        );
        assert_eq!(tables["match_player"].len(), 2);
    }

    #[test]
    fn read_only_database_rejects_writes_and_settings() {
        let work_dir =
            std::env::temp_dir().join(format!("deadlock-mcp-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&work_dir).unwrap();
        let db = Database {
            path: work_dir.join("deadlock.duckdb"),
            work_dir: work_dir.clone(),
            data_url: "https://s3-cache.deadlock-api.com/db-snapshot/public/".to_owned(),
        };
        let rw = db.open(AccessMode::ReadWrite).unwrap();
        rw.execute_batch("CREATE VIEW v AS SELECT 1 AS a").unwrap();
        rw.close().unwrap();

        let ro = db.open(AccessMode::ReadOnly).unwrap();
        assert_eq!(
            run_query(&ro, "SELECT * FROM v").unwrap().batches[0].num_rows(),
            1
        );
        for sql in [
            "CREATE TABLE foo (a INT)",
            "CREATE VIEW w AS SELECT 2",
            "SET memory_limit = '100GB'",
            "SET enable_external_access = true",
            "INSTALL json",
            "SELECT * FROM read_csv('/etc/passwd')",
            "SELECT * FROM read_text('/proc/self/environ')",
            "SELECT * FROM read_csv('https://s3-cache.deadlock-api.com/other-bucket/x.csv')",
        ] {
            assert!(run_query(&ro, sql).is_err(), "{sql} should be rejected");
        }
        drop(ro);
        std::fs::remove_dir_all(&work_dir).unwrap();
    }
}
