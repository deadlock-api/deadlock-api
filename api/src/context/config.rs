use serde::Deserialize;

use crate::utils::parse::default_true;

#[derive(Deserialize, Debug, Clone)]
pub(super) struct SteamConfig {
    pub(super) api_key: String,
    pub(super) proxy_url: String,
    pub(super) proxy_api_key: String,
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct PatreonConfig {
    pub(crate) client_id: String,
    pub(crate) client_secret: String,
    pub(crate) redirect_uri: String,
    pub(crate) frontend_redirect_url: String,
    pub(crate) campaign_id: String,
    pub(crate) webhook_secret: String,
    #[serde(default = "default_cookie_domains")]
    pub(crate) cookie_domains: Vec<String>,
}

fn default_cookie_domains() -> Vec<String> {
    vec![".deadlock-api.com".to_owned()]
}

fn default_redis_url() -> String {
    "redis://localhost:6379".to_owned()
}

#[derive(Deserialize, Debug, Clone)]
pub(super) struct RedisConfig {
    #[serde(default = "default_redis_url")]
    pub(super) url: String,
}

#[derive(Deserialize, Debug, Clone)]
pub(super) struct S3Config {
    #[serde(default)]
    pub(super) region: String,
    pub(super) bucket: String,
    pub(super) access_key_id: String,
    pub(super) secret_access_key: String,
    pub(super) endpoint: String,
}

fn default_r2_region() -> String {
    "auto".to_owned()
}

#[derive(Deserialize, Debug, Clone)]
pub(super) struct R2Config {
    pub(super) account_id: String,
    pub(super) bucket: String,
    pub(super) access_key_id: String,
    pub(super) secret_access_key: String,
    #[serde(default = "default_r2_region")]
    pub(super) region: String,
    #[serde(default)]
    pub(super) endpoint: Option<String>,
}

impl R2Config {
    pub(super) fn endpoint(&self) -> String {
        self.endpoint
            .clone()
            .unwrap_or_else(|| format!("https://{}.r2.cloudflarestorage.com", self.account_id))
    }
}

fn default_demo_extracts_bucket() -> String {
    "demo-extracts".to_owned()
}

fn default_demo_extracts_public_url() -> String {
    "https://demo-extracts.deadlock-api.com".to_owned()
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
pub(super) struct PostgresConfig {
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

/// Public data lake the MCP server queries: the `manifest.json` written by
/// `services::data_dump` lists every parquet file per table.
#[derive(Deserialize, Debug, Clone)]
#[serde(default)]
pub(crate) struct McpSnapshotConfig {
    pub(crate) manifest_url: String,
}

impl Default for McpSnapshotConfig {
    fn default() -> Self {
        Self {
            manifest_url: "https://data.deadlock-api.com/v1/manifest.json".to_owned(),
        }
    }
}

/// Hourly dump of the public tables to the R2 data lake (`services::data_dump`).
/// Env prefix `DATA_DUMP_`; disabled unless `DATA_DUMP_ENABLED=true`.
#[derive(Deserialize, Debug, Clone)]
#[serde(default)]
pub(crate) struct DataDumpConfig {
    pub(crate) enabled: bool,
    /// R2 bucket the lake lives in and the R2 token that may write to it (the `R2_*` token
    /// is scoped to other buckets).
    pub(crate) bucket: String,
    pub(crate) access_key_id: String,
    pub(crate) secret_access_key: String,
    /// Public base URL of the bucket (custom domain), no trailing slash.
    pub(crate) public_url: String,
    /// Key prefix inside the bucket; bump it for an incompatible layout change.
    pub(crate) prefix: String,
    /// `ClickHouse` named collection holding the same R2 credentials for `INSERT INTO FUNCTION s3`.
    pub(crate) named_collection: String,
    /// `ClickHouse` user that reads the `dump.*` views.
    pub(crate) username: String,
    pub(crate) password: String,
    /// Rows younger than this are left for the next tick (inserts still in flight).
    pub(crate) lag_secs: u64,
    /// Partition rebuilds per hourly tick (~5.5 GiB each for `match_player`).
    pub(crate) rebuild_per_tick: usize,
    /// Hourly deltas older than this are folded into one residual per day.
    pub(crate) fold_after_secs: i64,
    /// Every partition is rebuilt at least this often (self-healing rolling refresh).
    pub(crate) max_base_age_secs: i64,
    pub(crate) lease_ttl_secs: u64,
}

impl Default for DataDumpConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            bucket: "deadlock-data-lake".to_owned(),
            access_key_id: String::new(),
            secret_access_key: String::new(),
            public_url: "https://data.deadlock-api.com".to_owned(),
            prefix: "v1".to_owned(),
            named_collection: "r2_dump".to_owned(),
            username: "dump_user".to_owned(),
            password: String::new(),
            lag_secs: 600,
            rebuild_per_tick: 2,
            fold_after_secs: 24 * 3600,
            max_base_age_secs: 30 * 24 * 3600,
            lease_ttl_secs: 15 * 60,
        }
    }
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct Config {
    #[serde(default)]
    pub(crate) emergency_mode: bool,
    pub(crate) internal_api_key: String,
    pub(super) steam: SteamConfig,
    pub(super) redis: RedisConfig,
    pub(super) s3: S3Config,
    pub(super) s3_cache: S3Config,
    pub(super) r2: R2Config,
    /// Public R2 bucket for demo query extracts. Reuses the `R2_*` account credentials.
    #[serde(default = "default_demo_extracts_bucket")]
    pub(super) demo_extracts_bucket: String,
    /// Public base URL the `demo_extracts_bucket` is served from (no trailing slash).
    #[serde(default = "default_demo_extracts_public_url")]
    pub(crate) demo_extracts_public_url: String,
    pub(crate) clickhouse: ClickhouseConfig,
    pub(super) postgres: PostgresConfig,
    pub(crate) patreon: PatreonConfig,
    pub(crate) jwt_secret: String,
    /// Encryption key for patron tokens (32-byte hex-encoded for AES-256-GCM)
    pub(crate) patron_encryption_key: String,

    #[serde(default)]
    pub(crate) mcp_snapshot: McpSnapshotConfig,
    #[serde(default)]
    pub(crate) data_dump: DataDumpConfig,
}

impl Config {
    pub(super) fn from_env() -> Result<Self, serde_env::Error> {
        serde_env::from_env()
    }
}
