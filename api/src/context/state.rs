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
use crate::services::assets::client::AssetsClient;
use crate::services::assets::versions::store::VersionStore;
use crate::services::rank_predictor::RankPredictor;
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
}

#[derive(Debug, Clone, Deserialize, Default)]
pub(crate) struct FeatureFlags {
    pub(crate) routes: HashMap<String, bool>,
}

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) config: Config,
    pub(crate) s3_client: AmazonS3,
    pub(crate) s3_cache_client: AmazonS3,
    pub(crate) r2_client: AmazonS3,
    pub(crate) redis_client: redis::aio::MultiplexedConnection,
    pub(crate) ch_client: clickhouse::Client,
    pub(crate) ch_client_ro: clickhouse::Client,
    /// Read-only client with the query cache enabled, for expensive shared analytics.
    pub(crate) ch_client_cached: clickhouse::Client,
    pub(crate) ch_client_restricted: clickhouse::Client,
    pub(crate) pg_client: Pool<Postgres>,
    pub(crate) feature_flags: FeatureFlags,
    pub(crate) steam_client: SteamClient,
    pub(crate) assets_client: AssetsClient,
    pub(crate) rate_limit_client: RateLimitClient,
    pub(crate) request_logger: Arc<RequestLogger>,
    pub(crate) batchers: Batchers,
    pub(crate) rank_predictor: Option<Arc<RankPredictor>>,
    pub(crate) steam_search_index: SteamSearchIndex,
    pub(crate) version_store: VersionStore,
    pub(crate) demo_query_queue: crate::routes::v1::matches::demo::DemoQueryQueue,
}

impl AppState {
    #[allow(clippy::too_many_lines)]
    pub(crate) async fn from_env() -> Result<AppState, AppStateError> {
        let config = Config::from_env()?;

        // Create an HTTP client
        debug!("Creating HTTP client");
        let http_client = reqwest::Client::new();

        // Create an S3 client
        debug!("Creating S3 client");
        let s3_client = AmazonS3Builder::new()
            .with_region(&config.s3.region)
            .with_bucket_name(&config.s3.bucket)
            .with_access_key_id(&config.s3.access_key_id)
            .with_secret_access_key(&config.s3.secret_access_key)
            .with_endpoint(&config.s3.endpoint)
            .with_allow_http(true)
            .with_retry(RetryConfig {
                backoff: BackoffConfig {
                    init_backoff: Duration::from_millis(200),
                    max_backoff: Duration::from_secs(3),
                    base: 2.,
                },
                max_retries: 3,
                retry_timeout: Duration::from_secs(5),
            })
            .build()?;

        // Create an S3 cache client
        debug!("Creating S3 cache client");
        let s3_cache_client = AmazonS3Builder::new()
            .with_region(&config.s3_cache.region)
            .with_bucket_name(&config.s3_cache.bucket)
            .with_access_key_id(&config.s3_cache.access_key_id)
            .with_secret_access_key(&config.s3_cache.secret_access_key)
            .with_endpoint(&config.s3_cache.endpoint)
            .with_allow_http(true)
            .with_retry(RetryConfig {
                max_retries: 0,
                ..Default::default()
            })
            .build()?;

        // Create a Cloudflare R2 client (S3-compatible)
        debug!("Creating Cloudflare R2 client");
        let r2_client = AmazonS3Builder::new()
            .with_region(&config.r2.region)
            .with_bucket_name(&config.r2.bucket)
            .with_access_key_id(&config.r2.access_key_id)
            .with_secret_access_key(&config.r2.secret_access_key)
            .with_endpoint(config.r2.endpoint())
            .with_retry(RetryConfig {
                backoff: BackoffConfig {
                    init_backoff: Duration::from_millis(200),
                    max_backoff: Duration::from_secs(3),
                    base: 2.,
                },
                max_retries: 3,
                retry_timeout: Duration::from_secs(5),
            })
            .build()?;

        // Create the demo-extracts R2 client (public bucket; reuses the R2 account creds).
        debug!("Creating demo-extracts R2 client");
        let demo_extracts_client = AmazonS3Builder::new()
            .with_region(&config.r2.region)
            .with_bucket_name(&config.demo_extracts_bucket)
            .with_access_key_id(&config.r2.access_key_id)
            .with_secret_access_key(&config.r2.secret_access_key)
            .with_endpoint(config.r2.endpoint())
            .with_retry(RetryConfig {
                backoff: BackoffConfig {
                    init_backoff: Duration::from_millis(200),
                    max_backoff: Duration::from_secs(3),
                    base: 2.,
                },
                max_retries: 3,
                retry_timeout: Duration::from_secs(5),
            })
            .build()?;

        // Create a Redis connection pool
        debug!("Creating Redis client");
        let redis_client = redis::Client::open(config.redis.url.clone())?
            .get_multiplexed_async_connection()
            .await?;

        // Create a Clickhouse connection pool
        debug!("Creating Clickhouse client");
        // The main client never uses the query cache: it backs writes and freshness
        // sensitive background/work-queue reads, which must never serve stale results.
        let ch_client = clickhouse::Client::default()
            .with_url(format!(
                "http://{}:{}",
                config.clickhouse.host, config.clickhouse.http_port
            ))
            .with_user(&config.clickhouse.username)
            .with_password(&config.clickhouse.password)
            .with_database(&config.clickhouse.dbname)
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
            // Cap per-query memory below the server profile default (40 GiB) so a single
            // heavy analytics query cannot, when several overlap, push total RSS into the
            // ~85 GiB server ceiling and trigger overcommit kills of unrelated queries.
            // 25 GiB clears the largest legitimate refresh (~19 GiB) with headroom; spilling
            // is already enabled server-side (max_bytes_before_external_group_by/sort = 20 GiB).
            .with_setting("max_memory_usage", "26843545600");
        if let Err(e) = ch_client
            .query("SELECT 1 SETTINGS log_comment = 'startup_health_check'")
            .fetch_one::<u8>()
            .await
        {
            return Err(AppStateError::Clickhouse(e));
        }

        // Create a Clickhouse readonly connection pool
        debug!("Creating readonly Clickhouse client");
        // Read-only client for per-account, cheap, and non-cacheable analytics reads.
        // No query cache by default; cacheable shared analytics use `ch_client_cached`.
        let ch_client_ro = clickhouse::Client::default()
            .with_url(format!(
                "http://{}:{}",
                config.clickhouse.host, config.clickhouse.http_port
            ))
            .with_user(&config.clickhouse.username)
            .with_password(&config.clickhouse.password)
            .with_database(&config.clickhouse.dbname)
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
            .with_setting("max_memory_usage", "26843545600")
            .with_setting("readonly", "2")
            .with_setting("allow_ddl", "0")
            .with_setting("allow_introspection_functions", "0");
        if let Err(e) = ch_client_ro
            .query("SELECT 1 SETTINGS log_comment = 'startup_health_check'")
            .fetch_one::<u8>()
            .await
        {
            return Err(AppStateError::Clickhouse(e));
        }

        // Opt-in cached client for expensive, shared analytics reads. Built on top of
        // the read-only client, so it inherits readonly/threads/etc. and only adds the
        // query cache. Only endpoints whose results are shared across users and tolerate
        // up to `query_cache_ttl` staleness should use this; per-account, background, and
        // sub-200ms queries stay on `ch_client_ro` so they neither serve stale data nor
        // evict hot analytics entries.
        debug!("Creating cached Clickhouse client");
        let ch_client_cached = ch_client_ro
            .clone()
            .with_setting("use_query_cache", "1")
            .with_setting("query_cache_ttl", "1800")
            .with_setting("query_cache_min_query_duration", "200")
            .with_setting("query_cache_share_between_users", "1")
            .with_setting("query_cache_nondeterministic_function_handling", "save")
            .with_setting("query_cache_system_table_handling", "ignore");

        // Create a Clickhouse restricted connection pool
        debug!("Creating restricted Clickhouse client");
        let ch_client_restricted = clickhouse::Client::default()
            .with_url(format!(
                "http://{}:{}",
                config.clickhouse.host, config.clickhouse.http_port
            ))
            .with_user(&config.clickhouse.restricted_username)
            .with_password(&config.clickhouse.restricted_password)
            .with_database(&config.clickhouse.dbname)
            .with_setting("allow_statistics_optimize", "0")
            .with_setting("max_memory_usage", "26843545600")
            .with_setting("use_query_cache", "0");
        if let Err(e) = ch_client_restricted
            .query("SELECT 1")
            .fetch_one::<u8>()
            .await
        {
            return Err(AppStateError::Clickhouse(e));
        }

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

        // Load rank predictor model (optional – API starts without it if file is missing)
        debug!("Loading rank predictor model");
        let rank_predictor = match RankPredictor::load().await {
            Ok(p) => {
                debug!("Rank predictor loaded successfully");
                Some(Arc::new(p))
            }
            Err(e) => {
                warn!("Rank predictor not loaded (rank-predict endpoint will return 503): {e}");
                None
            }
        };

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
            crate::services::cohort_agg_refresh::spawn_cohort_agg_refresh(ch_client.clone());
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

        Ok(Self {
            config,
            s3_client,
            s3_cache_client,
            r2_client,
            redis_client,
            ch_client,
            ch_client_ro,
            ch_client_cached,
            ch_client_restricted,
            pg_client,
            feature_flags,
            steam_client,
            assets_client,
            rate_limit_client,
            request_logger,
            batchers,
            rank_predictor,
            steam_search_index,
            version_store,
            demo_query_queue,
        })
    }
}
