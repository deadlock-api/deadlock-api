use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use reqwest::StatusCode;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{AssetsQuery, load_localized};
use crate::services::assets::versions::items::fetch_items;
use crate::services::assets::versions::items::types::{Item, ItemSlotType, ItemType};

#[utoipa::path(
    get,
    path = "/",
    params(AssetsQuery),
    responses(
        (status = OK, body = [Item]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Items"],
    summary = "List Items",
    description = "Returns the full per-patch item list — abilities, weapons, and upgrades."
)]
pub(super) async fn list_items(
    State(state): State<AppState>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_localized(&state, &q, "items", fetch_items).await?).into_response())
}

#[utoipa::path(
    get,
    path = "/{id_or_class_name}",
    params(
        ("id_or_class_name" = String, Path, description = "Numeric `id` or string `class_name`."),
        AssetsQuery,
    ),
    responses(
        (status = OK, body = Item),
        (status = NOT_FOUND, description = "Unknown item id/class_name or client_version"),
    ),
    tags = ["Items"],
    summary = "Get Item"
)]
pub(super) async fn get_item(
    State(state): State<AppState>,
    Path(id_or_class_name): Path<String>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let items = load_localized(&state, &q, "items", fetch_items).await?;
    let needle_id: Option<u32> = id_or_class_name.parse().ok();
    items
        .iter()
        .find(|i| match needle_id {
            Some(id) => i.id() == id,
            None => i.class_name() == id_or_class_name,
        })
        .cloned()
        .map(Json)
        .ok_or_else(|| APIError::status_msg(StatusCode::NOT_FOUND, "Item not found"))
}

#[utoipa::path(
    get,
    path = "/by-type/{type}",
    params(
        ("type" = ItemType, Path, description = "Item type: `ability`, `weapon`, or `upgrade`."),
        AssetsQuery,
    ),
    responses((status = OK, body = [Item])),
    tags = ["Items"],
    summary = "List Items By Type"
)]
pub(super) async fn get_items_by_type(
    State(state): State<AppState>,
    Path(item_type): Path<ItemType>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let items = load_localized(&state, &q, "items", fetch_items).await?;
    let filtered: Vec<Item> = items
        .iter()
        .filter(|i| i.item_type() as u8 == item_type as u8)
        .cloned()
        .collect();
    Ok(Json(filtered).into_response())
}

#[utoipa::path(
    get,
    path = "/by-hero-id/{id}",
    params(
        ("id" = u32, Path, description = "Hero id (`m_HeroID`)."),
        AssetsQuery,
    ),
    responses((status = OK, body = [Item])),
    tags = ["Items"],
    summary = "List Items By Hero",
    description = "Hero-bound abilities, excluding the generic movement abilities."
)]
pub(super) async fn get_items_by_hero_id(
    State(state): State<AppState>,
    Path(hero_id): Path<u32>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    const FILTERED: &[&str] = &[
        "citadel_ability_climb_rope",
        "citadel_ability_dash",
        "citadel_ability_sprint",
        "citadel_ability_melee_parry",
        "citadel_ability_jump",
        "citadel_ability_mantle",
        "citadel_ability_slide",
        "citadel_ability_zip_line",
        "citadel_ability_zipline_boost",
    ];
    let items = load_localized(&state, &q, "items", fetch_items).await?;
    let filtered: Vec<Item> = items
        .iter()
        .filter(|i| {
            matches!(i.item_type(), ItemType::Ability)
                && i.heroes().is_some_and(|h| h.contains(&hero_id))
                && !FILTERED.contains(&i.class_name())
        })
        .cloned()
        .collect();
    Ok(Json(filtered).into_response())
}

#[utoipa::path(
    get,
    path = "/by-slot-type/{slot_type}",
    params(
        ("slot_type" = ItemSlotType, Path, description = "Slot type: `weapon`, `spirit`, or `vitality`."),
        AssetsQuery,
    ),
    responses((status = OK, body = [Item])),
    tags = ["Items"],
    summary = "List Items By Slot Type"
)]
pub(super) async fn get_items_by_slot_type(
    State(state): State<AppState>,
    Path(slot_type): Path<ItemSlotType>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let items = load_localized(&state, &q, "items", fetch_items).await?;
    let filtered: Vec<Item> = items
        .iter()
        .filter(|i| matches!(i, Item::Upgrade(u) if u.item_slot_type == slot_type))
        .cloned()
        .collect();
    Ok(Json(filtered).into_response())
}
