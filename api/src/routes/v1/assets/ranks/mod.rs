//! `/v1/assets/ranks` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;
use crate::services::rank_image;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Ranks",
    description = "Per-rank metadata (name, tier color, badge image URLs) derived from per-version game data files."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::list_ranks))
        .routes(routes!(route::get_rank))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(route::subrank_image))
                .layer(CacheControlMiddleware::new(rank_image::CACHE_TTL)),
        )
}
