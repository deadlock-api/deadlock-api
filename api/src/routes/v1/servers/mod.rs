mod list;
mod status;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
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
        .layer(CacheControlMiddleware::new(Duration::from_secs(0)).private())
}
