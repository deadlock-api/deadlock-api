use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{VersionQuery, resolve_version};
use crate::services::assets::versions::steam_info::{self, SteamInfo};

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
    let version = resolve_version(&state, q.client_version).await?;
    let info = steam_info::fetch_steam_info(&state.r2_client, version)
        .await
        .map_err(|e| APIError::internal(format!("building steam info: {e}")))?;
    Ok(Json(info).into_response())
}
