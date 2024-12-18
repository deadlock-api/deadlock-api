use clap::Parser;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Pool, Postgres};
use std::fmt::Display;

const POSTGRES_POOL_SIZE: u32 = 10;

#[derive(Parser, Debug, Clone)]
pub struct Config {
    #[clap(
        long,
        env,
        default_value = "redis://localhost:6379",
        help = "{redis|rediss}://[<username>][:<password>@]<hostname>[:port][/<db>]"
    )]
    pub redis_url: String,
    #[clap(long, env, default_value = "http://localhost:8123")]
    pub clickhouse_url: String,
    #[clap(long, env, default_value = "default")]
    pub clickhouse_username: String,
    #[clap(long, env, default_value = "default")]
    pub clickhouse_password: String,
    #[clap(long, env, default_value = "default")]
    pub clickhouse_database: String,
    #[clap(long, env, default_value = "localhost")]
    pub postgres_host: String,
    #[clap(long, env, default_value = "postgres")]
    pub postgres_user: String,
    #[clap(long, env, default_value = "postgres")]
    pub postgres_password: String,
    #[clap(long, env, default_value = "postgres")]
    pub postgres_dbname: String,
    #[clap(
        long,
        env,
        default_value = "false",
        help = "If set to true, only requests with an API key are allowed"
    )]
    pub emergency_mode: bool,
}

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub http_client: reqwest::Client,
    pub redis_client: redis::aio::MultiplexedConnection,
    pub clickhouse_client: clickhouse::Client,
    pub postgres_client: Pool<Postgres>,
}

impl AppState {
    pub async fn from_env() -> Result<AppState, LoadAppStateError> {
        let config = Config::parse();

        // Create an HTTP client
        let http_client = reqwest::Client::new();

        // Create a Redis connection pool
        let redis_client = redis::Client::open(config.redis_url.clone())?
            .get_multiplexed_async_connection()
            .await?;

        // Create a Clickhouse connection pool
        let clickhouse_client = clickhouse::Client::default()
            .with_url(&config.clickhouse_url)
            .with_user(&config.clickhouse_username)
            .with_password(&config.clickhouse_password)
            .with_database(&config.clickhouse_database);

        // Create a Postgres connection pool
        let pg_options = PgConnectOptions::new_without_pgpass()
            .host(&config.postgres_host)
            .username(&config.postgres_user)
            .password(&config.postgres_password)
            .database(&config.postgres_dbname);
        let postgres_client = PgPoolOptions::new()
            .max_connections(POSTGRES_POOL_SIZE)
            .connect_with(pg_options)
            .await?;

        Ok(Self {
            config,
            http_client,
            redis_client,
            clickhouse_client,
            postgres_client,
        })
    }
}

#[derive(Debug)]
pub enum LoadAppStateError {
    RedisError(redis::RedisError),
    SqlxError(sqlx::Error),
}

impl From<redis::RedisError> for LoadAppStateError {
    fn from(e: redis::RedisError) -> Self {
        Self::RedisError(e)
    }
}

impl From<sqlx::Error> for LoadAppStateError {
    fn from(e: sqlx::Error) -> Self {
        Self::SqlxError(e)
    }
}

impl Display for LoadAppStateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RedisError(e) => write!(f, "Redis error: {}", e),
            Self::SqlxError(e) => write!(f, "SQLx error: {}", e),
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use redis::AsyncCommands;

    #[tokio::test]
    async fn test_load_app_state() {
        let mut state = AppState::from_env().await.unwrap();
        assert!(state
            .redis_client
            .exists::<&str, bool>("health_check")
            .await
            .is_ok());
    }
}
