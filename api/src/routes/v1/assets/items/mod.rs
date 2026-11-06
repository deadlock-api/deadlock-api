//! `/v1/assets/items` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use game_assets::versions::items::types::ItemType;

use crate::context::AppState;

#[derive(OpenApi)]
// `ItemType` is only referenced by the `/by-type/{type}` path param, which doesn't register it.
#[openapi(components(schemas(ItemType)), tags((
    name = "Items",
    description = "Item, ability, and weapon definitions parsed from the patch's KV3 source files."
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
