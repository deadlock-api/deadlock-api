//! `/v1/assets/misc-entities` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Misc Entities",
    description = "Misc entity definitions (powerup spawners, breakable props, neutral camps, capture points, …) derived from per-version game data files."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::list_misc_entities))
        .routes(routes!(route::get_misc_entity))
}
