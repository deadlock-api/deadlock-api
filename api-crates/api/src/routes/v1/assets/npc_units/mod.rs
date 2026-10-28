//! `/v1/assets/npc-units` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "NPC Units",
    description = "NPC unit definitions derived from per-version game data files."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::list_npc_units))
        .routes(routes!(route::get_npc_unit))
}
