//! `/v1/assets/items` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Items",
    description = "Item, ability, and weapon definitions parsed from the patch's KV3 source files. \
                   Mirrors the previous Python `/v2/items` endpoint."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::list_items))
        .routes(routes!(route::get_items_by_type))
        .routes(routes!(route::get_items_by_hero_id))
        .routes(routes!(route::get_items_by_slot_type))
        .routes(routes!(route::get_item))
}
