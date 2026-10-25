use core::time::Duration;
use std::env;
use std::env::VarError;

use clickhouse::Compression;
use object_store::aws::AmazonS3Builder;
use object_store::local::LocalFileSystem;
use redis::RedisResult;
use redis::aio::{ConnectionManager, ConnectionManagerConfig};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, Pool, Postgres};
use tracing::log::LevelFilter;

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error(transparent)]
    Env(#[from] VarError),
    #[error(transparent)]
    ObjectStore(#[from] object_store::Error),
    #[error(transparent)]
    Postgres(#[from] sqlx::Error),
}

pub fn get_ch_client() -> Result<clickhouse::Client, VarError> {
    Ok(clickhouse::Client::default()
        .with_url(env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://127.0.0.1:8123".to_owned()))
        .with_user(env::var("CLICKHOUSE_USER")?)
        .with_password(env::var("CLICKHOUSE_PASSWORD")?)
        .with_database(env::var("CLICKHOUSE_DB")?)
        .with_compression(Compression::zstd())
        // Disable schema validation: clickhouse 0.15 fetches the table schema via
        // DESCRIBE and parses every column type, but clickhouse-types cannot parse
        // named tuples like `match_player.final_stats Tuple(ability_kills UInt32, ...)`,
        // which made every insert fail with "Unknown data type:  ability_kills UInt32".
        // Disabling validation reverts to plain RowBinary (the pre-0.15 behaviour).
        .with_validation(false))
}

fn build_s3_client(
    region_env: &str,
    bucket_env: &str,
    access_key_env: &str,
    secret_key_env: &str,
    endpoint_env: &str,
) -> Result<object_store::aws::AmazonS3, ClientError> {
    Ok(AmazonS3Builder::new()
        .with_region(env::var(region_env)?)
        .with_bucket_name(env::var(bucket_env)?)
        .with_access_key_id(env::var(access_key_env)?)
        .with_secret_access_key(env::var(secret_key_env)?)
        .with_endpoint(env::var(endpoint_env)?)
        .with_allow_http(true)
        .build()?)
}

pub fn get_store() -> Result<impl object_store::ObjectStore, ClientError> {
    build_s3_client(
        "S3_REGION",
        "S3_BUCKET_NAME",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_ENDPOINT_URL",
    )
}

/// The metadata file cache the API serves recent matches from: a directory shared with the API
/// container (`FILE_CACHE_DIR`), keyed like the bucket it replaced. A host cron deletes files
/// older than 7 days.
pub fn get_cache_store() -> Result<impl object_store::ObjectStore, ClientError> {
    let dir = env::var("FILE_CACHE_DIR")?;
    Ok(LocalFileSystem::new_with_prefix(dir)?)
}

pub async fn get_pg_client() -> Result<Pool<Postgres>, ClientError> {
    let pg_options = PgConnectOptions::new_without_pgpass()
        .host(&env::var("POSTGRES_HOST").unwrap_or_else(|_| "localhost".to_owned()))
        .username(&env::var("POSTGRES_USERNAME").unwrap_or_else(|_| "postgres".to_owned()))
        .password(&env::var("POSTGRES_PASSWORD")?)
        .database(&env::var("POSTGRES_DBNAME").unwrap_or_else(|_| "postgres".to_owned()))
        .log_slow_statements(LevelFilter::Warn, Duration::from_secs(5));
    Ok(PgPoolOptions::new()
        .max_connections(50)
        .connect_with(pg_options)
        .await?)
}

/// Same setup as the API's connection: it reconnects after Redis restarts, and one retry keeps
/// commands failing fast while Redis is down (the default of six makes each one wait ~9.5 s).
/// Startup still fails at once if Redis is down.
pub async fn get_redis_client() -> RedisResult<ConnectionManager> {
    redis::Client::open(env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1".to_owned()))?
        .get_connection_manager_with_config(ConnectionManagerConfig::new().set_number_of_retries(1))
        .await
}
