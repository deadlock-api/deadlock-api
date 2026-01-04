use core::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use redis::{AsyncTypedCommands, ExpireOption};
use serde::Serialize;
use tracing::debug;
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgClientToGcSpectateLobby, CMsgClientToGcSpectateLobbyResponse,
    CMsgClientToGcSpectateUserResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_spectate_user_response,
};
use valveprotos::gcsdk::EgcPlatform;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;
use crate::utils::types::MatchIdQuery;

#[derive(Serialize, ToSchema)]
struct MatchSpectateResponse {
    broadcast_url: String,
    lobby_id: Option<u64>,
}

#[cached(
    ty = "TimedCache<u64, CMsgClientToGcSpectateLobbyResponse>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60)) }",
    result = true,
    convert = "{ match_id }",
    sync_writes = "by_key",
    key = "u64"
)]
pub(super) async fn spectate_match(
    steam_client: &SteamClient,
    match_id: u64,
) -> APIResult<CMsgClientToGcSpectateLobbyResponse> {
    let client_version = steam_client.get_current_client_version().await?;
    let msg = CMsgClientToGcSpectateLobby {
        match_id: Some(match_id),
        client_version: Some(client_version),
        client_platform: Some(EgcPlatform::KEGcPlatformPc as i32),
        ..Default::default()
    };
    debug!(?msg);
    Ok(steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcSpectateLobby,
            msg,
            in_all_groups: None,
            in_any_groups: Some(vec![
                "SpectateLobby".to_owned(),
                "SpectateLobbyOnDemand".to_owned(),
            ]),
            cooldown_time: Duration::from_secs(24 * 60 * 60 / 100),
            request_timeout: Duration::from_secs(2),
            username: None,
            soft_cooldown_millis: Some(Duration::from_secs(24 * 60 * 60 / 200)),
        })
        .await
        .map(|s| s.msg)?)
}

#[utoipa::path(
    get,
    path = "/{match_id}/live/url",
    params(MatchIdQuery),
    responses(
        (status = OK, body = MatchSpectateResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Spectating match failed")
    ),
    tags = ["Matches"],
    summary = "Live Broadcast URL",
    description = "
This endpoints spectates a match and returns the live URL to be used in any demofile broadcast parser.

Example Parsers:
- [Demofile-Net](https://github.com/saul/demofile-net)
- [Haste](https://github.com/blukai/haste/)

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/30mins |
| Key | 60req/min |
| Global | 100req/10s |
    "
)]
pub(super) async fn url(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    rate_limit_key: RateLimitKey,
    State(mut state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "spectate",
            &[
                Quota::ip_limit(10, Duration::from_secs(30 * 60)),
                Quota::key_limit(60, Duration::from_secs(60)),
                Quota::global_limit(100, Duration::from_secs(10)),
            ],
        )
        .await?;

    // Check if the match could be live, by checking the match id from a match 4 hours ago
    let match_id_4_hours_ago = state
        .ch_client
        .query("SELECT max(match_id) FROM match_info WHERE created_at < now() - INTERVAL 4 HOUR")
        .fetch_one::<u64>()
        .await?;

    if match_id < match_id_4_hours_ago {
        return Err(APIError::status_msg(
            reqwest::StatusCode::BAD_REQUEST,
            format!("Match {match_id} cannot be live"),
        ));
    }

    let spectate_response = tryhard::retry_fn(|| spectate_match(&state.steam_client, match_id))
        .retries(3)
        .fixed_backoff(Duration::from_millis(10))
        .await?;

    let Some(spectate_response) = spectate_response.result else {
        return Err(APIError::internal("Failed to spectate match"));
    };

    match spectate_response {
        CMsgClientToGcSpectateUserResponse {
            result: Some(r),
            client_broadcast_url: Some(broadcast_url),
            lobby_id,
            ..
        } if r == c_msg_client_to_gc_spectate_user_response::EResponse::KESuccess as i32 => {
            let payload = &serde_json::json!({
                "match_type": "GapMatch",
                "match_id": match_id,
                "updated_at": chrono::Utc::now().timestamp(),
            });
            state
                .redis_client
                .hset(
                    "spectated_matches",
                    match_id.to_string(),
                    serde_json::to_string(payload)?,
                )
                .await?;
            state
                .redis_client
                .hexpire(
                    "spectated_matches",
                    900,
                    ExpireOption::NONE,
                    match_id.to_string(),
                )
                .await?;

            Ok(Json(MatchSpectateResponse {
                broadcast_url,
                lobby_id,
            }))
        }
        failed => {
            let result: Option<c_msg_client_to_gc_spectate_user_response::EResponse> =
                failed.result.and_then(|r| r.try_into().ok());
            Err(APIError::internal(format!(
                "Failed to spectate match: {:?}",
                result.map_or("Unknown", |r| r.as_str_name())
            )))
        }
    }
}
