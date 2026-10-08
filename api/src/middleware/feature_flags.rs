use axum::extract::{MatchedPath, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::context::AppState;
use crate::error::APIError;

pub(crate) async fn feature_flags(
    State(state): State<AppState>,
    matched_path: MatchedPath,
    request: Request,
    next: Next,
) -> Response {
    let matched_path = matched_path.as_str();
    if state.feature_flags.routes.get(matched_path) == Some(&false) {
        return APIError::status_msg(
            StatusCode::SERVICE_UNAVAILABLE,
            format!("Route {matched_path} is disabled"),
        )
        .into_response();
    }

    next.run(request).await
}
