use serde::Deserialize;

fn default_redis_url() -> String {
    "redis://localhost:6379".to_string()
}

fn default_clickhouse_host() -> String {
    "localhost".to_string()
}

fn default_clickhouse_http_port() -> u16 {
    8123
}

fn default_clickhouse_username() -> String {
    "default".to_string()
}

fn default_clickhouse_dbname() -> String {
    "default".to_string()
}

fn default_postgres_host() -> String {
    "localhost".to_string()
}

fn default_postgres_port() -> u16 {
    5432
}

fn default_postgres_username() -> String {
    "postgres".to_string()
}

fn default_postgres_dbname() -> String {
    "postgres".to_string()
}

fn default_postgres_pool_size() -> u32 {
    10
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct Config {
    // ========================================
    // ===== General Application Settings =====
    // ========================================
    #[serde(default)]
    pub(super) emergency_mode: bool,

    pub(super) steam_api_key: String,

    pub(crate) internal_api_key: String,

    pub(super) steam_proxy_url: String,

    pub(super) steam_proxy_api_key: String,

    // ========================================
    // ===== Database Connection Settings =====
    // ========================================
    #[serde(default = "default_redis_url")]
    pub(super) redis_url: String,

    pub(super) s3_region: String,
    pub(super) s3_bucket: String,
    pub(super) s3_access_key_id: String,
    pub(super) s3_secret_access_key: String,
    pub(super) s3_endpoint: String,

    pub(super) s3_cache_region: String,
    pub(super) s3_cache_bucket: String,
    pub(super) s3_cache_access_key_id: String,
    pub(super) s3_cache_secret_access_key: String,
    pub(super) s3_cache_endpoint: String,

    pub(crate) duckdb_url: Option<String>,

    #[serde(default = "default_clickhouse_host")]
    pub(super) clickhouse_host: String,
    #[serde(default = "default_clickhouse_http_port")]
    pub(super) clickhouse_http_port: u16,
    #[serde(default = "default_clickhouse_username")]
    pub(super) clickhouse_username: String,
    pub(super) clickhouse_password: String,
    #[serde(default = "default_clickhouse_dbname")]
    pub(super) clickhouse_dbname: String,

    #[serde(default = "default_postgres_host")]
    pub(super) postgres_host: String,
    #[serde(default = "default_postgres_port")]
    pub(super) postgres_port: u16,
    #[serde(default = "default_postgres_username")]
    pub(super) postgres_username: String,
    pub(super) postgres_password: String,
    #[serde(default = "default_postgres_dbname")]
    pub(super) postgres_dbname: String,
    #[serde(default = "default_postgres_pool_size")]
    pub(super) postgres_pool_size: u32,
}
