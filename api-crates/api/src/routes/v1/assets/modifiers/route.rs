use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{VersionQuery, find_by_id_or_classname, load_versioned};
use crate::services::assets::versions::modifiers::{Modifier, fetch_modifiers};

#[utoipa::path(
    get,
    path = "/",
    params(VersionQuery),
    responses(
        (status = OK, body = [Modifier]),
        (status = NOT_FOUND, description = "Requested client_version is not available, or it has no modifiers data (published from build 6712 on)"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Modifiers"],
    summary = "List Modifiers",
    description = "Returns modifier definitions parsed from the patch's `modifiers.vdata` KV3 source file, including the neutral (\"Haunt\") abilities referenced by NPC units' `neutral_abilities` / `neutral_melee` (`citadel_neutral_*`). Each entry exposes its class and numeric properties; nested properties use dotted paths."
)]
pub(super) async fn list_modifiers(
    State(state): State<AppState>,
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_versioned(&state, &q, "modifiers", fetch_modifiers).await?).into_response())
}

#[utoipa::path(
    get,
    path = "/{id_or_classname}",
    params(
        ("id_or_classname" = String, Path, description = "Modifier id (`murmurhash2(class_name)`) or `class_name`"),
        VersionQuery,
    ),
    responses(
        (status = OK, body = Modifier),
        (status = NOT_FOUND, description = "Unknown modifier id/class_name or client_version, or no modifiers data for that version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Modifiers"],
    summary = "Get Modifier",
    description = "Returns a single modifier by numeric id or by `class_name` (case-insensitive)."
)]
pub(super) async fn get_modifier(
    State(state): State<AppState>,
    Path(id_or_classname): Path<String>,
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    let modifiers = load_versioned(&state, &q, "modifiers", fetch_modifiers).await?;
    find_by_id_or_classname(
        &modifiers,
        &id_or_classname,
        |m| m.id,
        |m| &m.class_name,
        "modifier",
    )
}
