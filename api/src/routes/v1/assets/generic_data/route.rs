use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{VersionQuery, load_versioned};
use crate::services::assets::versions::generic_data::{GenericData, fetch_generic_data};

#[utoipa::path(
    get,
    path = "/",
    params(VersionQuery),
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
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_versioned(&state, &q, "generic data", fetch_generic_data).await?).into_response())
}
