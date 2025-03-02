use clap::Parser;

#[derive(Parser, Debug, Clone)]
pub struct Config {
    // ========================================
    // ===== General Application Settings =====
    // ========================================
    #[clap(
        long,
        env,
        default_value = "false",
        help = "If set to true, only requests with an API key are allowed"
    )]
    pub emergency_mode: bool,

    #[clap(long, env, help = "Steam API Key")]
    pub steam_api_key: String,

    #[clap(long, env, help = "Deadlock API Internal API Key")]
    pub internal_api_key: String,

    #[clap(long, env, help = "The Hook0 Application ID")]
    pub hook0_application_id: String,
    #[clap(long, env, help = "The Hook0 API Key")]
    pub hook0_api_key: String,
    #[clap(long, env, help = "The Hook0 API Url")]
    pub hook0_api_url: String,

    #[clap(long, env, help = "The Steam Proxy URL to use for Steam API requests")]
    pub steam_proxy_url: String,

    #[clap(
        long,
        env,
        help = "The Steam Proxy API key to use for Steam API requests"
    )]
    pub steam_proxy_api_key: String,

    // ========================================
    // ===== Database Connection Settings =====
    // ========================================
    #[clap(
        long,
        env,
        default_value = "redis://localhost:6379",
        help = "{redis|rediss}://[<username>][:<password>@]<hostname>[:port][/<db>]"
    )]
    pub redis_url: String,

    #[clap(long, env)]
    pub s3_region: String,
    #[clap(long, env)]
    pub s3_bucket: String,
    #[clap(long, env)]
    pub s3_access_key_id: String,
    #[clap(long, env)]
    pub s3_secret_access_key: String,
    #[clap(long, env)]
    pub s3_endpoint: String,

    #[clap(long, env)]
    pub s3_cache_region: String,
    #[clap(long, env)]
    pub s3_cache_bucket: String,
    #[clap(long, env)]
    pub s3_cache_access_key_id: String,
    #[clap(long, env)]
    pub s3_cache_secret_access_key: String,
    #[clap(long, env)]
    pub s3_cache_endpoint: String,

    #[clap(long, env, default_value = "localhost")]
    pub clickhouse_host: String,
    #[clap(long, env, default_value = "8123")]
    pub clickhouse_http_port: u16,
    #[clap(long, env, default_value = "9000")]
    pub clickhouse_native_port: u16,
    #[clap(long, env, default_value = "default")]
    pub clickhouse_username: String,
    #[clap(long, env)]
    pub clickhouse_password: String,
    #[clap(long, env, default_value = "default")]
    pub clickhouse_dbname: String,

    #[clap(long, env, default_value = "localhost")]
    pub postgres_host: String,
    #[clap(long, env, default_value = "5432")]
    pub postgres_port: u16,
    #[clap(long, env, default_value = "postgres")]
    pub postgres_username: String,
    #[clap(long, env)]
    pub postgres_password: String,
    #[clap(long, env, default_value = "postgres")]
    pub postgres_dbname: String,
    #[clap(long, env, default_value = "10")]
    pub postgres_pool_size: u32,
}
