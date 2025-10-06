use core::time::Duration;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use itertools::Itertools;
use serde::Deserialize;
use tracing::error;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::custom::utils;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[derive(Deserialize, IntoParams, Clone)]
pub(crate) struct LobbyIdQuery {
    pub(crate) lobby_id: String,
}

#[utoipa::path(
    post,
    path = "/{lobby_id}/ready",
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
| IP | API-Key ONLY |
| Key | 100req/30min |
| Global | 1000req/h |
"
)]
pub(super) async fn ready_up(
    Path(LobbyIdQuery { lobby_id }): Path<LobbyIdQuery>,
    rate_limit_key: RateLimitKey,
    State(mut state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "ready_up",
            &[
                Quota::key_limit(100, Duration::from_secs(30 * 60)),
                Quota::global_limit(1000, Duration::from_secs(60 * 60)),
            ],
        )
        .await?;
    let lobby_id = lobby_id.parse().map_err(|_| {
        APIError::status_msg(StatusCode::BAD_REQUEST, "Invalid lobby id".to_owned())
    })?;
    let party_code = utils::get_party_info_with_retries(&mut state.redis_client, lobby_id).await?;
    let Some(party_code) = party_code else {
        error!("Failed to retrieve party info");
        return Err(APIError::internal("Failed to retrieve party info"));
    };
    let Some((username, _, _)) = party_code.split(':').collect_tuple() else {
        error!("Failed to parse party info");
        return Err(APIError::internal("Failed to parse party info"));
    };
    utils::make_ready(&state.steam_client, username.to_string(), lobby_id).await?;
    Ok(())
}
