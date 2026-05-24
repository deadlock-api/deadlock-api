use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{VersionQuery, resolve_version};
use crate::services::assets::versions::colors;
use crate::services::assets::versions::common::Color;

#[utoipa::path(
    get,
    path = "/",
    params(VersionQuery),
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
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    let version = resolve_version(&state, q.client_version).await?;
    let colors = colors::fetch_colors(&state.r2_client, version)
        .await
        .map_err(|e| APIError::internal(format!("building colors: {e}")))?;
    Ok(Json(colors).into_response())
}
