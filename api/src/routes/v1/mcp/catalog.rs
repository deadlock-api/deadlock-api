use core::time::Duration;
use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, LazyLock};

use arc_swap::ArcSwapOption;
use datafusion::arrow::datatypes::SchemaRef;
use datafusion::arrow::record_batch::RecordBatch;
use datafusion::catalog::TableProvider;
use datafusion::datasource::file_format::FileFormat;
use datafusion::datasource::file_format::parquet::ParquetFormat;
use datafusion::datasource::listing::{
    ListingOptions, ListingTable, ListingTableConfig, ListingTableUrl,
};
use datafusion::error::DataFusionError;
use datafusion::execution::memory_pool::FairSpillPool;
use datafusion::execution::runtime_env::{RuntimeEnv, RuntimeEnvBuilder};
use datafusion::prelude::{SQLOptions, SessionConfig, SessionContext};
use futures::{StreamExt, TryStreamExt};
use object_store::aws::AmazonS3Builder;
use object_store::path::Path;
use object_store::{ClientOptions, ObjectMeta, ObjectStore, ObjectStoreExt, RetryConfig};
use regex::Regex;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tracing::{debug, info, warn};
use url::Url;

use super::ddl::parse_ddl;
use crate::context::McpSnapshotConfig;

pub(crate) const DATABASE: &str = "deadlock";
pub(crate) const SCHEMA: &str = "main";
pub(crate) const MAX_ROWS: usize = 1024;
pub(crate) const QUERY_TIMEOUT: Duration = Duration::from_secs(300);
const REFRESH_INTERVAL: Duration = Duration::from_secs(300);
const EXECUTOR_THREADS: usize = 4;
const MAX_CONCURRENT_QUERIES: usize = 4;
const TARGET_PARTITIONS: usize = 8;
const MEMORY_LIMIT_BYTES: usize = 6 * 1024 * 1024 * 1024;
const MAX_TEMP_DIRECTORY_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const METADATA_CACHE_BYTES: usize = 512 * 1024 * 1024;
/// Footers of the multi-gigabyte parts are up to ~1 MiB; a hint below that costs extra range
/// requests per file.
const PARQUET_METADATA_SIZE_HINT: usize = 1024 * 1024;

static PART_SUFFIX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"_\d+$").unwrap());
static IDENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z_][A-Za-z0-9_]*$").unwrap());

#[derive(Debug, thiserror::Error)]
pub enum CatalogError {
    #[error("Object store error: {0}")]
    ObjectStore(#[from] object_store::Error),
    #[error("DataFusion error: {0}")]
    DataFusion(#[from] DataFusionError),
    #[error("Invalid snapshot bucket url: {0}")]
    Url(#[from] url::ParseError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Snapshot bucket listing returned no parquet files")]
    Empty,
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
    DataFusion(#[from] DataFusionError),
}

pub(crate) struct TableInfo {
    pub(crate) comment: String,
    pub(crate) schema: SchemaRef,
    /// Column name to `ClickHouse` type from the dumped DDL.
    pub(crate) column_types: HashMap<String, String>,
}

pub(crate) struct Snapshot {
    ctx: SessionContext,
    pub(crate) tables: BTreeMap<String, TableInfo>,
    listing: Vec<ObjectMeta>,
}

pub(crate) struct QueryOutput {
    pub(crate) schema: SchemaRef,
    /// At most `MAX_ROWS` rows in total.
    pub(crate) batches: Vec<RecordBatch>,
    pub(crate) truncated: bool,
}

/// `DataFusion` tables over the public parquet dumps, rebuilt whenever the dump changes.
///
/// Queries run on a dedicated small runtime so CPU-heavy scans never occupy the API's
/// request workers.
pub(crate) struct SnapshotCatalog {
    store: Arc<dyn ObjectStore>,
    bucket_url: Url,
    prefix: String,
    runtime: Arc<RuntimeEnv>,
    executor: &'static tokio::runtime::Runtime,
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
                // Range reads on the multi-gigabyte parts outlive the 30s client default; the
                // query timeout still bounds the whole request.
                .with_client_options(ClientOptions::new().with_timeout(QUERY_TIMEOUT))
                .with_retry(RetryConfig {
                    max_retries: 3,
                    retry_timeout: Duration::from_secs(10),
                    ..Default::default()
                })
                .build()?,
        );
        let bucket_url = Url::parse(&format!("s3://{}", config.bucket))?;
        let runtime = RuntimeEnvBuilder::new()
            .with_memory_pool(Arc::new(FairSpillPool::new(MEMORY_LIMIT_BYTES)))
            .with_max_temp_directory_size(MAX_TEMP_DIRECTORY_BYTES)
            .with_metadata_cache_limit(METADATA_CACHE_BYTES)
            .build_arc()?;
        runtime.register_object_store(&bucket_url, Arc::clone(&store));
        // Leaked on purpose: dropping a runtime from inside the main runtime panics at shutdown.
        let executor = Box::leak(Box::new(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(EXECUTOR_THREADS)
                .thread_name("mcp-query")
                .enable_all()
                .build()?,
        ));
        Ok(Self {
            store,
            bucket_url,
            prefix: config.prefix.clone(),
            runtime,
            executor,
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
        tokio::time::timeout(QUERY_TIMEOUT, async {
            let _permit = self
                .query_permits
                .acquire()
                .await
                .map_err(|_| QueryError::Cancelled)?;
            // A JoinSet aborts the query when the caller stops waiting (timeout, disconnect).
            let mut tasks = JoinSet::new();
            tasks.spawn_on(
                async move { run_query(&snapshot.ctx, &sql).await },
                self.executor.handle(),
            );
            tasks
                .join_next()
                .await
                .and_then(Result::ok)
                .ok_or(QueryError::Cancelled)?
                .map_err(QueryError::DataFusion)
        })
        .await
        .map_err(|_| QueryError::Timeout)?
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

        let ddl: HashMap<&str, String> =
            futures::future::try_join_all(files.keys().filter_map(|name| {
                let path = Path::from(format!("{}{name}.sql", self.prefix));
                listing
                    .iter()
                    .any(|meta| meta.location == path)
                    .then_some(async move {
                        let bytes = self.store.get(&path).await?.bytes().await?;
                        Ok::<_, object_store::Error>((
                            name.as_str(),
                            String::from_utf8_lossy(&bytes).into_owned(),
                        ))
                    })
            }))
            .await?
            .into_iter()
            .collect();

        let ctx = SessionContext::new_with_config_rt(session_config(), Arc::clone(&self.runtime));
        let state = ctx.state();
        let format: Arc<dyn FileFormat> = Arc::new(
            ParquetFormat::default().with_metadata_size_hint(Some(PARQUET_METADATA_SIZE_HINT)),
        );
        let mut tables = BTreeMap::new();
        for (name, metas) in &files {
            let urls = metas
                .iter()
                .map(|meta| {
                    ListingTableUrl::parse(format!("{}/{}", self.bucket_url, meta.location))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let options = ListingOptions::new(Arc::clone(&format)).with_file_extension(".parquet");
            let config =
                ListingTableConfig::new_with_multi_paths(urls).with_listing_options(options);
            let config = match config.infer_schema(&state).await {
                Ok(config) => config,
                Err(e) => {
                    warn!("Skipping snapshot table {name}: {e}");
                    continue;
                }
            };
            let table = ListingTable::try_new(config)?
                .with_cache(self.runtime.cache_manager.get_file_statistic_cache());
            let schema = table.schema();
            ctx.register_table(name.as_str(), Arc::new(table))?;

            let (comment, column_types) = ddl.get(name.as_str()).map_or_else(
                || ("Hourly parquet snapshot".to_owned(), HashMap::new()),
                |ddl| parse_ddl(ddl),
            );
            tables.insert(
                name.clone(),
                TableInfo {
                    comment: format!("{comment}; {} parquet file(s)", metas.len()),
                    schema,
                    column_types,
                },
            );
        }
        if tables.is_empty() {
            return Err(CatalogError::Empty);
        }
        Ok(Snapshot {
            ctx,
            tables,
            listing,
        })
    }
}

fn session_config() -> SessionConfig {
    SessionConfig::new()
        .with_default_catalog_and_schema(DATABASE, SCHEMA)
        .with_information_schema(true)
        .with_target_partitions(TARGET_PARTITIONS)
        .set_bool("datafusion.execution.parquet.pushdown_filters", true)
        .set_bool("datafusion.execution.parquet.reorder_filters", true)
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

pub(crate) async fn run_query(
    ctx: &SessionContext,
    sql: &str,
) -> Result<QueryOutput, DataFusionError> {
    let options = SQLOptions::new()
        .with_allow_ddl(false)
        .with_allow_dml(false)
        .with_allow_statements(false);
    let df = ctx.sql_with_options(sql, options).await?;
    let mut stream = df.execute_stream().await?;
    let schema = stream.schema();
    let mut batches = Vec::new();
    let mut remaining = MAX_ROWS;
    let mut truncated = false;
    while let Some(batch) = stream.next().await {
        let batch = batch?;
        if batch.num_rows() > remaining {
            batches.push(batch.slice(0, remaining));
            truncated = true;
            break;
        }
        remaining -= batch.num_rows();
        batches.push(batch);
    }
    Ok(QueryOutput {
        schema,
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
}
