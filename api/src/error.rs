use crate::context::AppStateError;
use crate::services::rate_limiter::RateLimitStatus;
use crate::services::steam::types::SteamProxyError;
use axum::body::Body;
use axum::http::Response;
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde_json::json;
use std::io;
use thiserror::Error;
use tracing::error;

pub type ApplicationResult<T> = Result<T, StartupError>;
pub type APIResult<T> = Result<T, APIError>;

#[derive(Debug, Error)]
pub enum StartupError {
    #[error("Server error: {0}")]
    Server(#[from] axum::Error),
    #[error("IO error: {0}")]
    IO(#[from] io::Error),
    #[error("Load app state error: {0}")]
    AppState(#[from] AppStateError),
}

#[allow(dead_code)]
#[derive(Debug, Error)]
pub enum APIError {
    #[error("Status {status}")]
    Status { status: StatusCode },
    #[error("{message}")]
    StatusMsg { status: StatusCode, message: String },
    #[error("Status {status}")]
    StatusMsgJson {
        status: StatusCode,
        message: serde_json::Value,
    },
    #[error("Rate limit exceeded")]
    RateLimitExceeded { status: RateLimitStatus },
    #[error("Internal server error: {message}")]
    InternalError { message: String },
}

impl APIError {
    pub fn internal(message: impl Into<String>) -> Self {
        Self::InternalError {
            message: message.into(),
        }
    }
}

impl From<SteamProxyError> for APIError {
    fn from(_e: SteamProxyError) -> Self {
        Self::internal("Request to Steam failed.")
    }
}

impl From<clickhouse::error::Error> for APIError {
    fn from(_e: clickhouse::error::Error) -> Self {
        Self::internal("Clickhouse error")
    }
}

impl From<sqlx::Error> for APIError {
    fn from(_e: sqlx::Error) -> Self {
        Self::internal("PostgreSQL error")
    }
}

impl From<redis::RedisError> for APIError {
    fn from(_e: redis::RedisError) -> Self {
        Self::internal("Redis error")
    }
}

impl From<reqwest::Error> for APIError {
    fn from(_e: reqwest::Error) -> Self {
        Self::internal("Request to external service failed")
    }
}

impl From<base64::DecodeError> for APIError {
    fn from(_e: base64::DecodeError) -> Self {
        Self::internal("Failed to decode base64 data")
    }
}

impl From<prost::DecodeError> for APIError {
    fn from(_e: prost::DecodeError) -> Self {
        Self::internal("Failed to decode protobuf message")
    }
}

impl IntoResponse for APIError {
    fn into_response(self) -> Response<Body> {
        match self {
            Self::Status { status } => Response::builder()
                .status(status)
                .body(Body::empty())
                .unwrap_or_else(|_| "Internal server error".to_string().into_response()),
            Self::StatusMsg { status, message } => Response::builder()
                .status(status)
                .body(
                    serde_json::to_string(&json!({
                        "status": status.as_u16(),
                        "error": message,
                    }))
                    .unwrap_or_else(|_| "Internal server error".to_string())
                    .into(),
                )
                .unwrap_or_else(|_| "Internal server error".to_string().into_response()),
            Self::StatusMsgJson { status, message } => Response::builder()
                .status(status)
                .body(
                    serde_json::to_string(&json!({
                        "status": status.as_u16(),
                        "error": message,
                    }))
                    .unwrap_or_else(|_| "Internal server error".to_string())
                    .into(),
                )
                .unwrap_or_else(|_| "Internal server error".to_string().into_response()),
            Self::RateLimitExceeded { status } => {
                let mut res = Response::builder();
                for (key, value) in status.response_headers() {
                    if let Some(key) = key {
                        res = res.header(key, value);
                    }
                }
                res.status(StatusCode::TOO_MANY_REQUESTS)
                    .body(
                        serde_json::to_string(&json!({
                            "status": StatusCode::TOO_MANY_REQUESTS.as_u16(),
                            "error": {
                                "quota": {
                                    "limit": status.quota.limit,
                                    "period": status.quota.period.as_secs(),
                                },
                                "requests": status.requests,
                                "remaining": status.remaining(),
                            }
                        }))
                        .unwrap_or_else(|_| "Internal server error".to_string())
                        .into(),
                    )
                    .unwrap_or_else(|_| "Internal server error".to_string().into_response())
            }
            APIError::InternalError { message } => Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(
                    serde_json::to_string(&json!({
                        "status": StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
                        "error": format!("Internal server error: {message}"),
                    }))
                    .unwrap_or_else(|_| "Internal server error".to_string())
                    .into(),
                )
                .unwrap_or_else(|_| "Internal server error".to_string().into_response()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::rate_limiter::{RateLimitQuota, RateLimitStatus};
    use axum::http::StatusCode;
    use std::time::Duration;

    #[test]
    fn test_api_error_status() {
        let error = APIError::Status {
            status: StatusCode::NOT_FOUND,
        };
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn test_api_error_status_msg() {
        let error = APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Invalid input".to_string(),
        };
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_api_error_status_msg_json() {
        let error = APIError::StatusMsgJson {
            status: StatusCode::BAD_REQUEST,
            message: serde_json::json!({"field": "username", "reason": "too short"}),
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
        use chrono::Utc;

        let quota = RateLimitQuota::ip_limit(100, Duration::from_secs(60));
        let status = RateLimitStatus {
            quota,
            requests: 100,
            oldest_request: Utc::now(),
        };

        let error = APIError::RateLimitExceeded { status };
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    }
}
