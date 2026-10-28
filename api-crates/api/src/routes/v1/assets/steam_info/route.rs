use axum::Json;
use axum::extract::{Query, State};
use axum::http::header;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{VersionQuery, load_versioned};
use crate::services::assets::versions::steam_info::{
    SteamInfo, fetch_all_steam_info, fetch_steam_info,
};

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

#[utoipa::path(
    get,
    path = "/all",
    responses(
        (status = OK, body = [SteamInfo]),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Steam Info"],
    summary = "Get All Steam Infos",
    description = "Returns the `steam.inf` manifest for every known patch as a single array, \
                   newest version first. Replaces the legacy `/v1/steam-info/all` endpoint."
)]
pub(super) async fn get_all_steam_info(
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let body = fetch_all_steam_info(&state.r2_client)
        .await
        .map_err(|e| APIError::internal(format!("loading all steam info: {e}")))?;
    Ok(([(header::CONTENT_TYPE, "application/json")], body))
}
