use axum::extract::{MatchedPath, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse as _, Response};

use crate::context::AppState;
use crate::error::APIError;

/// Answers 503 for routes disabled in the `feature_flags` table.
pub(crate) async fn feature_flags(
    State(state): State<AppState>,
    matched_path: MatchedPath,
    request: Request,
    next: Next,
) -> Response {
    let path = matched_path.as_str();
    let route = state.feature_flags.route(path);
    if !route.enabled {
        let msg = route.disabled_reason.map_or_else(
            || format!("Route {path} is disabled"),
            |reason| format!("Route {path} is disabled: {reason}"),
        );
        return APIError::status_msg(StatusCode::SERVICE_UNAVAILABLE, msg).into_response();
    }

    next.run(request).await
}
