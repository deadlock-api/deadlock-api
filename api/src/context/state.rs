use crate::context::config::Config;
use crate::services::assets::client::AssetsClient;
use crate::services::rate_limiter::RateLimitClient;
use crate::services::steam::client::SteamClient;
use object_store::aws::AmazonS3Builder;
use object_store::{BackoffConfig, ClientOptions, RetryConfig};
use serde::Deserialize;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Pool, Postgres};
use std::collections::HashMap;
use std::fs::File;
use std::io;
use std::time::Duration;
use thiserror::Error;
use tracing::{debug, warn};

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
    ParsingConfig(#[from] envy::Error),
    #[error("Parsing Json error: {0}")]
    ParsingJson(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct FeatureFlags {
    pub routes: HashMap<String, bool>,
}

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub http_client: reqwest::Client,
    pub s3_client: object_store::aws::AmazonS3,
    pub s3_cache_client: object_store::aws::AmazonS3,
    pub s3_db_snapshot_client: object_store::aws::AmazonS3,
    pub redis_client: redis::aio::MultiplexedConnection,
    pub ch_client: clickhouse::Client,
    pub pg_client: Pool<Postgres>,
    pub feature_flags: FeatureFlags,
    pub steam_client: SteamClient,
    pub assets_client: AssetsClient,
    pub rate_limit_client: RateLimitClient,
}

impl AppState {
    pub async fn from_env() -> Result<AppState, AppStateError> {
        let config: Config = envy::from_env()?;

        // Create an HTTP client
        debug!("Creating HTTP client");
        let http_client = reqwest::Client::new();

        // Create an S3 client
        debug!("Creating S3 client");
        let s3_client = AmazonS3Builder::new()
            .with_region(&config.s3_region)
            .with_bucket_name(&config.s3_bucket)
            .with_access_key_id(&config.s3_access_key_id)
            .with_secret_access_key(&config.s3_secret_access_key)
            .with_endpoint(&config.s3_endpoint)
            .with_allow_http(true)
            .with_client_options(
                ClientOptions::default()
                    .with_allow_http2()
                    .with_timeout(Duration::from_secs(5)),
            )
            .with_retry(RetryConfig {
                backoff: BackoffConfig {
                    init_backoff: Duration::from_millis(10),
                    max_backoff: Duration::from_secs(3),
                    base: 2.,
                },
                max_retries: 3,
                retry_timeout: Duration::from_secs(5),
            })
            .build()?;

        // Create an S3 cache file-cache client
        debug!("Creating S3 cache client");
        let s3_cache_client = AmazonS3Builder::new()
            .with_region(&config.s3_cache_region)
            .with_bucket_name(&config.s3_cache_bucket)
            .with_access_key_id(&config.s3_cache_access_key_id)
            .with_secret_access_key(&config.s3_cache_secret_access_key)
            .with_endpoint(&config.s3_cache_endpoint)
            .with_allow_http(true)
            .with_client_options(
                ClientOptions::default()
                    .with_allow_http2()
                    .with_timeout(Duration::from_secs(5)),
            )
            .with_retry(RetryConfig {
                backoff: BackoffConfig {
                    init_backoff: Duration::from_millis(10),
                    max_backoff: Duration::from_secs(3),
                    base: 2.,
                },
                max_retries: 3,
                retry_timeout: Duration::from_secs(5),
            })
            .build()?;

        // Create an S3 db-snapshot client
        debug!("Creating S3 db-snapshot client");
        let s3_db_snapshot_client = AmazonS3Builder::new()
            .with_region(&config.s3_db_snapshot_region)
            .with_bucket_name(&config.s3_db_snapshot_bucket)
            .with_access_key_id(&config.s3_db_snapshot_access_key_id)
            .with_secret_access_key(&config.s3_db_snapshot_secret_access_key)
            .with_endpoint(&config.s3_db_snapshot_endpoint)
            .with_allow_http(true)
            .with_client_options(
                ClientOptions::default()
                    .with_allow_http2()
                    .with_timeout(Duration::from_secs(5)),
            )
            .with_retry(RetryConfig {
                backoff: BackoffConfig {
                    init_backoff: Duration::from_millis(10),
                    max_backoff: Duration::from_secs(3),
                    base: 2.,
                },
                max_retries: 3,
                retry_timeout: Duration::from_secs(5),
            })
            .build()?;

        // Create a Redis connection pool
        debug!("Creating Redis client");
        let redis_client = redis::Client::open(config.redis_url.clone())?
            .get_multiplexed_async_connection()
            .await?;

        // Create a Clickhouse connection pool
        debug!("Creating Clickhouse client");
        let ch_client = clickhouse::Client::default()
            .with_url(format!(
                "http://{}:{}",
                config.clickhouse_host, config.clickhouse_http_port
            ))
            .with_user(&config.clickhouse_username)
            .with_password(&config.clickhouse_password)
            .with_database(&config.clickhouse_dbname)
            .with_option("output_format_json_quote_64bit_integers", "0")
            .with_option("output_format_json_named_tuples_as_objects", "1")
            .with_option("enable_json_type", "1")
            .with_option("max_execution_time", "20")
            .with_option("enable_named_columns_in_function_tuple", "1");
        if let Err(e) = ch_client.query("SELECT 1").fetch_one::<u8>().await {
            return Err(AppStateError::Clickhouse(e));
        }

        // Create a Postgres connection pool
        debug!("Creating PostgreSQL client");
        let pg_options = PgConnectOptions::new_without_pgpass()
            .host(&config.postgres_host)
            .port(config.postgres_port)
            .username(&config.postgres_username)
            .password(&config.postgres_password)
            .database(&config.postgres_dbname);
        let pg_client = PgPoolOptions::new()
            .max_connections(config.postgres_pool_size)
            .connect_with(pg_options)
            .await?;

        // Load feature flags
        debug!("Loading feature flags");
        let feature_flags = File::open("../../feature_flags.json")
            .map_err(AppStateError::from)
            .and_then(|f| serde_json::from_reader(f).map_err(AppStateError::from))
            .unwrap_or_else(|e| {
                warn!("Failed to load feature flags: {e}");
                FeatureFlags::default()
            });

        // Create a Steam client
        debug!("Creating Steam client");
        let steam_client = SteamClient::new(
            http_client.clone(),
            config.steam_proxy_url.clone(),
            config.steam_proxy_api_key.clone(),
            config.steam_api_key.clone(),
        );

        // Create an Assets client
        debug!("Creating Assets client");
        let assets_client = AssetsClient::new(http_client.clone());

        // Create a Rate Limit client
        debug!("Creating Rate Limit client");
        let rate_limit_client = RateLimitClient::new(
            redis_client.clone(),
            pg_client.clone(),
            config.emergency_mode,
        );

        Ok(Self {
            config,
            http_client,
            s3_client,
            s3_cache_client,
            s3_db_snapshot_client,
            redis_client,
            ch_client,
            pg_client,
            feature_flags,
            steam_client,
            assets_client,
            rate_limit_client,
        })
    }
}
