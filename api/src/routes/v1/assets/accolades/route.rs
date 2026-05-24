use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{Language, resolve_version};
use crate::services::assets::versions::accolades::{self, Accolade};

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct AccoladesQuery {
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
    params(AccoladesQuery),
    responses(
        (status = OK, body = [Accolade]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Accolades"],
    summary = "List Accolades",
    description = "Returns the per-accolade metadata used by the game client, parsed from the patch's KV3 source files."
)]
pub(super) async fn list_accolades(
    State(state): State<AppState>,
    Query(q): Query<AccoladesQuery>,
) -> APIResult<impl IntoResponse> {
    let accolades = load_accolades(&state, q.client_version, q.language).await?;
    Ok(Json(accolades).into_response())
}

#[utoipa::path(
    get,
    path = "/{accolade_id}",
    params(
        ("accolade_id" = u32, Path, description = "Accolade id (`m_unAccoladeID`)"),
        AccoladesQuery,
    ),
    responses(
        (status = OK, body = Accolade),
        (status = NOT_FOUND, description = "Unknown accolade id or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Accolades"],
    summary = "Get Accolade",
    description = "Returns a single accolade by id."
)]
pub(super) async fn get_accolade(
    State(state): State<AppState>,
    Path(accolade_id): Path<u32>,
    Query(q): Query<AccoladesQuery>,
) -> APIResult<impl IntoResponse> {
    let accolades = load_accolades(&state, q.client_version, q.language).await?;
    accolades
        .iter()
        .find(|a| a.id == accolade_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| {
            APIError::status_msg(
                StatusCode::NOT_FOUND,
                format!("Unknown accolade id: {accolade_id}"),
            )
        })
}

#[utoipa::path(
    get,
    path = "/by-name/{name}",
    params(
        ("name" = String, Path, description = "Accolade `class_name` (e.g. `kills`) or `tracked_stat_name`"),
        AccoladesQuery,
    ),
    responses(
        (status = OK, body = Accolade),
        (status = NOT_FOUND, description = "Unknown accolade name or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Accolades"],
    summary = "Get Accolade By Name",
    description = "Returns a single accolade by `class_name` or `tracked_stat_name` (case-insensitive)."
)]
pub(super) async fn get_accolade_by_name(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(q): Query<AccoladesQuery>,
) -> APIResult<impl IntoResponse> {
    let accolades = load_accolades(&state, q.client_version, q.language).await?;
    let needle = name.to_lowercase();
    accolades
        .iter()
        .find(|a| {
            a.class_name.eq_ignore_ascii_case(&needle)
                || a.tracked_stat_name.eq_ignore_ascii_case(&needle)
        })
        .cloned()
        .map(Json)
        .ok_or_else(|| {
            APIError::status_msg(
                StatusCode::NOT_FOUND,
                format!("Unknown accolade name: {name}"),
            )
        })
}

async fn load_accolades(
    state: &AppState,
    client_version: Option<u32>,
    language: Option<Language>,
) -> APIResult<std::sync::Arc<Vec<Accolade>>> {
    let version = resolve_version(state, client_version).await?;
    let lang = language.unwrap_or(Language::English).as_str();
    accolades::fetch_accolades(&state.r2_client, version, lang)
        .await
        .map_err(|e| APIError::internal(format!("building accolades: {e}")))
}
