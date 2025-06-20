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

pub(super) type APIResult<T> = Result<T, APIError>;

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
pub(super) enum APIError {
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
    #[error("Steam Proxy Error: {0}")]
    SteamProxy(#[from] SteamProxyError),
    #[error("Protobuf Error: {0}")]
    Protobuf(#[from] prost::DecodeError),
    #[error("Base64 Decode Error: {0}")]
    Base64Decode(#[from] base64::DecodeError),
    #[error("Request Error: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Clickhouse Error: {0}")]
    Clickhouse(#[from] clickhouse::error::Error),
    #[error("PostgreSQL Error: {0}")]
    PostgreSQL(#[from] sqlx::Error),
    #[error("Redis Error: {0}")]
    Redis(#[from] redis::RedisError),
    #[error("Json De-/Serialization Error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("IO Error: {0}")]
    Io(#[from] io::Error),
    #[error("Snappy Error: {0}")]
    Snappy(#[from] snap::Error),
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
}

impl IntoResponse for APIError {
    fn into_response(self) -> Response<Body> {
        error!("API Error: {self}");
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
            Self::InternalError { message } => Response::builder()
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
            Self::SteamProxy(e) => match e {
                SteamProxyError::Request(_) => {
                    Self::internal("Request to Steam failed.").into_response()
                }
                SteamProxyError::Base64(_) => {
                    Self::internal("Failed to decode base64 data from Steam.").into_response()
                }
                SteamProxyError::Protobuf(_) => {
                    Self::internal("Failed to parse protobuf message from Steam.").into_response()
                }
            },
            Self::Protobuf(_) => {
                Self::internal("Failed to parse protobuf message.").into_response()
            }
            Self::Base64Decode(_) => {
                Self::internal("Failed to decode base64 data.").into_response()
            }
            Self::Request(_) => Self::internal("Request failed.").into_response(),
            Self::Clickhouse(_) => Self::internal("Clickhouse error.").into_response(),
            Self::PostgreSQL(_) => Self::internal("PostgreSQL error.").into_response(),
            Self::Redis(_) => Self::internal("Redis error.").into_response(),
            Self::Json(_) => Self::internal("Json error.").into_response(),
            Self::Io(_) => Self::internal("IO error.").into_response(),
            Self::Snappy(_) => Self::internal("Snappy error.").into_response(),
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
        let error = APIError::status_msg(StatusCode::BAD_REQUEST, "Invalid input");
        let response = error.into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
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
