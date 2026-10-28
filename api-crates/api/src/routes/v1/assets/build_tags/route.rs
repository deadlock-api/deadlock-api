use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{AssetsQuery, find_or_404, load_localized};
use crate::services::assets::versions::build_tags::{BuildTag, fetch_build_tags};

#[utoipa::path(
    get,
    path = "/",
    params(AssetsQuery),
    responses(
        (status = OK, body = [BuildTag]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Build Tags"],
    summary = "List Build Tags",
    description = "Returns the build tag taxonomy used by the game client, derived from per-version localization keys."
)]
pub(super) async fn list_build_tags(
    State(state): State<AppState>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_localized(&state, &q, "build tags", fetch_build_tags).await?).into_response())
}

#[utoipa::path(
    get,
    path = "/{build_tag_id}",
    params(
        ("build_tag_id" = u32, Path, description = "Build tag id (murmurhash2 of `class_name`)"),
        AssetsQuery,
    ),
    responses(
        (status = OK, body = BuildTag),
        (status = NOT_FOUND, description = "Unknown build tag id or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Build Tags"],
    summary = "Get Build Tag",
    description = "Returns a single build tag by id."
)]
pub(super) async fn get_build_tag(
    State(state): State<AppState>,
    Path(build_tag_id): Path<u32>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let tags = load_localized(&state, &q, "build tags", fetch_build_tags).await?;
    find_or_404(
        &tags,
        |t| t.id == build_tag_id,
        format!("Unknown build tag id: {build_tag_id}"),
    )
}

#[utoipa::path(
    get,
    path = "/by-name/{name}",
    params(
        ("name" = String, Path, description = "Build tag `class_name` (e.g. `citadel_build_tag_weapon`)"),
        AssetsQuery,
    ),
    responses(
        (status = OK, body = BuildTag),
        (status = NOT_FOUND, description = "Unknown build tag name or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Build Tags"],
    summary = "Get Build Tag By Name",
    description = "Returns a single build tag by `class_name` (case-insensitive)."
)]
pub(super) async fn get_build_tag_by_name(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let tags = load_localized(&state, &q, "build tags", fetch_build_tags).await?;
    find_or_404(
        &tags,
        |t| t.class_name.eq_ignore_ascii_case(&name),
        format!("Unknown build tag name: {name}"),
    )
}
