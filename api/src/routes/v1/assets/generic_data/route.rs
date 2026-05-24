use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::resolve_version;
use crate::services::assets::versions::generic_data::{self, GenericData};

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct GenericDataQuery {
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    client_version: Option<u32>,
}

#[utoipa::path(
    get,
    path = "/",
    params(GenericDataQuery),
    responses(
        (status = OK, body = GenericData),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Generic Data"],
    summary = "Get Generic Data",
    description = "Returns the game-wide generic configuration (street brawl, lane info, glitch \
                   settings, damage flash, item draft, etc.) parsed from the patch's \
                   `generic_data.vdata` KV3 source file."
)]
pub(super) async fn get_generic_data(
    State(state): State<AppState>,
    Query(q): Query<GenericDataQuery>,
) -> APIResult<impl IntoResponse> {
    let version = resolve_version(&state, q.client_version).await?;
    let data = generic_data::fetch_generic_data(&state.r2_client, version)
        .await
        .map_err(|e| APIError::internal(format!("building generic data: {e}")))?;
    Ok(Json(data).into_response())
}
