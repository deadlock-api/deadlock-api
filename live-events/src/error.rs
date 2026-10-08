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

#[derive(Debug, Error)]
pub(super) enum APIError {
    #[error("{message}")]
    StatusMsg { status: StatusCode, message: String },
    #[error("Internal server error: {message}")]
    InternalError { message: String },
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

/// A `{"status": .., "error": ..}` JSON body with the given status.
fn json_error(status: StatusCode, error: &str) -> Response<Body> {
    Response::builder()
        .status(status)
        .body(
            json!({
                "status": status.as_u16(),
                "error": error,
            })
            .to_string()
            .into(),
        )
        .unwrap_or_else(|_| "Internal server error".to_owned().into_response())
}

impl IntoResponse for APIError {
    fn into_response(self) -> Response<Body> {
        error!("API Error: {self}");
        match self {
            Self::StatusMsg { status, message } => json_error(status, &message),
            Self::InternalError { message } => json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Internal server error: {message}"),
            ),
            Self::Request(_) => json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error: Request failed.",
            ),
        }
    }
}
