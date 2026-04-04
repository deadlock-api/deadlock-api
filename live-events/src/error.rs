use axum::body::Body;
use axum::http::Response;
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde_json::json;
use thiserror::Error;
use tracing::error;

use crate::state::AppStateError;

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
    #[error("Internal server error: {message}")]
    InternalError { message: String },
    #[error("Protobuf Error: {0}")]
    Protobuf(#[from] prost::DecodeError),
    #[error("Request Error: {0}")]
    Request(#[from] reqwest::Error),
}

impl APIError {
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
                .unwrap_or_else(|_| "Internal server error".to_owned().into_response()),
            Self::StatusMsg { status, message } => Response::builder()
                .status(status)
                .body(
                    serde_json::to_string(&json!({
                        "status": status.as_u16(),
                        "error": message,
                    }))
                    .unwrap_or_else(|_| "Internal server error".to_owned())
                    .into(),
                )
                .unwrap_or_else(|_| "Internal server error".to_owned().into_response()),
            Self::StatusMsgJson { status, message } => Response::builder()
                .status(status)
                .body(
                    serde_json::to_string(&json!({
                        "status": status.as_u16(),
                        "error": message,
                    }))
                    .unwrap_or_else(|_| "Internal server error".to_owned())
                    .into(),
                )
                .unwrap_or_else(|_| "Internal server error".to_owned().into_response()),
            Self::InternalError { message } => Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(
                    serde_json::to_string(&json!({
                        "status": StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
                        "error": format!("Internal server error: {message}"),
                    }))
                    .unwrap_or_else(|_| "Internal server error".to_owned())
                    .into(),
                )
                .unwrap_or_else(|_| "Internal server error".to_owned().into_response()),
            Self::Protobuf(_) => {
                Self::internal("Failed to parse protobuf message.").into_response()
            }
            Self::Request(_) => Self::internal("Request failed.").into_response(),
        }
    }
}
