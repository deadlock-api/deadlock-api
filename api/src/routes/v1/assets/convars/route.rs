use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{VersionQuery, load_versioned};
use crate::services::assets::versions::convars::{Convar, fetch_convars};

#[utoipa::path(
    get,
    path = "/",
    params(VersionQuery),
    responses(
        (status = OK, body = std::collections::HashMap<String, Convar>),
        (status = NOT_FOUND, description = "Requested client_version is not available, or it has no convars data (extracted from build 6774 on)"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Convars"],
    summary = "List Convars",
    description = "Returns every console variable registered by the patch's `client.dll` and `server.dll`, keyed by name, with its type, compiled-in default value, `FCVAR_*` flags and help text. These are the defaults the binaries ship with; servers and game modes can override them at runtime."
)]
pub(super) async fn list_convars(
    State(state): State<AppState>,
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_versioned(&state, &q, "convars", fetch_convars).await?).into_response())
}

#[utoipa::path(
    get,
    path = "/{name}",
    params(
        ("name" = String, Path, description = "Convar name, e.g. `citadel_corrupted_item_shop_restock_interval`"),
        VersionQuery,
    ),
    responses(
        (status = OK, body = Convar),
        (status = NOT_FOUND, description = "Unknown convar or client_version, or no convars data for that version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Convars"],
    summary = "Get Convar",
    description = "Returns a single console variable by name (case-insensitive)."
)]
pub(super) async fn get_convar(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    let convars = load_versioned(&state, &q, "convars", fetch_convars).await?;
    convars
        .get(&name)
        .or_else(|| {
            convars
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(&name))
                .map(|(_, v)| v)
        })
        .cloned()
        .map(Json)
        .ok_or_else(|| {
            APIError::status_msg(StatusCode::NOT_FOUND, format!("convar {name} not found"))
        })
}
