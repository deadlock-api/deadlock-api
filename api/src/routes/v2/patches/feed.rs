use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::services::steam::types::FeedItem;

#[utoipa::path(
    get,
    path = "/",
    responses(
        (status = OK, body = [FeedItem]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing one of the RSS feeds failed")
    ),
    tags = ["Patches"],
    summary = "Notes",
    description = "
Returns a unified feed combining patch notes from the official Forum changelog and the Steam news feed.

Each entry is tagged with a `source` field (`forum` or `steam`).

- Forum RSS: https://forums.playdeadlock.com/forums/changelog.10/index.rss
- Steam News RSS: https://store.steampowered.com/feeds/news/app/1422450/

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn feed(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    state
        .steam_client
        .fetch_combined_patch_feed()
        .await
        .map(Json)
}
