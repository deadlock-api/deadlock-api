use std::collections::BTreeMap;
use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::resolve_version;
use crate::services::assets::versions::colors;
use crate::services::assets::versions::common::Color;

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct ColorsQuery {
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    client_version: Option<u32>,
}

#[utoipa::path(
    get,
    path = "/",
    params(ColorsQuery),
    responses(
        (status = OK, body = std::collections::HashMap<String, Color>),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Colors"],
    summary = "List Colors",
    description = "Panorama color palette (`@define <name>: #RRGGBB[AA];` declarations from `citadel_base_styles.css`), keyed by `snake_case` name."
)]
pub(super) async fn list_colors(
    State(state): State<AppState>,
    Query(q): Query<ColorsQuery>,
) -> APIResult<impl IntoResponse> {
    let colors = load_colors(&state, q.client_version).await?;
    Ok(Json(colors).into_response())
}

async fn load_colors(
    state: &AppState,
    client_version: Option<u32>,
) -> APIResult<Arc<BTreeMap<String, Color>>> {
    let version = resolve_version(state, client_version).await?;
    colors::fetch_colors(&state.r2_client, version)
        .await
        .map_err(|e| APIError::internal(format!("building colors: {e}")))
}
