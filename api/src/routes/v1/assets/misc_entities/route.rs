use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{VersionQuery, find_by_id_or_classname, load_versioned};
use crate::services::assets::versions::misc_entities::{MiscEntity, fetch_misc_entities};

#[utoipa::path(
    get,
    path = "/",
    params(VersionQuery),
    responses(
        (status = OK, body = [MiscEntity]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Misc Entities"],
    summary = "List Misc Entities",
    description = "Returns the per-misc-entity metadata used by the game client, parsed from the patch's KV3 source files."
)]
pub(super) async fn list_misc_entities(
    State(state): State<AppState>,
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(
        Json(load_versioned(&state, &q, "misc entities", fetch_misc_entities).await?)
            .into_response(),
    )
}

#[utoipa::path(
    get,
    path = "/{id_or_classname}",
    params(
        ("id_or_classname" = String, Path, description = "Misc entity id (`murmurhash2(class_name)`) or `class_name`"),
        VersionQuery,
    ),
    responses(
        (status = OK, body = MiscEntity),
        (status = NOT_FOUND, description = "Unknown misc entity id/class_name or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Misc Entities"],
    summary = "Get Misc Entity",
    description = "Returns a single misc entity by numeric id or by `class_name` (case-insensitive)."
)]
pub(super) async fn get_misc_entity(
    State(state): State<AppState>,
    Path(id_or_classname): Path<String>,
    Query(q): Query<VersionQuery>,
) -> APIResult<impl IntoResponse> {
    let entities = load_versioned(&state, &q, "misc entities", fetch_misc_entities).await?;
    find_by_id_or_classname(
        &entities,
        &id_or_classname,
        |e| e.id,
        |e| &e.class_name,
        "misc entity",
    )
}
