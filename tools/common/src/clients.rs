#[cfg(feature = "clickhouse")]
use clickhouse::Compression;
#[cfg(feature = "redis")]
use fred::clients::Client as RedisClient;
#[cfg(feature = "redis")]
use fred::interfaces::{ClientLike, FredResult};
#[cfg(feature = "redis")]
use fred::prelude::{Config as RedisConfig, ReconnectPolicy};
#[cfg(feature = "object-store")]
use object_store::ClientOptions;
#[cfg(feature = "object-store")]
use object_store::aws::AmazonS3Builder;
#[cfg(feature = "postgres")]
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
#[cfg(feature = "postgres")]
use sqlx::{Pool, Postgres};
use std::env;
use std::time::Duration;

#[cfg(feature = "clickhouse")]
pub fn get_ch_client() -> Result<clickhouse::Client, env::VarError> {
    Ok(clickhouse::Client::default()
        .with_url(env::var("CLICKHOUSE_URL").unwrap_or("http://127.0.0.1:8123".to_string()))
        .with_user(env::var("CLICKHOUSE_USER")?)
        .with_password(env::var("CLICKHOUSE_PASSWORD")?)
        .with_database(env::var("CLICKHOUSE_DB")?)
        .with_compression(Compression::None))
}

#[cfg(feature = "object-store")]
pub fn get_store() -> anyhow::Result<impl object_store::ObjectStore> {
    Ok(AmazonS3Builder::new()
        .with_region(env::var("S3_REGION")?)
        .with_bucket_name(env::var("S3_BUCKET_NAME")?)
        .with_access_key_id(env::var("S3_ACCESS_KEY_ID")?)
        .with_secret_access_key(env::var("S3_SECRET_ACCESS_KEY")?)
        .with_endpoint(env::var("S3_ENDPOINT_URL")?)
        .with_allow_http(true)
        .with_client_options(ClientOptions::default().with_timeout(Duration::from_secs(30)))
        .build()?)
}

#[cfg(feature = "object-store")]
pub fn get_cache_store() -> anyhow::Result<impl object_store::ObjectStore> {
    Ok(AmazonS3Builder::new()
        .with_region(env::var("S3_CACHE_REGION")?)
        .with_bucket_name(env::var("S3_CACHE_BUCKET_NAME")?)
        .with_access_key_id(env::var("S3_CACHE_ACCESS_KEY_ID")?)
        .with_secret_access_key(env::var("S3_CACHE_SECRET_ACCESS_KEY")?)
        .with_endpoint(env::var("S3_CACHE_ENDPOINT_URL")?)
        .with_allow_http(true)
        .with_client_options(ClientOptions::default().with_timeout(Duration::from_secs(30)))
        .build()?)
}

#[cfg(feature = "postgres")]
pub async fn get_pg_client() -> anyhow::Result<Pool<Postgres>> {
    let pg_options = PgConnectOptions::new_without_pgpass()
        .host(&env::var("POSTGRES_HOST").unwrap_or("localhost".to_string()))
        .username(&env::var("POSTGRES_USERNAME").unwrap_or("postgres".to_string()))
        .password(&env::var("POSTGRES_PASSWORD")?)
        .database(&env::var("POSTGRES_DBNAME").unwrap_or("postgres".to_string()));
    Ok(PgPoolOptions::new()
        .max_connections(10)
        .connect_with(pg_options)
        .await?)
}

#[cfg(feature = "redis")]
pub async fn get_redis_client() -> FredResult<RedisClient> {
    let config =
        RedisConfig::from_url(&env::var("REDIS_URL").unwrap_or("redis://127.0.0.1".to_string()))?;
    let reconnect_policy = ReconnectPolicy::new_linear(10, 10000, 100);
    let redis = RedisClient::new(config, None, None, reconnect_policy.into());
    redis.connect();
    redis.wait_for_connect().await?;
    Ok(redis)
}
