use crate::utils::limiter::RateLimitStatus;
use axum::body::Body;
use axum::http::Response;
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde_json::json;
use std::io;
use thiserror::Error;

pub type ApplicationResult<T> = Result<T, ApplicationError>;
pub type APIResult<T> = Result<T, APIError>;

#[derive(Debug, Error)]
pub enum ApplicationError {
    #[error("Server error: {0}")]
    Server(#[from] axum::Error),
    #[error("IO error: {0}")]
    IO(#[from] io::Error),
    #[error("Load app state error: {0}")]
    LoadAppState(#[from] LoadAppStateError),
}

#[derive(Debug, Error)]
pub enum LoadAppStateError {
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),
    #[error("Object store error: {0}")]
    ObjectStore(#[from] object_store::Error),
    #[error("Clickhouse error: {0}")]
    Clickhouse(#[from] clickhouse::error::Error),
    #[error("PostgreSQL error: {0}")]
    PostgreSQL(#[from] sqlx::Error),
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
