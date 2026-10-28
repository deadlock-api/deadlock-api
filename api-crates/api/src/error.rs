use core::time::Duration;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Response, header};
use axum::response::IntoResponse;
use clickhouse_utils::BatchError;
use reqwest::StatusCode;
use serde_json::json;
use thiserror::Error;
use tracing::{debug, error, info, warn};

use crate::context::AppStateError;
use crate::services::ch_admission::ChQueryError;
use crate::services::rate_limiter::{Exceeded, RateLimitHeaders, Status};
use crate::services::steam::types::SteamProxyError;
use crosshair::CrosshairError;

pub(super) type APIResult<T> = Result<T, APIError>;

#[derive(Debug, Error)]
pub enum StartupError {
    #[error("Server error: {0}")]
    Server(#[from] axum::Error),
    #[error("IO error: {0}")]
    IO(#[from] std::io::Error),
    #[error("Load app state error: {0}")]
    AppState(#[from] AppStateError),
}

#[derive(Debug, Error)]
pub(super) enum APIError {
    #[error("{message}")]
    StatusMsg { status: StatusCode, message: String },
    #[error("Status {status}")]
    StatusMsgJson {
        status: StatusCode,
        message: serde_json::Value,
    },
    #[error("Rate limit exceeded: {} per {}s", .0.quota.limit, .0.quota.period.as_secs())]
    RateLimitExceeded(Status),
    #[error("Internal server error: {message}")]
    InternalError { message: String },
    #[error("Steam Proxy Error: {0}")]
    SteamProxy(#[from] SteamProxyError),
    #[error("Protobuf Error: {0}")]
    Protobuf(#[from] prost::DecodeError),
    #[error("Base64 Decode Error: {0}")]
    Base64Decode(#[from] base64::DecodeError),
    #[error("Request Error: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Clickhouse Error: {0}")]
    Clickhouse(Arc<clickhouse::error::Error>),
    #[error("Clickhouse Error: {error}")]
    ClickhouseTimedOut {
        error: Arc<clickhouse::error::Error>,
        retry_after: Duration,
    },
    #[error("{0}")]
    ClickhouseBusy(crate::services::ch_admission::Busy),
    #[error("PostgreSQL Error: {0}")]
    PostgreSQL(#[from] sqlx::Error),
    #[error("Redis Error: {0}")]
    Redis(#[from] redis::RedisError),
    #[error("Json De-/Serialization Error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("IO Error: {0}")]
    Io(#[from] std::io::Error),
    #[error("FMT Error: {0}")]
    Fmt(#[from] core::fmt::Error),
    #[error("Snappy Error: {0}")]
    Snappy(#[from] snap::Error),
    #[error("Object Store Error: {0}")]
    ObjectStore(#[from] object_store::Error),
    #[error("{0}")]
    Crosshair(#[from] CrosshairError),
}

impl APIError {
    pub(super) fn status_msg(status: StatusCode, message: impl Into<String>) -> Self {
        Self::StatusMsg {
            status,
            message: message.into(),
        }
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::InternalError {
            message: message.into(),
        }
    }

    /// Whether the same call can succeed when repeated right away.
    pub(crate) const fn is_retryable(&self) -> bool {
        match self {
            Self::SteamProxy(e) => e.is_retryable(),
            _ => true,
        }
    }

    pub(super) fn protected_user() -> Self {
        Self::StatusMsg {
            status: StatusCode::FORBIDDEN,
            message: "The requested user is protected.".to_owned(),
        }
    }
}

impl From<clickhouse::error::Error> for APIError {
    fn from(e: clickhouse::error::Error) -> Self {
        Self::Clickhouse(Arc::new(e))
    }
}

impl From<BatchError> for APIError {
    fn from(e: BatchError) -> Self {
        match e {
            BatchError::NotFound => Self::status_msg(StatusCode::NOT_FOUND, e.to_string()),
            BatchError::Unavailable | BatchError::QueryFailed => Self::internal(e.to_string()),
        }
    }
}

impl From<ChQueryError> for APIError {
    fn from(e: ChQueryError) -> Self {
        match e {
            ChQueryError::Busy(busy) => Self::ClickhouseBusy(busy),
            ChQueryError::Clickhouse(e) => Self::Clickhouse(e),
            ChQueryError::TimedOut { error, retry_after } => {
                Self::ClickhouseTimedOut { error, retry_after }
            }
        }
    }
}

/// Maps any displayable error to [`APIError::internal`], logging the cause first, for failures
/// whose details must not reach the client.
pub(super) trait LogInternal<T> {
    /// Logs `"{context}: {error}"` and maps the error to an internal error carrying `message`.
    fn log_internal(self, context: &str, message: &'static str) -> APIResult<T>;
}

impl<T, E: core::fmt::Display> LogInternal<T> for Result<T, E> {
    fn log_internal(self, context: &str, message: &'static str) -> APIResult<T> {
        self.map_err(|e| {
            error!("{context}: {e}");
            APIError::internal(message)
        })
    }
}

fn build_error_response(status: StatusCode, error: impl serde::Serialize) -> Response<Body> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(
            serde_json::to_string(&json!({
                "status": status.as_u16(),
                "error": error,
            }))
            .unwrap_or_else(|_| "Internal server error".to_owned())
            .into(),
        )
        .unwrap_or_else(|_| "Internal server error".to_owned().into_response())
}

/// Whether a `ClickHouse` error means the query ran into a timeout (client side, or the server's
/// `max_execution_time`), which is reported as `504` rather than a generic internal error.
pub(crate) fn is_query_timeout(e: &clickhouse::error::Error) -> bool {
    match e {
        clickhouse::error::Error::TimedOut => true,
        clickhouse::error::Error::BadResponse(msg) => {
            msg.contains("TIMEOUT_EXCEEDED") || msg.contains("timed out")
        }
        _ => false,
    }
}

/// `wait` in whole seconds for a `Retry-After` header: rounded up and at least 1, as a client
/// that retries after `0` comes back before the wait is over.
pub(crate) fn retry_after_secs(wait: Duration) -> u64 {
    let secs = wait.as_secs();
    let secs = if wait.subsec_nanos() > 0 {
        secs.saturating_add(1)
    } else {
        secs
    };
    secs.max(1)
}

fn query_timeout_response() -> Response<Body> {
    build_error_response(
        StatusCode::GATEWAY_TIMEOUT,
        "Query timed out. Try narrowing your filters or reducing the limit.",
    )
}

/// Logs a response status and message at a level matching the status class.
fn log_status(status: StatusCode, message: &dyn core::fmt::Debug) {
    match status.as_u16() {
        200..=299 => info!(?status, ?message, "Successful response"),
        300..=399 => debug!(?status, ?message, "Redirection"),
        400..=499 => warn!(?status, ?message, "Client error"),
        500..=599 => error!(?status, ?message, "Server error"),
        _ => error!(?status, ?message, "Unexpected status code"),
    }
}

impl From<Exceeded> for APIError {
    fn from(rate_limit::Exceeded(status): Exceeded) -> Self {
        Self::RateLimitExceeded(status)
    }
}

impl IntoResponse for APIError {
    #[expect(clippy::too_many_lines, reason = "one match arm per error variant")]
    fn into_response(self) -> Response<Body> {
        match self {
            Self::StatusMsg { status, message } => {
                log_status(status, &message);
                build_error_response(status, message)
            }
            Self::StatusMsgJson { status, message } => {
                log_status(status, &message);
                build_error_response(status, message)
            }
            Self::RateLimitExceeded(status) => {
                warn!(?status, "Rate limit exceeded");
                let body = build_error_response(
                    StatusCode::TOO_MANY_REQUESTS,
                    json!({
                        "type": status.quota.scope.as_str(),
                        "quota": {
                            "limit": status.quota.limit,
                            "period": status.quota.period.as_secs(),
                        },
                        "requests": status.used,
                        "remaining": status.remaining(),
                        "next_request_in": status.retry_after_secs(),
                    }),
                );
                (RateLimitHeaders(status), body).into_response()
            }
            Self::Crosshair(e) => match e {
                CrosshairError::Encode(_) => Self::internal(e.to_string()).into_response(),
                _ => Self::status_msg(StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            },
            Self::InternalError { message } => {
                error!("Internal Error: {message}");
                build_error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Internal server error: {message}"),
                )
            }
            Self::SteamProxy(e) => {
                let status = e.response_status();
                if status == StatusCode::INTERNAL_SERVER_ERROR {
                    error!("Steam proxy error: {e}");
                } else {
                    warn!("Steam proxy error: {e}");
                }
                let mut res = build_error_response(status, e.response_message());
                if let Some(secs) = e.retry_after_secs() {
                    res.headers_mut().insert(header::RETRY_AFTER, secs.into());
                }
                res
            }
            Self::Protobuf(_) => {
                Self::internal("Failed to parse protobuf message from Steam. Retrying won't help.")
                    .into_response()
            }
            Self::Base64Decode(_) => {
                Self::internal("Failed to decode base64 data. Retrying won't help.").into_response()
            }
            Self::Request(e) => {
                warn!("Request error: {e}");
                build_error_response(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "A needed request failed. Retry your request later.",
                )
            }
            Self::Clickhouse(e) => {
                if is_query_timeout(&e) {
                    warn!("Database query timed out: {e}");
                    query_timeout_response()
                } else {
                    error!("Clickhouse error: {e}");
                    Self::internal("Database error.").into_response()
                }
            }
            Self::ClickhouseTimedOut { error, retry_after } => {
                warn!("Database query timed out: {error}");
                let mut res = query_timeout_response();
                res.headers_mut()
                    .insert(header::RETRY_AFTER, retry_after_secs(retry_after).into());
                res
            }
            Self::ClickhouseBusy(busy) => {
                warn!("Rejected query: {busy}");
                let mut res = build_error_response(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "The database is busy. Retry in a few seconds.",
                );
                res.headers_mut()
                    .insert(header::RETRY_AFTER, header::HeaderValue::from_static("5"));
                res
            }
            Self::PostgreSQL(e) => {
                error!("PostgreSQL error: {e}");
                Self::internal("Database error.").into_response()
            }
            Self::Redis(e) => {
                error!("Redis error: {e}");
                Self::internal("Database error.").into_response()
            }
            Self::ObjectStore(e) => {
                error!("Object store error: {e}");
                Self::internal("Object storage error.").into_response()
            }
            Self::Io(e) => {
                let ch_err = clickhouse::error::Error::from(e);
                if is_query_timeout(&ch_err) {
                    warn!("Database query timed out: {ch_err}");
                    query_timeout_response()
                } else {
                    error!("IO Error: {ch_err}");
                    build_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Internal server error.",
                    )
                }
            }
            Self::Json(e) => {
                error!("JSON error: {e}");
                Self::internal("Serialization error.").into_response()
            }
            Self::Snappy(e) => {
                error!("Snappy error: {e}");
                Self::internal("Serialization error.").into_response()
            }
            Self::Fmt(e) => {
                error!("Format error: {e}");
                Self::internal("Serialization error.").into_response()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use core::time::Duration;

    use axum::http::StatusCode;

    use super::*;

    #[test]
    fn test_api_error_status_msg() {
        let error = APIError::status_msg(StatusCode::BAD_REQUEST, "Invalid input");
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn clickhouse_busy_is_503_with_retry_after() {
        let error = APIError::from(ChQueryError::Busy(
            crate::services::ch_admission::Busy::Timeout,
        ));
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.headers()[header::RETRY_AFTER], "5");
    }

    #[test]
    fn retry_after_secs_rounds_up_to_at_least_one() {
        assert_eq!(retry_after_secs(Duration::ZERO), 1);
        assert_eq!(retry_after_secs(Duration::from_millis(1)), 1);
        assert_eq!(retry_after_secs(Duration::from_secs(5)), 5);
        assert_eq!(retry_after_secs(Duration::from_millis(5_001)), 6);
    }

    #[test]
    fn clickhouse_timeout_cooldown_is_504_with_retry_after() {
        let error = APIError::from(ChQueryError::TimedOut {
            error: Arc::new(clickhouse::error::Error::TimedOut),
            retry_after: Duration::from_millis(299_400),
        });
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::GATEWAY_TIMEOUT);
        assert_eq!(response.headers()[header::RETRY_AFTER], "300");
    }

    fn steam_proxy_status(status: StatusCode, body: &str) -> Response<Body> {
        APIError::from(SteamProxyError::from_status(status, body.to_owned())).into_response()
    }

    #[test]
    fn steam_proxy_cooldown_retries_after_proxy_wait() {
        let response = steam_proxy_status(
            StatusCode::TOO_MANY_REQUESTS,
            r#"{"message": "", "pool_limit_info": {"wait_for_millis": 2300}}"#,
        );
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.headers()[header::RETRY_AFTER], "3");
    }

    #[test]
    fn steam_proxy_no_alive_bots_retries_after_a_minute() {
        let response = steam_proxy_status(StatusCode::SERVICE_UNAVAILABLE, "");
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.headers()[header::RETRY_AFTER], "60");
    }

    #[test]
    fn steam_proxy_job_failure_is_bad_gateway() {
        let response = steam_proxy_status(StatusCode::BAD_GATEWAY, "");
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert!(response.headers().get(header::RETRY_AFTER).is_none());
    }

    #[test]
    fn steam_proxy_rejection_is_not_retryable() {
        for status in [StatusCode::UNAUTHORIZED, StatusCode::BAD_REQUEST] {
            let response = steam_proxy_status(status, "Invalid auth token");
            assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
            assert!(response.headers().get(header::RETRY_AFTER).is_none());
        }
    }

    #[test]
    fn test_api_error_status_msg_json() {
        let error = APIError::StatusMsgJson {
            status: StatusCode::BAD_REQUEST,
            message: json!({"field": "username", "reason": "too short"}),
        };
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_api_error_internal_error() {
        let error = APIError::internal("Database connection failed");
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn test_api_error_rate_limit_exceeded() {
        use crate::services::rate_limiter::{Quota, Scope};

        let status = Status {
            quota: Quota::new(Scope::Ip, 100, Duration::from_mins(1)),
            used: 100,
            cost: core::num::NonZeroU64::MIN,
            reset_at: std::time::SystemTime::now() + Duration::from_secs(30),
        };

        let response = APIError::RateLimitExceeded(status).into_response();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        assert_eq!(response.headers()["Retry-After"], "30");
    }

    #[test]
    fn test_api_error_clickhouse_timeout_is_gateway_timeout() {
        let error = APIError::from(clickhouse::error::Error::BadResponse(
            "Code: 159. DB::Exception: Timeout exceeded: elapsed 20.1 seconds, maximum: 20. \
             (TIMEOUT_EXCEEDED)"
                .to_owned(),
        ));
        assert_eq!(error.into_response().status(), StatusCode::GATEWAY_TIMEOUT);

        let error = APIError::from(clickhouse::error::Error::TimedOut);
        assert_eq!(error.into_response().status(), StatusCode::GATEWAY_TIMEOUT);

        let error = APIError::from(clickhouse::error::Error::BadResponse(
            "Code: 60. DB::Exception: Unknown table (UNKNOWN_TABLE)".to_owned(),
        ));
        assert_eq!(
            error.into_response().status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[test]
    fn test_api_error_status_msg_content_type() {
        let error = APIError::status_msg(StatusCode::BAD_REQUEST, "bad input");
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
    }
}
