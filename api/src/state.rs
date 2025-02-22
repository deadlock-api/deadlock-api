use crate::config::Config;
use clap::Parser;
use derive_more::From;
use log::debug;
use object_store::aws::AmazonS3Builder;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Pool, Postgres};
use std::fmt::Display;

#[derive(Debug, From)]
pub enum LoadAppStateError {
    Redis(redis::RedisError),
    ObjectStore(object_store::Error),
    Clickhouse(clickhouse::error::Error),
    PostgreSQL(sqlx::Error),
}
impl Display for LoadAppStateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Redis(e) => write!(f, "Redis error: {}", e),
            Self::ObjectStore(e) => write!(f, "Object store error: {}", e),
            Self::Clickhouse(e) => write!(f, "Clickhouse error: {}", e),
            Self::PostgreSQL(e) => write!(f, "PostgreSQL error: {}", e),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub http_client: reqwest::Client,
    pub s3_client: object_store::aws::AmazonS3,
    pub redis_client: redis::aio::MultiplexedConnection,
    pub clickhouse_client: clickhouse::Client,
    pub postgres_client: Pool<Postgres>,
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
            .build()?;

        // Create a Redis connection pool
        debug!("Creating Redis client");
        let redis_client = redis::Client::open(config.redis_url.clone())?
            .get_multiplexed_async_connection()
            .await?;

        // Create a Clickhouse connection pool
        debug!("Creating Clickhouse client");
        let clickhouse_client = clickhouse::Client::default()
            .with_url(format!(
                "http://{}:{}",
                config.clickhouse_host, config.clickhouse_http_port
            ))
            .with_user(&config.clickhouse_username)
            .with_password(&config.clickhouse_password)
            .with_database(&config.clickhouse_dbname);
        if let Err(e) = clickhouse_client.query("SELECT 1").fetch_one::<u8>().await {
            return Err(LoadAppStateError::Clickhouse(e));
        }

        // Create a Postgres connection pool
        debug!("Creating PostgreSQL client");
        let pg_options = PgConnectOptions::new_without_pgpass()
            .host(&config.postgres_host)
            .username(&config.postgres_username)
            .password(&config.postgres_password)
            .database(&config.postgres_dbname);
        let postgres_client = PgPoolOptions::new()
            .max_connections(config.postgres_pool_size)
            .connect_with(pg_options)
            .await?;

        Ok(Self {
            config,
            http_client,
            s3_client,
            redis_client,
            clickhouse_client,
            postgres_client,
        })
    }
}
