pub mod query;
mod route;
pub mod structs;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "Builds", description = "
Search and retrieve hero builds with comprehensive filtering options.
")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::search_builds))
        .layer(
            CacheControlMiddleware::new(Duration::from_hours(1))
                .with_stale_while_revalidate(Duration::from_hours(1))
                .with_stale_if_error(Duration::from_hours(1)),
        )
}
