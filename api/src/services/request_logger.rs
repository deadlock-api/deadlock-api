use std::collections::HashMap;

use clickhouse::Row;
use clickhouse_utils::BatchInserter;
use serde::Serialize;
use uuid::Uuid;

/// Buffers [`RequestLog`] rows and batch-inserts them into `request_logs`.
pub(crate) type RequestLogger = BatchInserter<RequestLog>;

#[derive(Debug, Clone, Serialize, Row)]
pub(crate) struct RequestLog {
    /// Timestamp of the request in milliseconds since epoch
    pub timestamp: i64,
    /// HTTP method (GET, POST, etc.)
    pub method: String,
    /// The matched route path pattern (e.g., `/v1/players/:account_id`)
    pub path: String,
    /// The full request URI including query string
    pub uri: String,
    /// Query parameters as key-value pairs
    pub query_params: HashMap<String, String>,
    /// HTTP status code of the response
    pub status_code: u16,
    /// Request duration in milliseconds
    pub duration_ms: u64,
    /// User agent header
    pub user_agent: Option<String>,
    /// API key if provided (without the HEXE- prefix, just the UUID)
    #[serde(with = "clickhouse::serde::uuid::option")]
    pub api_key: Option<Uuid>,
    /// Client IP address
    pub client_ip: Option<String>,
    /// Response body size in bytes
    pub response_size: u64,
    /// Content type of the response
    pub content_type: Option<String>,
    /// Referer header
    pub referer: Option<String>,
    /// Accept header
    pub accept: Option<String>,
    /// Accept-Encoding header
    pub accept_encoding: Option<String>,
    /// Remaining requests in the current rate limit window (None if no rate limiting applied)
    pub rate_limit_remaining: Option<u64>,
    /// Seconds until the rate limit window resets (None if no rate limiting applied)
    pub rate_limit_reset: Option<u64>,
    /// Prefix of the `query_id` of every `ClickHouse` query the GraphQL request ran
    #[serde(with = "clickhouse::serde::uuid::option")]
    pub graphql_request_id: Option<Uuid>,
    /// Validated GraphQL query complexity (None for non-GraphQL requests)
    pub graphql_complexity: Option<u64>,
    /// Validated GraphQL query depth (None for non-GraphQL requests)
    pub graphql_depth: Option<u64>,
    /// GraphQL query text, truncated to 64 KiB (None for non-GraphQL requests)
    pub graphql_query: Option<String>,
    /// GraphQL variables as a JSON object, truncated to 64 KiB
    pub graphql_variables: Option<String>,
}
