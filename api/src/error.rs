use crate::limiter::RateLimitStatus;
use crate::state::LoadAppStateError;
use axum::body::Body;
use axum::http::Response;
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde_json::json;
use std::fmt::Display;
use std::io;

#[derive(Debug)]
pub enum ApplicationError {
    Server(axum::Error),
    IO(io::Error),
    LoadAppState(LoadAppStateError),
}

impl From<axum::Error> for ApplicationError {
    fn from(e: axum::Error) -> Self {
        Self::Server(e)
    }
}

impl From<io::Error> for ApplicationError {
    fn from(e: io::Error) -> Self {
        Self::IO(e)
    }
}

impl From<LoadAppStateError> for ApplicationError {
    fn from(e: LoadAppStateError) -> Self {
        Self::LoadAppState(e)
    }
}

impl Display for ApplicationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Server(e) => write!(f, "Server error: {}", e),
            Self::IO(e) => write!(f, "IO error: {}", e),
            Self::LoadAppState(e) => write!(f, "State error: {}", e),
        }
    }
}

#[derive(Debug)]
pub enum APIError {
    Status(StatusCode),
    StatusMsg((StatusCode, String)),
    RateLimitExceeded(RateLimitStatus),
    InternalError(String),
}

impl From<StatusCode> for APIError {
    fn from(e: StatusCode) -> Self {
        Self::Status(e)
    }
}

impl From<(StatusCode, String)> for APIError {
    fn from(e: (StatusCode, String)) -> Self {
        Self::StatusMsg(e)
    }
}

impl From<RateLimitStatus> for APIError {
    fn from(e: RateLimitStatus) -> Self {
        Self::RateLimitExceeded(e)
    }
}

impl From<String> for APIError {
    fn from(e: String) -> Self {
        Self::InternalError(e)
    }
}

impl IntoResponse for APIError {
    fn into_response(self) -> Response<Body> {
        match self {
            Self::Status(status) => Response::builder()
                .status(status)
                .body(axum::body::Body::empty())
                .unwrap_or("Internal server error".to_string().into_response()),
            Self::StatusMsg((status, msg)) => Response::builder()
                .status(status)
                .body(
                    serde_json::to_string(&json!({
                        "status": status.as_u16(),
                        "error": msg,
                    }))
                    .unwrap_or("Internal server error".to_string())
                    .into(),
                )
                .unwrap_or("Internal server error".to_string().into_response()),
            Self::RateLimitExceeded(status) => {
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
            APIError::InternalError(_) => Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(
                    serde_json::to_string(&json!({
                        "status": StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
                        "error": "Internal server error",
                    }))
                    .unwrap_or("Internal server error".to_string())
                    .into(),
                )
                .unwrap_or("Internal server error".to_string().into_response()),
        }
    }
}
