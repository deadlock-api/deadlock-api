use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::resolve_version;
use crate::services::assets::versions::loot_tables::{self, LootTable, LootTables};

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct LootTablesQuery {
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    client_version: Option<u32>,
}

#[utoipa::path(
    get,
    path = "/",
    params(LootTablesQuery),
    responses(
        (status = OK, body = std::collections::HashMap<String, LootTable>),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Loot Tables"],
    summary = "List Loot Tables",
    description = "Returns the per-table loot definitions used by the game client, parsed from the patch's KV3 source files. Keyed by table `class_name`."
)]
pub(super) async fn list_loot_tables(
    State(state): State<AppState>,
    Query(q): Query<LootTablesQuery>,
) -> APIResult<impl IntoResponse> {
    let tables = load_loot_tables(&state, q.client_version).await?;
    Ok(Json(tables).into_response())
}

async fn load_loot_tables(
    state: &AppState,
    client_version: Option<u32>,
) -> APIResult<Arc<LootTables>> {
    let version = resolve_version(state, client_version).await?;
    loot_tables::fetch_loot_tables(&state.r2_client, version)
        .await
        .map_err(|e| APIError::internal(format!("building loot tables: {e}")))
}
