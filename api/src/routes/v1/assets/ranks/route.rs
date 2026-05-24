use std::sync::Arc;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{AssetsQuery, find_or_404, resolve_version};
use crate::services::assets::versions::ranks::{self, Rank};

#[utoipa::path(
    get,
    path = "/",
    params(AssetsQuery),
    responses(
        (status = OK, body = [Rank]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Ranks"],
    summary = "List Ranks",
    description = "Returns the 12 player ranks (tier, localized name, badge image URLs, hex color)."
)]
pub(super) async fn list_ranks(
    State(state): State<AppState>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load(&state, &q).await?).into_response())
}

#[utoipa::path(
    get,
    path = "/{tier}",
    params(
        ("tier" = u32, Path, description = "Rank tier (0-11)"),
        AssetsQuery,
    ),
    responses(
        (status = OK, body = Rank),
        (status = NOT_FOUND, description = "Unknown tier or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Ranks"],
    summary = "Get Rank",
    description = "Returns a single rank by tier index."
)]
pub(super) async fn get_rank(
    State(state): State<AppState>,
    Path(tier): Path<u32>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let ranks = load(&state, &q).await?;
    find_or_404(
        &ranks,
        |r| r.tier == tier,
        format!("Unknown rank tier: {tier}"),
    )
}

async fn load(state: &AppState, q: &AssetsQuery) -> APIResult<Arc<Vec<Rank>>> {
    let version = resolve_version(state, q.client_version).await?;
    let lang = q.language.unwrap_or_default().as_str();
    ranks::fetch_ranks(&state.r2_client, version, lang)
        .await
        .map_err(|e| APIError::internal(format!("building ranks: {e}")))
}
