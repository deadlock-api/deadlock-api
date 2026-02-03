mod big_patch_days;
pub(super) mod feed;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Patches",
    description = "Endpoints that return data about game patches."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(big_patch_days::big_patch_days))
        .routes(routes!(feed::feed))
        .layer(
            CacheControlMiddleware::new(Duration::from_hours(1))
                .with_stale_while_revalidate(Duration::from_hours(1))
                .with_stale_if_error(Duration::from_hours(1)),
        )
}
