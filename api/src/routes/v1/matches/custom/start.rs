use core::time::Duration;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use itertools::Itertools;
use tracing::error;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::custom::ready::LobbyIdQuery;
use crate::routes::v1::matches::custom::utils;
use crate::services::rate_limiter::Quota;
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
| IP | API-Key ONLY |
| Key | 100req/30min |
| Global | 1000req/h |
"
)]
pub(super) async fn start(
    Path(LobbyIdQuery { lobby_id }): Path<LobbyIdQuery>,
    rate_limit_key: RateLimitKey,
    State(mut state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "start_match",
            &[
                Quota::key_limit(100, Duration::from_mins(30)),
                Quota::global_limit(1000, Duration::from_hours(1)),
            ],
        )
        .await?;
    let lobby_id = lobby_id.parse().map_err(|_| {
        APIError::status_msg(StatusCode::BAD_REQUEST, "Invalid lobby id".to_owned())
    })?;
    let party_info = utils::get_party_info(&mut state.redis_client, lobby_id).await?;
    let Some(party_info) = party_info else {
        error!("Failed to retrieve party info");
        return Err(APIError::internal("Failed to retrieve party info"));
    };
    let Some((username, _, _)) = party_info.split(':').collect_tuple() else {
        error!("Failed to parse party info");
        return Err(APIError::internal("Failed to parse party info"));
    };
    utils::start_match(&state.steam_client, username.to_string(), lobby_id).await?;
    Ok(())
}
