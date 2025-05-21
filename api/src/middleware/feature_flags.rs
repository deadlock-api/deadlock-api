use crate::context::AppState;
use crate::error::APIError;
use axum::extract::{MatchedPath, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

pub async fn feature_flags(
    State(AppState { feature_flags, .. }): State<AppState>,
    matched_path: MatchedPath,
    request: Request,
    next: Next,
) -> Response {
    let matched_path = matched_path.as_str().to_string();

    let route_enabled = feature_flags.routes.get(&matched_path).unwrap_or(&true);
    if !route_enabled {
        return APIError::status_msg(
            StatusCode::NOT_FOUND,
            format!("Route {matched_path} is disabled"),
        )
        .into_response();
    }

    next.run(request).await
}
