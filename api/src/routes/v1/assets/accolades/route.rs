use std::sync::Arc;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{AssetsQuery, find_or_404, resolve_version};
use crate::services::assets::versions::accolades::{self, Accolade};

#[utoipa::path(
    get,
    path = "/",
    params(AssetsQuery),
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
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load(&state, &q).await?).into_response())
}

#[utoipa::path(
    get,
    path = "/{accolade_id}",
    params(
        ("accolade_id" = u32, Path, description = "Accolade id (`m_unAccoladeID`)"),
        AssetsQuery,
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
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let accolades = load(&state, &q).await?;
    find_or_404(
        &accolades,
        |a| a.id == accolade_id,
        format!("Unknown accolade id: {accolade_id}"),
    )
}

#[utoipa::path(
    get,
    path = "/by-name/{name}",
    params(
        ("name" = String, Path, description = "Accolade `class_name` (e.g. `kills`) or `tracked_stat_name`"),
        AssetsQuery,
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
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let accolades = load(&state, &q).await?;
    find_or_404(
        &accolades,
        |a| {
            a.class_name.eq_ignore_ascii_case(&name)
                || a.tracked_stat_name.eq_ignore_ascii_case(&name)
        },
        format!("Unknown accolade name: {name}"),
    )
}

async fn load(state: &AppState, q: &AssetsQuery) -> APIResult<Arc<Vec<Accolade>>> {
    let version = resolve_version(state, q.client_version).await?;
    let lang = q.language.unwrap_or_default().as_str();
    accolades::fetch_accolades(&state.r2_client, version, lang)
        .await
        .map_err(|e| APIError::internal(format!("building accolades: {e}")))
}
