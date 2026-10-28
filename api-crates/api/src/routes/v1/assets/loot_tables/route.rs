use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{VersionQuery, load_versioned};
use crate::services::assets::versions::loot_tables::{LootTable, fetch_loot_tables};

#[utoipa::path(
    get,
    path = "/",
    params(VersionQuery),
    responses(
        (status = OK, body = std::collections::HashMap<String, LootTable>),
        (status = NOT_FOUND, description = "Requested client_version is not available, or it has no loot tables (build 6711+)"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Loot Tables"],
    summary = "List Loot Tables",
    description = "Returns the per-table loot definitions used by the game client, parsed from the patch's KV3 source files. Keyed by table `class_name`.\n\n**Deprecated:** the game dropped `loot_tables.vdata` in build 6711 (\"City Never Sleeps\"); for those and later versions this endpoint returns 404."
)]
#[deprecated(note = "`loot_tables.vdata` no longer ships from game build 6711 on")]
pub(super) async fn list_loot_tables(
    State(state): State<AppState>,
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_versioned(&state, &q, "loot tables", fetch_loot_tables).await?).into_response())
}
