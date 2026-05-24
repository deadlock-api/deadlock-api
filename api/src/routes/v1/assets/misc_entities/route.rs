use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use reqwest::StatusCode;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::resolve_version;
use crate::services::assets::versions::misc_entities::{self, MiscEntity};

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct MiscEntitiesQuery {
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    client_version: Option<u32>,
}

#[utoipa::path(
    get,
    path = "/",
    params(MiscEntitiesQuery),
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
    Query(q): Query<MiscEntitiesQuery>,
) -> APIResult<impl IntoResponse> {
    let entities = load_misc_entities(&state, q.client_version).await?;
    Ok(Json(entities).into_response())
}

#[utoipa::path(
    get,
    path = "/{id_or_classname}",
    params(
        ("id_or_classname" = String, Path, description = "Misc entity id (`murmurhash2(class_name)`) or `class_name`"),
        MiscEntitiesQuery,
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
    Query(q): Query<MiscEntitiesQuery>,
) -> APIResult<impl IntoResponse> {
    let entities = load_misc_entities(&state, q.client_version).await?;
    let as_id = id_or_classname.parse::<u32>().ok();
    entities
        .iter()
        .find(|e| {
            as_id.is_some_and(|id| e.id == id)
                || e.class_name.eq_ignore_ascii_case(&id_or_classname)
        })
        .cloned()
        .map(Json)
        .ok_or_else(|| {
            APIError::status_msg(
                StatusCode::NOT_FOUND,
                format!("Unknown misc entity: {id_or_classname}"),
            )
        })
}

async fn load_misc_entities(
    state: &AppState,
    client_version: Option<u32>,
) -> APIResult<std::sync::Arc<Vec<MiscEntity>>> {
    let version = resolve_version(state, client_version).await?;
    misc_entities::fetch_misc_entities(&state.r2_client, version)
        .await
        .map_err(|e| APIError::internal(format!("building misc entities: {e}")))
}
