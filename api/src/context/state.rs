use core::time::Duration;
use std::collections::HashMap;
use std::fs::File;
use std::io;

use object_store::aws::{AmazonS3, AmazonS3Builder};
use object_store::{BackoffConfig, ClientOptions, RetryConfig};
use serde::Deserialize;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Pool, Postgres};
use thiserror::Error;
use tracing::{debug, warn};

use crate::context::config::Config;
use crate::services::assets::client::AssetsClient;
use crate::services::rate_limiter::RateLimitClient;
use crate::services::steam::client::SteamClient;

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
    pub(crate) redis_client: redis::aio::MultiplexedConnection,
    pub(crate) ch_client: clickhouse::Client,
    pub(crate) ch_client_ro: clickhouse::Client,
    pub(crate) ch_client_restricted: clickhouse::Client,
    pub(crate) pg_client: Pool<Postgres>,
    pub(crate) feature_flags: FeatureFlags,
    pub(crate) steam_client: SteamClient,
    pub(crate) assets_client: AssetsClient,
    pub(crate) rate_limit_client: RateLimitClient,
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

        // Create an S3 cache client
        debug!("Creating S3 cache client");
        let s3_cache_client = AmazonS3Builder::new()
            .with_region(&config.s3_cache.region)
            .with_bucket_name(&config.s3_cache.bucket)
            .with_access_key_id(&config.s3_cache.access_key_id)
            .with_secret_access_key(&config.s3_cache.secret_access_key)
            .with_endpoint(&config.s3_cache.endpoint)
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
        let redis_client = redis::Client::open(config.redis.url.clone())?
            .get_multiplexed_async_connection()
            .await?;

        // Create a Clickhouse connection pool
        debug!("Creating Clickhouse client");
        let ch_client = clickhouse::Client::default()
            .with_url(format!(
                "http://{}:{}",
                config.clickhouse.host, config.clickhouse.http_port
            ))
            .with_user(&config.clickhouse.username)
            .with_password(&config.clickhouse.password)
            .with_database(&config.clickhouse.dbname)
            .with_option("output_format_json_quote_64bit_integers", "0")
            .with_option("output_format_json_named_tuples_as_objects", "1")
            .with_option("enable_json_type", "1")
            .with_option("max_execution_time", "20")
            .with_option("enable_named_columns_in_function_tuple", "1");
        if let Err(e) = ch_client.query("SELECT 1").fetch_one::<u8>().await {
            return Err(AppStateError::Clickhouse(e));
        }

        // Create a Clickhouse readonly connection pool
        debug!("Creating readonly Clickhouse client");
        let ch_client_ro = clickhouse::Client::default()
            .with_url(format!(
                "http://{}:{}",
                config.clickhouse.host, config.clickhouse.http_port
            ))
            .with_user(&config.clickhouse.username)
            .with_password(&config.clickhouse.password)
            .with_database(&config.clickhouse.dbname)
            .with_option("output_format_json_quote_64bit_integers", "0")
            .with_option("output_format_json_named_tuples_as_objects", "1")
            .with_option("enable_json_type", "1")
            .with_option("max_execution_time", "20")
            .with_option("enable_named_columns_in_function_tuple", "1")
            .with_option("readonly", "2")
            .with_option("allow_ddl", "0")
            .with_option("allow_introspection_functions", "0");
        if let Err(e) = ch_client_ro.query("SELECT 1").fetch_one::<u8>().await {
            return Err(AppStateError::Clickhouse(e));
        }

        // Create a Clickhouse restricted connection pool
        debug!("Creating restricted Clickhouse client");
        let ch_client_restricted = clickhouse::Client::default()
            .with_url(format!(
                "http://{}:{}",
                config.clickhouse.host, config.clickhouse.http_port
            ))
            .with_user(&config.clickhouse.restricted_username)
            .with_password(&config.clickhouse.restricted_password)
            .with_database(&config.clickhouse.dbname);
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
            config.steam.proxy_url.clone(),
            config.steam.proxy_api_key.clone(),
            config.steam.api_key.clone(),
        );

        // Create an Assets client
        debug!("Creating Assets client");
        let assets_client = AssetsClient::new(config.assets_base_url.clone(), http_client.clone());

        // Create a Rate Limit client
        debug!("Creating Rate Limit client");
        let rate_limit_client = RateLimitClient::new(
            redis_client.clone(),
            pg_client.clone(),
            config.emergency_mode,
        );

        Ok(Self {
            config,
            s3_client,
            s3_cache_client,
            redis_client,
            ch_client,
            ch_client_ro,
            ch_client_restricted,
            pg_client,
            feature_flags,
            steam_client,
            assets_client,
            rate_limit_client,
        })
    }
}
