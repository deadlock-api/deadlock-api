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

fn default_clickhouse_native_port() -> u16 {
    9000
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
pub struct Config {
    // ========================================
    // ===== General Application Settings =====
    // ========================================
    #[serde(default)]
    pub emergency_mode: bool,

    pub steam_api_key: String,

    pub internal_api_key: String,

    pub steam_proxy_url: String,

    pub steam_proxy_api_key: String,

    // ========================================
    // ===== Database Connection Settings =====
    // ========================================
    #[serde(default = "default_redis_url")]
    pub redis_url: String,

    pub s3_region: String,
    pub s3_bucket: String,
    pub s3_access_key_id: String,
    pub s3_secret_access_key: String,
    pub s3_endpoint: String,

    pub s3_cache_region: String,
    pub s3_cache_bucket: String,
    pub s3_cache_access_key_id: String,
    pub s3_cache_secret_access_key: String,
    pub s3_cache_endpoint: String,

    #[serde(default = "default_clickhouse_host")]
    pub clickhouse_host: String,
    #[serde(default = "default_clickhouse_http_port")]
    pub clickhouse_http_port: u16,
    #[serde(default = "default_clickhouse_native_port")]
    pub clickhouse_native_port: u16,
    #[serde(default = "default_clickhouse_username")]
    pub clickhouse_username: String,
    pub clickhouse_password: String,
    #[serde(default = "default_clickhouse_dbname")]
    pub clickhouse_dbname: String,

    #[serde(default = "default_postgres_host")]
    pub postgres_host: String,
    #[serde(default = "default_postgres_port")]
    pub postgres_port: u16,
    #[serde(default = "default_postgres_username")]
    pub postgres_username: String,
    pub postgres_password: String,
    #[serde(default = "default_postgres_dbname")]
    pub postgres_dbname: String,
    #[serde(default = "default_postgres_pool_size")]
    pub postgres_pool_size: u32,
}
