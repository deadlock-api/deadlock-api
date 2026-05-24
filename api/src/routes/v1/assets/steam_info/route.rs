use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{VersionQuery, load_versioned};
use crate::services::assets::versions::steam_info::{SteamInfo, fetch_steam_info};

#[utoipa::path(
    get,
    path = "/",
    params(VersionQuery),
    responses(
        (status = OK, body = SteamInfo),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Steam Info"],
    summary = "Get Steam Info",
    description = "Returns the `steam.inf` manifest published with the patch (client/server \
                   version, app IDs, source revision, build timestamp)."
)]
pub(super) async fn get_steam_info(
    State(state): State<AppState>,
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_versioned(&state, &q, "steam info", fetch_steam_info).await?).into_response())
}
