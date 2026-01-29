use std::collections::HashMap;

use clickhouse::Row;
use serde::Serialize;
use uuid::Uuid;

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
}
