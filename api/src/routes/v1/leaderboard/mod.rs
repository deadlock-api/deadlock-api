pub mod route;
pub mod types;

use crate::middleware::cache::CacheControlMiddleware;
use crate::state::AppState;
use std::time::Duration;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Leaderboard", description = "Leaderboard related endpoints")))]
pub struct ApiDoc;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::leaderboard_raw))
        .routes(routes!(route::leaderboard_hero_raw))
        .routes(routes!(route::leaderboard))
        .routes(routes!(route::leaderboard_hero))
        .layer(CacheControlMiddleware::new(Duration::from_secs(10 * 60)))
}
