use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};

#[utoipa::path(
    get,
    path = "/",
    responses(
        (status = OK, body = [u32]),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Client Versions"],
    summary = "List Client Versions",
    description = "Returns all known Deadlock client/game versions for which versioned assets \
                   are available, sorted ascending (oldest first)."
)]
pub(super) async fn list_client_versions(
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .version_store
        .ensure_loaded(&state.r2_client)
        .await
        .map_err(|e| APIError::internal(format!("version listing: {e}")))?;
    let versions = state.version_store.all();
    Ok(Json(versions).into_response())
}
