use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::resolve_version;
use crate::services::assets::versions::npc_units::{self, NpcUnit};

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct NpcUnitsQuery {
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    client_version: Option<u32>,
}

#[utoipa::path(
    get,
    path = "/",
    params(NpcUnitsQuery),
    responses(
        (status = OK, body = [NpcUnit]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["NPC Units"],
    summary = "List NPC Units",
    description = "Returns the per-NPC-unit metadata used by the game client, parsed from the patch's KV3 source files."
)]
pub(super) async fn list_npc_units(
    State(state): State<AppState>,
    Query(q): Query<NpcUnitsQuery>,
) -> APIResult<impl IntoResponse> {
    let units = load_npc_units(&state, q.client_version).await?;
    Ok(Json(units).into_response())
}

#[utoipa::path(
    get,
    path = "/{id_or_classname}",
    params(
        ("id_or_classname" = String, Path, description = "NPC unit id (`murmurhash2(class_name)`) or `class_name`"),
        NpcUnitsQuery,
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
    Query(q): Query<NpcUnitsQuery>,
) -> APIResult<impl IntoResponse> {
    let units = load_npc_units(&state, q.client_version).await?;
    let as_id = id_or_classname.parse::<u32>().ok();
    units
        .iter()
        .find(|u| {
            as_id.is_some_and(|id| u.id == id)
                || u.class_name.eq_ignore_ascii_case(&id_or_classname)
        })
        .cloned()
        .map(Json)
        .ok_or_else(|| {
            APIError::status_msg(
                StatusCode::NOT_FOUND,
                format!("Unknown NPC unit: {id_or_classname}"),
            )
        })
}

async fn load_npc_units(
    state: &AppState,
    client_version: Option<u32>,
) -> APIResult<std::sync::Arc<Vec<NpcUnit>>> {
    let version = resolve_version(state, client_version).await?;
    npc_units::fetch_npc_units(&state.r2_client, version)
        .await
        .map_err(|e| APIError::internal(format!("building npc units: {e}")))
}
