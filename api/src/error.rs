use crate::state::LoadAppStateError;
use crate::utils::limiter::RateLimitStatus;
use axum::body::Body;
use axum::http::Response;
use axum::response::IntoResponse;
use derive_more::From;
use reqwest::StatusCode;
use serde_json::json;
use std::fmt::Display;
use std::io;

pub type ApplicationResult<T> = Result<T, ApplicationError>;
pub type APIResult<T> = Result<T, APIError>;

#[derive(Debug, From)]
pub enum ApplicationError {
    Server(axum::Error),
    IO(io::Error),
    LoadAppState(LoadAppStateError),
}
impl Display for ApplicationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Server(e) => write!(f, "Server error: {e}"),
            Self::IO(e) => write!(f, "IO error: {e}"),
            Self::LoadAppState(e) => write!(f, "Load app state error: {e}"),
        }
    }
}

#[derive(Debug, From)]
pub enum APIError {
    Status {
        status: StatusCode,
    },
    StatusMsg {
        status: StatusCode,
        message: String,
    },
    StatusMsgJson {
        status: StatusCode,
        message: serde_json::Value,
    },
    RateLimitExceeded {
        status: RateLimitStatus,
    },
    InternalError {
        message: String,
    },
}

impl IntoResponse for APIError {
    fn into_response(self) -> Response<Body> {
        match self {
            Self::Status { status } => Response::builder()
                .status(status)
                .body(Body::empty())
                .unwrap_or("Internal server error".to_string().into_response()),
            Self::StatusMsg { status, message } => Response::builder()
                .status(status)
                .body(
                    serde_json::to_string(&json!({
                        "status": status.as_u16(),
                        "error": message,
                    }))
                    .unwrap_or("Internal server error".to_string())
                    .into(),
                )
                .unwrap_or("Internal server error".to_string().into_response()),
            Self::StatusMsgJson { status, message } => Response::builder()
                .status(status)
                .body(
                    serde_json::to_string(&json!({
                        "status": status.as_u16(),
                        "error": message,
                    }))
                    .unwrap_or("Internal server error".to_string())
                    .into(),
                )
                .unwrap_or("Internal server error".to_string().into_response()),
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
                                    "period": status.quota.period.num_seconds(),
                                },
                                "requests": status.requests,
                                "remaining": status.remaining(),
                            }
                        }))
                        .unwrap_or("Internal server error".to_string())
                        .into(),
                    )
                    .unwrap_or("Internal server error".to_string().into_response())
            }
            APIError::InternalError { message } => Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(
                    serde_json::to_string(&json!({
                        "status": StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
                        "error": format!("Internal server error: {message}"),
                    }))
                    .unwrap_or("Internal server error".to_string())
                    .into(),
                )
                .unwrap_or("Internal server error".to_string().into_response()),
        }
    }
}
