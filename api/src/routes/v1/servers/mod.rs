mod list;
pub(crate) mod metrics;
mod status;

use core::time::Duration;

use axum::http::{HeaderMap, StatusCode};
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "Servers", description = "
Game server status and listing endpoints.
Used by game servers to report their status and by clients to discover available servers.
")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(status::status))
        .routes(routes!(list::list))
        .routes(routes!(metrics::ingest))
        .layer(CacheControlMiddleware::new(Duration::from_secs(0)).private())
}

pub(super) fn is_safe_identifier(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub(super) fn require_game_server_secret(headers: &HeaderMap, expected: &str) -> APIResult<()> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));

    match token {
        Some(t) if !expected.is_empty() && t == expected => Ok(()),
        _ => Err(APIError::status_msg(
            StatusCode::UNAUTHORIZED,
            "Invalid or missing game server secret",
        )),
    }
}
