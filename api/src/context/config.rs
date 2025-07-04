use crate::utils::parse::default_true;
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct SteamConfig {
    pub(super) api_key: String,
    pub(super) proxy_url: String,
    pub(super) proxy_api_key: String,
}

fn default_redis_url() -> String {
    "redis://localhost:6379".to_owned()
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct RedisConfig {
    #[serde(default = "default_redis_url")]
    pub(super) url: String,
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct S3Config {
    pub(super) region: String,
    pub(super) bucket: String,
    pub(super) access_key_id: String,
    pub(super) secret_access_key: String,
    pub(super) endpoint: String,
}

fn default_clickhouse_host() -> String {
    "localhost".to_owned()
}

fn default_clickhouse_http_port() -> u16 {
    8123
}

fn default_clickhouse_username() -> String {
    "default".to_owned()
}

fn default_clickhouse_dbname() -> String {
    "default".to_owned()
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct ClickhouseConfig {
    #[serde(default = "default_clickhouse_host")]
    pub(super) host: String,
    #[serde(default = "default_clickhouse_http_port")]
    pub(super) http_port: u16,
    #[serde(default = "default_clickhouse_username")]
    pub(super) username: String,
    pub(super) password: String,
    #[serde(default = "default_clickhouse_dbname")]
    pub(super) dbname: String,
    #[serde(default = "default_clickhouse_username")]
    pub(super) restricted_username: String,
    pub(super) restricted_password: String,
    #[serde(default = "default_true")]
    pub(crate) allow_custom_queries: bool,
}

fn default_postgres_host() -> String {
    "localhost".to_owned()
}

fn default_postgres_port() -> u16 {
    5432
}

fn default_postgres_username() -> String {
    "postgres".to_owned()
}

fn default_postgres_dbname() -> String {
    "postgres".to_owned()
}

fn default_postgres_pool_size() -> u32 {
    10
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct PostgresConfig {
    #[serde(default = "default_postgres_host")]
    pub(super) host: String,
    #[serde(default = "default_postgres_port")]
    pub(super) port: u16,
    #[serde(default = "default_postgres_username")]
    pub(super) username: String,
    pub(super) password: String,
    #[serde(default = "default_postgres_dbname")]
    pub(super) dbname: String,
    #[serde(default = "default_postgres_pool_size")]
    pub(super) pool_size: u32,
}

fn default_assets_base_url() -> String {
    "https://assets.deadlock-api.com".to_owned()
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct Config {
    #[serde(default)]
    pub(super) emergency_mode: bool,
    pub(crate) internal_api_key: String,
    pub(crate) steam: SteamConfig,
    pub(super) redis: RedisConfig,
    pub(super) s3: S3Config,
    pub(super) s3_cache: S3Config,
    pub(crate) clickhouse: ClickhouseConfig,
    pub(super) postgres: PostgresConfig,

    #[serde(default = "default_assets_base_url")]
    pub(super) assets_base_url: String,
}

impl Config {
    pub(crate) fn from_env() -> Result<Self, serde_env::Error> {
        serde_env::from_env()
    }
}
