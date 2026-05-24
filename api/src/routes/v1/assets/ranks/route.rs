use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{Language, resolve_version};
use crate::services::assets::versions::ranks::{self, Rank};

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct RanksQuery {
    /// Language code. Defaults to `english`.
    #[serde(default)]
    #[param(inline)]
    language: Option<Language>,
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    client_version: Option<u32>,
}

#[utoipa::path(
    get,
    path = "/",
    params(RanksQuery),
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
    Query(q): Query<RanksQuery>,
) -> APIResult<impl IntoResponse> {
    let ranks = load_ranks(&state, q.client_version, q.language).await?;
    Ok(Json(ranks).into_response())
}

#[utoipa::path(
    get,
    path = "/{tier}",
    params(
        ("tier" = u32, Path, description = "Rank tier (0-11)"),
        RanksQuery,
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
    Query(q): Query<RanksQuery>,
) -> APIResult<impl IntoResponse> {
    let ranks = load_ranks(&state, q.client_version, q.language).await?;
    ranks
        .iter()
        .find(|r| r.tier == tier)
        .cloned()
        .map(Json)
        .ok_or_else(|| {
            APIError::status_msg(StatusCode::NOT_FOUND, format!("Unknown rank tier: {tier}"))
        })
}

async fn load_ranks(
    state: &AppState,
    client_version: Option<u32>,
    language: Option<Language>,
) -> APIResult<std::sync::Arc<Vec<Rank>>> {
    let version = resolve_version(state, client_version).await?;
    let lang = language.unwrap_or(Language::English).as_str();
    ranks::fetch_ranks(&state.r2_client, version, lang)
        .await
        .map_err(|e| APIError::internal(format!("building ranks: {e}")))
}
