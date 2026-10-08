use axum::extract::{Path, State};
use axum::response::IntoResponse;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::custom::utils;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[derive(Deserialize, IntoParams, Clone)]
pub(crate) struct LobbyIdQuery {
    pub(crate) lobby_id: String,
}

#[utoipa::path(
    post,
    path = "/{lobby_id}/ready",
    params(LobbyIdQuery),
    responses(
        (status = 200, description = "Successfully ready up."),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Ready up failed")
    ),
    tags = ["Custom Matches"],
    summary = "Ready Up",
    description = "
This endpoint allows you to ready up for a custom match.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/h |
| Key | 100req/30min |
| Global | 1000req/h |
"
)]
pub(super) async fn ready_up(
    Path(LobbyIdQuery { lobby_id }): Path<LobbyIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let (lobby_id, username) =
        utils::resolve_lobby_bot(&state, &rate_limit_key, "ready_up", &lobby_id, true).await?;
    utils::make_ready(&state.steam_client, username, lobby_id, true).await?;
    Ok(())
}

#[utoipa::path(
    post,
    path = "/{lobby_id}/unready",
    params(LobbyIdQuery),
    responses(
        (status = 200, description = "Successfully unready."),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Unready failed")
    ),
    tags = ["Custom Matches"],
    summary = "Unready",
    description = "
This endpoint allows you to unready for a custom match.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/h |
| Key | 100req/30min |
| Global | 1000req/h |
"
)]
pub(super) async fn unready(
    Path(LobbyIdQuery { lobby_id }): Path<LobbyIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let (lobby_id, username) =
        utils::resolve_lobby_bot(&state, &rate_limit_key, "unready", &lobby_id, true).await?;
    utils::make_ready(&state.steam_client, username, lobby_id, false).await?;
    Ok(())
}
