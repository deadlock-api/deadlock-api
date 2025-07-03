use crate::context::AppState;
use crate::error::APIResult;
use crate::services::steam::types::Patch;
use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;

#[utoipa::path(
    get,
    path = "/",
    responses(
        (status = OK, body = [Patch]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing the RSS-Feed failed")
    ),
    tags = ["Patches"],
    summary = "Notes",
    description = "
Returns the parsed result of the RSS Feed from the official Forum.

RSS-Feed: https://forums.playdeadlock.com/forums/changelog.10/index.rss

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn feed(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    state.steam_client.fetch_patch_notes().await.map(Json)
}
