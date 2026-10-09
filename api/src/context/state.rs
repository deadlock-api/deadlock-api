use core::time::Duration;
use std::collections::HashMap;
use std::fs::File;
use std::io;
use std::sync::Arc;

use object_store::aws::{AmazonS3, AmazonS3Builder};
use object_store::{BackoffConfig, RetryConfig};
use serde::Deserialize;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Pool, Postgres};
use thiserror::Error;
use tracing::{debug, warn};

use crate::context::batchers::Batchers;
use crate::context::config::Config;
use crate::routes::v1::mcp::{CatalogError, SnapshotCatalog};
use crate::services::assets::client::AssetsClient;
use crate::services::assets::versions::store::VersionStore;
use crate::services::data_dump::DataDump;
use crate::services::rate_limiter::RateLimitClient;
use crate::services::request_logger::RequestLogger;
use crate::services::steam::client::SteamClient;
use crate::services::steam_search_index::SteamSearchIndex;

#[derive(Debug, Error)]
pub enum AppStateError {
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),
    #[error("Object store error: {0}")]
    ObjectStore(#[from] object_store::Error),
    #[error("Clickhouse error: {0}")]
    Clickhouse(#[from] clickhouse::error::Error),
    #[error("PostgreSQL error: {0}")]
    PostgreSQL(#[from] sqlx::Error),
    #[error("Parsing error: {0}")]
    ParsingConfig(#[from] serde_env::Error),
    #[error("Parsing Json error: {0}")]
    ParsingJson(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("HTTP client error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("MCP catalog error: {0}")]
    McpCatalog(#[from] CatalogError),
}

#[derive(Debug, Clone, Deserialize, Default)]
pub(crate) struct FeatureFlags {
    pub(crate) routes: HashMap<String, bool>,
}

/// Shared application state. Cheap to clone: every `State<AppState>` extraction clones it, so
/// the actual state lives behind a single `Arc`.
#[derive(Clone)]
pub(crate) struct AppState(Arc<AppStateInner>);

impl core::ops::Deref for AppState {
    type Target = AppStateInner;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub(crate) struct AppStateInner {
    pub(crate) config: Config,
    /// Shared outbound HTTP client with connect and total timeouts. Requests that need a
    /// different deadline override it per request with `RequestBuilder::timeout`.
    pub(crate) http_client: reqwest::Client,
    pub(crate) s3_client: AmazonS3,
    pub(crate) s3_cache_client: AmazonS3,
    pub(crate) r2_client: AmazonS3,
    pub(crate) redis_client: redis::aio::MultiplexedConnection,
    pub(crate) ch_client: clickhouse::Client,
    pub(crate) ch_client_ro: clickhouse::Client,
    pub(crate) ch_client_restricted: clickhouse::Client,
    pub(crate) pg_client: Pool<Postgres>,
    pub(crate) feature_flags: FeatureFlags,
    pub(crate) steam_client: SteamClient,
    pub(crate) assets_client: AssetsClient,
    pub(crate) rate_limit_client: RateLimitClient,
    pub(crate) request_logger: Arc<RequestLogger>,
    pub(crate) batchers: Batchers,
    pub(crate) steam_search_index: SteamSearchIndex,
    pub(crate) version_store: VersionStore,
    pub(crate) demo_query_queue: crate::routes::v1::matches::demo::DemoQueryQueue,
    pub(crate) mcp_catalog: Arc<SnapshotCatalog>,
}

impl AppState {
    #[expect(clippy::too_many_lines)]
    pub(crate) async fn from_env() -> Result<AppState, AppStateError> {
        let config = Config::from_env()?;

        // Create an HTTP client
        debug!("Creating HTTP client");
        let http_client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(30))
            .build()?;

        // Create an S3 client
        debug!("Creating S3 client");
        let s3_client = s3_store(
            &config.s3.region,
            &config.s3.bucket,
            &config.s3.access_key_id,
            &config.s3.secret_access_key,
            &config.s3.endpoint,
            retry_config(Duration::from_secs(5)),
        )?;

        // Create an S3 cache client
        debug!("Creating S3 cache client");
        let s3_cache_client = s3_store(
            &config.s3_cache.region,
            &config.s3_cache.bucket,
            &config.s3_cache.access_key_id,
            &config.s3_cache.secret_access_key,
            &config.s3_cache.endpoint,
            RetryConfig {
                max_retries: 0,
                ..Default::default()
            },
        )?;

        // Create a Cloudflare R2 client (S3-compatible)
        debug!("Creating Cloudflare R2 client");
        let r2_client = s3_store(
            &config.r2.region,
            &config.r2.bucket,
            &config.r2.access_key_id,
            &config.r2.secret_access_key,
            &config.r2.endpoint(),
            retry_config(Duration::from_secs(5)),
        )?;

        // Create the demo-extracts R2 client (public bucket; reuses the R2 account creds).
        debug!("Creating demo-extracts R2 client");
        let demo_extracts_client = s3_store(
            &config.r2.region,
            &config.demo_extracts_bucket,
            &config.r2.access_key_id,
            &config.r2.secret_access_key,
            &config.r2.endpoint(),
            // Counts from the start of the initial attempt, so it must exceed the 30s
            // request timeout: a shorter deadline is already expired when a slow
            // multipart part times out, and no retry is ever attempted.
            retry_config(Duration::from_mins(3)),
        )?;

        // Create a Redis connection pool
        debug!("Creating Redis client");
        let redis_client = redis::Client::open(config.redis.url.clone())?
            .get_multiplexed_async_connection()
            .await?;

        debug!("Creating Clickhouse clients");
        let ClickhouseClients {
            main: ch_client,
            read_only: ch_client_ro,
            restricted: ch_client_restricted,
        } = ClickhouseClients::connect(&config).await?;

        // Create a Postgres connection pool
        debug!("Creating PostgreSQL client");
        let pg_options = PgConnectOptions::new_without_pgpass()
            .host(&config.postgres.host)
            .port(config.postgres.port)
            .username(&config.postgres.username)
            .password(&config.postgres.password)
            .database(&config.postgres.dbname);
        let pg_client = PgPoolOptions::new()
            .max_connections(config.postgres.pool_size)
            .connect_with(pg_options)
            .await?;

        // Load feature flags
        debug!("Loading feature flags");
        let feature_flags = File::open("feature_flags.json")
            .inspect_err(|e| warn!("Failed to open feature flags file: {e}"))
            .ok()
            .and_then(|f| {
                serde_json::from_reader(f)
                    .inspect_err(|e| warn!("Failed to parse feature flags: {e}"))
                    .ok()
            })
            .unwrap_or_default();

        // Create a Steam client
        debug!("Creating Steam client");
        let steam_client = SteamClient::new(
            http_client.clone(),
            config
                .steam
                .proxy_url
                .split(',')
                .map(str::trim)
                .map(String::from)
                .collect(),
            config.steam.proxy_api_key.clone(),
            config.steam.api_key.clone(),
        );

        // Create a Rate Limit client
        debug!("Creating Rate Limit client");
        let rate_limit_client = RateLimitClient::new(
            redis_client.clone(),
            pg_client.clone(),
            config.emergency_mode,
        );

        // Create a Request Logger
        debug!("Creating Request Logger");
        let request_logger = Arc::new(RequestLogger::new(ch_client.clone()));

        // Create batchers
        debug!("Creating batchers");
        let batchers = Batchers::new(&ch_client, &ch_client_ro);

        // Start the steam search index. The on-disk index is loaded
        // synchronously (cheap) so search is live immediately after restart;
        // the rebuild loop refreshes every 30 minutes. Path is overridable via
        // the STEAM_SEARCH_INDEX_PATH env var.
        debug!("Starting steam search index");
        let steam_search_index_path: std::path::PathBuf =
            std::env::var_os("STEAM_SEARCH_INDEX_PATH").map_or_else(
                || std::path::PathBuf::from("./data/steam_search_index"),
                std::path::PathBuf::from,
            );
        if let Err(e) = std::fs::create_dir_all(&steam_search_index_path) {
            warn!(
                "could not create steam search index dir {steam_search_index_path:?}: {e} (will retry on first rebuild)"
            );
        }
        let steam_search_index = SteamSearchIndex::new(steam_search_index_path);
        steam_search_index.spawn_refresh_loop(ch_client_ro.clone());

        if !cfg!(debug_assertions) && std::env::var_os("COHORT_AGG_REFRESH_DISABLED").is_none() {
            debug!("Starting cohort agg refresh");
            crate::services::cohort_agg_refresh::spawn_cohort_agg_refresh(
                ch_client.clone(),
                redis_client.clone(),
            );
        }

        // Build the versioned-assets store (R2-backed). Best-effort initial
        // load so /v2/heroes works on the first request post-boot; the
        // background loop keeps it fresh.
        debug!("Initializing versioned assets store");
        let version_store = VersionStore::new();
        if let Err(e) = version_store.ensure_loaded(&r2_client).await {
            warn!("Initial version listing failed (will retry in background): {e}");
        }
        version_store.spawn_refresh_loop(r2_client.clone());

        // Create an Assets client (loads hero/rank metadata in-process from the
        // versioned R2 assets — no external HTTP call).
        debug!("Creating Assets client");
        let assets_client = AssetsClient::new(r2_client.clone(), version_store.clone());

        // Spawn the in-process demo query worker queue.
        debug!("Starting demo query queue");
        let demo_query_queue = crate::routes::v1::matches::demo::DemoQueryQueue::spawn(
            redis_client.clone(),
            demo_extracts_client,
            &config.demo_extracts_public_url,
        );

        debug!("Creating MCP snapshot catalog");
        let mcp_catalog = Arc::new(SnapshotCatalog::new(&config.mcp_snapshot)?);
        mcp_catalog.clone().spawn_refresh_loop();

        if config.data_dump.enabled {
            debug!("Starting data dump");
            spawn_data_dump(&config, &ch_client, &pg_client, &redis_client)?;
        }

        Ok(Self(Arc::new(AppStateInner {
            config,
            http_client,
            s3_client,
            s3_cache_client,
            r2_client,
            redis_client,
            ch_client,
            ch_client_ro,
            ch_client_restricted,
            pg_client,
            feature_flags,
            steam_client,
            assets_client,
            rate_limit_client,
            request_logger,
            batchers,
            steam_search_index,
            version_store,
            demo_query_queue,
            mcp_catalog,
        })))
    }
}

const CH_HEALTH_CHECK: &str = "SELECT 1 SETTINGS log_comment = 'startup_health_check'";

/// The `ClickHouse` clients of [`AppStateInner`].
struct ClickhouseClients {
    main: clickhouse::Client,
    read_only: clickhouse::Client,
    restricted: clickhouse::Client,
}

impl ClickhouseClients {
    /// Builds the clients and health-checks them concurrently, so a misconfigured client fails
    /// startup.
    async fn connect(config: &Config) -> Result<Self, clickhouse::error::Error> {
        // The main client never uses the query cache: it backs writes and freshness
        // sensitive background/work-queue reads, which must never serve stale results.
        let ch_client = clickhouse::Client::default()
            .with_url(config.clickhouse.url())
            .with_user(&config.clickhouse.username)
            .with_password(&config.clickhouse.password)
            .with_database(&config.clickhouse.dbname)
            .with_compression(clickhouse::Compression::zstd())
            .with_setting("output_format_json_quote_64bit_integers", "0")
            .with_setting("output_format_json_named_tuples_as_objects", "1")
            .with_setting("enable_json_type", "1")
            .with_setting("allow_statistics_optimize", "0")
            .with_setting("allow_experimental_statistics", "1")
            .with_setting("query_plan_optimize_join_order_limit", "10")
            .with_setting("optimize_if_transform_strings_to_enum", "1")
            .with_setting("optimize_syntax_fuse_functions", "1")
            .with_setting("allow_aggregate_partitions_independently", "1")
            .with_setting("max_threads", "16")
            .with_setting("max_execution_time", "20")
            .with_setting("enable_named_columns_in_function_tuple", "1")
            .with_setting("do_not_merge_across_partitions_select_final", "1")
            // Keep `ifNull(average_badge, 0)` comparisons matchable against the projection key
            // (see `utils::sql::average_badge_filter`).
            .with_setting("allow_key_condition_coalesce_rewrite", "0")
            // Evaluate skip indexes (e.g. idx_start_time) at planning time: when deferred to read
            // time (the default), projection selection sees unpruned parts and a chosen
            // projection reads every part. Measured on 41 production query shapes: identical
            // results, -17% bytes and -15% CPU volume-weighted, up to 66x on projection reads.
            .with_setting("use_skip_indexes_on_data_read", "0")
            // Cap per-query memory below the server profile default (40 GiB) so a single
            // heavy analytics query cannot, when several overlap, push total RSS into the
            // ~85 GiB server ceiling and trigger overcommit kills of unrelated queries.
            // 25 GiB clears the largest legitimate refresh (~19 GiB) with headroom; spilling
            // is already enabled server-side (max_bytes_before_external_group_by/sort = 20 GiB).
            .with_setting("max_memory_usage", "26843545600");

        // Same connection and settings as the main client, plus read-only enforcement.
        let ch_client_ro = ch_client
            .clone()
            .with_setting("readonly", "2")
            .with_setting("allow_ddl", "0")
            .with_setting("allow_introspection_functions", "0");

        // Runs user-supplied SQL (the `/v1/sql` endpoint).
        let ch_client_restricted = clickhouse::Client::default()
            .with_url(config.clickhouse.url())
            .with_user(&config.clickhouse.restricted_username)
            .with_password(&config.clickhouse.restricted_password)
            .with_database(&config.clickhouse.dbname)
            .with_compression(clickhouse::Compression::zstd())
            .with_setting("allow_statistics_optimize", "0")
            .with_setting("max_memory_usage", "26843545600")
            .with_setting("use_query_cache", "0");

        tokio::try_join!(
            ch_health_check(&ch_client, CH_HEALTH_CHECK),
            ch_health_check(&ch_client_ro, CH_HEALTH_CHECK),
            ch_health_check(&ch_client_restricted, "SELECT 1"),
        )?;

        Ok(Self {
            main: ch_client,
            read_only: ch_client_ro,
            restricted: ch_client_restricted,
        })
    }
}

/// Spawns the hourly public data-lake dump. Only one replica works at a time (redis lease).
fn spawn_data_dump(
    config: &Config,
    ch_client: &clickhouse::Client,
    pg_client: &Pool<Postgres>,
    redis_client: &redis::aio::MultiplexedConnection,
) -> Result<(), object_store::Error> {
    let lake_store = s3_store(
        "auto",
        &config.data_dump.bucket,
        &config.data_dump.access_key_id,
        &config.data_dump.secret_access_key,
        &config.r2.endpoint(),
        retry_config(Duration::from_mins(3)),
    )?;
    let ch_client_dump = clickhouse::Client::default()
        .with_url(config.clickhouse.url())
        .with_user(&config.data_dump.username)
        .with_password(&config.data_dump.password)
        .with_database("dump")
        .with_compression(clickhouse::Compression::zstd())
        // Exports run for up to two hours; keep the HTTP connection busy meanwhile.
        .with_setting("send_progress_in_http_headers", "1")
        .with_setting("http_headers_progress_interval_ms", "10000")
        .with_setting("wait_end_of_query", "1");
    DataDump {
        config: config.data_dump.clone(),
        ch_dump: ch_client_dump,
        ch_admin: ch_client.clone(),
        pg: pg_client.clone(),
        redis: redis_client.clone(),
        store: Arc::new(lake_store),
        work_dir: std::env::temp_dir().join("deadlock-data-dump"),
    }
    .spawn();
    Ok(())
}

/// Runs a trivial query so a misconfigured `ClickHouse` client fails startup.
async fn ch_health_check(
    client: &clickhouse::Client,
    query: &str,
) -> Result<(), clickhouse::error::Error> {
    client.query(query).fetch_one::<u8>().await.map(drop)
}

/// Exponential backoff (200ms..3s, 3 retries) giving up after `retry_timeout`.
fn retry_config(retry_timeout: Duration) -> RetryConfig {
    RetryConfig {
        backoff: BackoffConfig {
            init_backoff: Duration::from_millis(200),
            max_backoff: Duration::from_secs(3),
            base: 2.,
        },
        max_retries: 3,
        retry_timeout,
    }
}

/// An S3-compatible object store client (S3, the S3 cache, R2). Plain HTTP endpoints are allowed.
fn s3_store(
    region: &str,
    bucket: &str,
    access_key_id: &str,
    secret_access_key: &str,
    endpoint: &str,
    retry: RetryConfig,
) -> Result<AmazonS3, object_store::Error> {
    AmazonS3Builder::new()
        .with_region(region)
        .with_bucket_name(bucket)
        .with_access_key_id(access_key_id)
        .with_secret_access_key(secret_access_key)
        .with_endpoint(endpoint)
        .with_allow_http(true)
        .with_retry(retry)
        .build()
}
