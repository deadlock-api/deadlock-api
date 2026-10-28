//! `/v1/crosshair` route layer.

mod route;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Crosshair",
    description = "Convert between in-game crosshair share codes (`DL.…`), crosshair settings and rendered crosshair images."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::code_image))
        .routes(routes!(route::code_settings))
        .routes(routes!(route::settings_code))
        .routes(routes!(route::settings_image))
        .layer(
            CacheControlMiddleware::new(Duration::from_hours(24))
                .with_stale_while_revalidate(Duration::from_hours(24)),
        )
}
