use core::time::Duration;
use std::env;
use std::env::VarError;

use clickhouse::Compression;
use fred::clients::Client as RedisClient;
use fred::interfaces::{ClientLike, FredResult};
use fred::prelude::{Config as RedisConfig, ReconnectPolicy};
use object_store::ClientOptions;
use object_store::aws::AmazonS3Builder;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, Pool, Postgres};
use tracing::log::LevelFilter;

pub fn get_ch_client() -> Result<clickhouse::Client, VarError> {
    Ok(clickhouse::Client::default()
        .with_url(env::var("CLICKHOUSE_URL").unwrap_or("http://127.0.0.1:8123".to_string()))
        .with_user(env::var("CLICKHOUSE_USER")?)
        .with_password(env::var("CLICKHOUSE_PASSWORD")?)
        .with_database(env::var("CLICKHOUSE_DB")?)
        .with_compression(Compression::None))
}

fn build_s3_client(
    region_env: &str,
    bucket_env: &str,
    access_key_env: &str,
    secret_key_env: &str,
    endpoint_env: &str,
) -> anyhow::Result<object_store::aws::AmazonS3> {
    Ok(AmazonS3Builder::new()
        .with_region(env::var(region_env)?)
        .with_bucket_name(env::var(bucket_env)?)
        .with_access_key_id(env::var(access_key_env)?)
        .with_secret_access_key(env::var(secret_key_env)?)
        .with_endpoint(env::var(endpoint_env)?)
        .with_allow_http(true)
        .with_client_options(
            ClientOptions::default()
                .with_timeout(Duration::from_secs(30))
                .with_pool_max_idle_per_host(256),
        )
        .build()?)
}

pub fn get_store() -> anyhow::Result<impl object_store::ObjectStore> {
    build_s3_client(
        "S3_REGION",
        "S3_BUCKET_NAME",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_ENDPOINT_URL",
    )
}

pub fn get_cache_store() -> anyhow::Result<impl object_store::ObjectStore> {
    build_s3_client(
        "S3_CACHE_REGION",
        "S3_CACHE_BUCKET_NAME",
        "S3_CACHE_ACCESS_KEY_ID",
        "S3_CACHE_SECRET_ACCESS_KEY",
        "S3_CACHE_ENDPOINT_URL",
    )
}

pub async fn get_pg_client() -> anyhow::Result<Pool<Postgres>> {
    let pg_options = PgConnectOptions::new_without_pgpass()
        .host(&env::var("POSTGRES_HOST").unwrap_or("localhost".to_string()))
        .username(&env::var("POSTGRES_USERNAME").unwrap_or("postgres".to_string()))
        .password(&env::var("POSTGRES_PASSWORD")?)
        .database(&env::var("POSTGRES_DBNAME").unwrap_or("postgres".to_string()))
        .log_slow_statements(LevelFilter::Warn, Duration::from_secs(5));
    Ok(PgPoolOptions::new()
        .max_connections(10)
        .connect_with(pg_options)
        .await?)
}

pub async fn get_redis_client() -> FredResult<RedisClient> {
    let config =
        RedisConfig::from_url(&env::var("REDIS_URL").unwrap_or("redis://127.0.0.1".to_string()))?;
    let reconnect_policy = ReconnectPolicy::new_linear(10, 10000, 100);
    let redis = RedisClient::new(config, None, None, reconnect_policy.into());
    redis.connect();
    redis.wait_for_connect().await?;
    Ok(redis)
}
