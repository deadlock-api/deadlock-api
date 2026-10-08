use axum::extract::{Path, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::custom::ready::LobbyIdQuery;
use crate::routes::v1::matches::custom::utils;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[utoipa::path(
    post,
    path = "/{lobby_id}/start",
    params(LobbyIdQuery),
    responses(
        (status = 200, description = "Successfully started the match."),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Starting match failed")
    ),
    tags = ["Custom Matches"],
    summary = "Start Match",
    description = "
This endpoint starts a custom match.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/h |
| Key | 100req/30min |
| Global | 1000req/h |
"
)]
pub(super) async fn start(
    Path(LobbyIdQuery { lobby_id }): Path<LobbyIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let (lobby_id, username) =
        utils::resolve_lobby_bot(&state, &rate_limit_key, "start_match", &lobby_id, false).await?;
    utils::start_match(&state.steam_client, username, lobby_id).await?;
    Ok(())
}
