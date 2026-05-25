//! `/v1/assets/map` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Map",
    description = "Map metadata: minimap radius, image-layer URLs, objective marker \
                   positions (from per-version `objectives_map.css`), and the zip-line lane splines."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi()).routes(routes!(route::get_map))
}
