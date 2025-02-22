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

    // let aws_store = AmazonS3Builder::new()
    //     .with_region(env::var("HLTV_S3_AWS_REGION")?)
    //     .with_bucket_name(env::var("HLTV_S3_AWS_BUCKET")?)
    //     .with_access_key_id(env::var("HLTV_S3_AWS_ACCESS_KEY_ID")?)
    //     .with_secret_access_key(env::var("HLTV_S3_AWS_SECRET_ACCESS_KEY")?)
    //     .with_endpoint(env::var("HLTV_S3_AWS_ENDPOINT")?)
    //     .with_allow_http(true)
    //     .build()?;
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
