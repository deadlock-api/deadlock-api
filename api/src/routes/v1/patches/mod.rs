pub mod big_patch_days;
pub mod feed;

use crate::middleware::cache::CacheControlMiddleware;
use crate::state::AppState;
use std::time::Duration;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Patches",
    description = "Endpoints that return data about game patches."
)))]
pub struct ApiDoc;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(big_patch_days::big_patch_days))
        .routes(routes!(feed::feed))
        .layer(CacheControlMiddleware::new(Duration::from_secs(60 * 60)))
}
