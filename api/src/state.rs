use crate::config::Config;
use crate::error::LoadAppStateError;
use clap::Parser;
use object_store::aws::AmazonS3Builder;
use object_store::{BackoffConfig, ClientOptions, RetryConfig};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Pool, Postgres};
use std::time::Duration;
use tracing::debug;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub http_client: reqwest::Client,
    pub s3_client: object_store::aws::AmazonS3,
    pub s3_cache_client: object_store::aws::AmazonS3,
    pub redis_client: redis::aio::MultiplexedConnection,
    pub ch_client: clickhouse::Client,
    pub pg_client: Pool<Postgres>,
}

impl AppState {
    pub async fn from_env() -> Result<AppState, LoadAppStateError> {
        let config = Config::parse();

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

        // Create an S3 cache client
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
            .with_option("enable_named_columns_in_function_tuple", "1");
        if let Err(e) = ch_client.query("SELECT 1").fetch_one::<u8>().await {
            return Err(LoadAppStateError::Clickhouse(e));
        }

        // Create a Postgres connection pool
        debug!("Creating PostgreSQL client");
        let pg_options = PgConnectOptions::new_without_pgpass()
            .host(&config.postgres_host)
            .username(&config.postgres_username)
            .password(&config.postgres_password)
            .database(&config.postgres_dbname);
        let pg_client = PgPoolOptions::new()
            .max_connections(config.postgres_pool_size)
            .connect_with(pg_options)
            .await?;

        Ok(Self {
            config,
            http_client,
            s3_client,
            s3_cache_client,
            redis_client,
            ch_client,
            pg_client,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[ignore]
    #[tokio::test]
    async fn test_load_app_state() {
        AppState::from_env().await.expect("Load app state");
    }
}
