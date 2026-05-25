use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{VersionQuery, load_versioned};
use crate::services::assets::versions::map::{MapData, fetch_map};

#[utoipa::path(
    get,
    path = "/",
    params(VersionQuery),
    responses(
        (status = OK, body = MapData),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Map"],
    summary = "Map",
    description = "Map metadata for a client version: the minimap radius, image-layer CDN URLs, \
                   the relative positions of every objective/tower marker, and the three zip-line \
                   lane cubic splines. Defaults to the latest known client version."
)]
pub(super) async fn get_map(
    State(state): State<AppState>,
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_versioned(&state, &q, "map", fetch_map).await?).into_response())
}
