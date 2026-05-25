use axum::extract::State;
use axum::http::header;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::assets::index::{IndexFolder, fetch_index};

async fn respond(state: &AppState, folder: IndexFolder) -> APIResult<impl IntoResponse + use<>> {
    let body = fetch_index(&state.r2_client, folder)
        .await
        .map_err(|e| APIError::internal(format!("loading {} index: {e}", <&str>::from(folder))))?;
    Ok(([(header::CONTENT_TYPE, "application/json")], body))
}

#[utoipa::path(
    get,
    path = "/images",
    responses(
        (status = OK, body = serde_json::Value),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Assets Bucket"],
    summary = "Images Index",
    description = "Nested file-tree of all hosted images, mapping each name to its public CDN URL."
)]
pub(super) async fn images(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    respond(&state, IndexFolder::Images).await
}

#[utoipa::path(
    get,
    path = "/icons",
    responses(
        (status = OK, body = serde_json::Value),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Assets Bucket"],
    summary = "Icons Index",
    description = "Nested file-tree of all hosted icons, mapping each name to its public CDN URL."
)]
pub(super) async fn icons(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    respond(&state, IndexFolder::Icons).await
}

#[utoipa::path(
    get,
    path = "/sounds",
    responses(
        (status = OK, body = serde_json::Value),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Assets Bucket"],
    summary = "Sounds Index",
    description = "Nested file-tree of all hosted sounds, mapping each name to its public CDN URL."
)]
pub(super) async fn sounds(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    respond(&state, IndexFolder::Sounds).await
}

#[utoipa::path(
    get,
    path = "/fonts",
    responses(
        (status = OK, body = serde_json::Value),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Assets Bucket"],
    summary = "Fonts Index",
    description = "Nested file-tree of all hosted fonts, mapping each name to its public CDN URL."
)]
pub(super) async fn fonts(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    respond(&state, IndexFolder::Fonts).await
}
