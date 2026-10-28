use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{AssetsQuery, find_by_id_or_classname, load_localized};
use crate::services::assets::versions::npc_units::{NpcUnit, fetch_npc_units};

#[utoipa::path(
    get,
    path = "/",
    params(AssetsQuery),
    responses(
        (status = OK, body = [NpcUnit]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["NPC Units"],
    summary = "List NPC Units",
    description = "Returns the per-NPC-unit metadata used by the game client, parsed from the patch's KV3 source files. Unit names (`name`) are localized into the requested `language`; neutral (\"Haunt\") abilities referenced by `neutral_abilities` / `neutral_melee` are listed under `/v1/assets/modifiers`."
)]
pub(super) async fn list_npc_units(
    State(state): State<AppState>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_localized(&state, &q, "npc units", fetch_npc_units).await?).into_response())
}

#[utoipa::path(
    get,
    path = "/{id_or_classname}",
    params(
        ("id_or_classname" = String, Path, description = "NPC unit id (`murmurhash2(class_name)`) or `class_name`"),
        AssetsQuery,
    ),
    responses(
        (status = OK, body = NpcUnit),
        (status = NOT_FOUND, description = "Unknown NPC unit id/class_name or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["NPC Units"],
    summary = "Get NPC Unit",
    description = "Returns a single NPC unit by numeric id or by `class_name` (case-insensitive)."
)]
pub(super) async fn get_npc_unit(
    State(state): State<AppState>,
    Path(id_or_classname): Path<String>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let units = load_localized(&state, &q, "npc units", fetch_npc_units).await?;
    find_by_id_or_classname(
        &units,
        &id_or_classname,
        |u| u.id,
        |u| &u.class_name,
        "NPC unit",
    )
}
