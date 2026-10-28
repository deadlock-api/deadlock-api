use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::services::rate_limiter::{DOCUMENTED_DEFAULT, describe};
use crate::services::steam::types::Patch;

#[utoipa::path(
    get,
    path = "/",
    responses(
        (status = OK, body = [Patch]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing the RSS-Feed failed")
    ),
    tags = ["Patches"],
    summary = "Notes",
    description = describe(
        "
**Deprecated:** Use `/v2/patches` instead, which returns a unified feed combining the Forum changelog and the Steam news feed.

Returns the parsed result of the RSS Feed from the official Forum.

RSS-Feed: https://forums.playdeadlock.com/forums/changelog.10/index.rss

    ",
        DOCUMENTED_DEFAULT,
    )
)]
#[deprecated(note = "Use /v2/patches instead")]
pub(super) async fn feed(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    state.steam_client.fetch_patch_notes().await.map(Json)
}
