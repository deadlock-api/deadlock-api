use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::MatchIdQuery;
use crate::services::rate_limiter::RateLimitQuota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::Serialize;
use std::time::Duration;
use tracing::debug;
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgClientToGcSpectateLobby, CMsgClientToGcSpectateLobbyResponse,
    CMsgClientToGcSpectateUserResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_spectate_user_response,
};
use valveprotos::gcsdk::EgcPlatform;

#[derive(Serialize, ToSchema)]
pub struct MatchSpectateResponse {
    broadcast_url: String,
    lobby_id: Option<u64>,
}

#[cached(
    ty = "TimedCache<u64, CMsgClientToGcSpectateLobbyResponse>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ match_id }",
    sync_writes = "by_key",
    key = "u64"
)]
pub async fn spectate_match(
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
                "SpectateLobby".to_string(),
                "SpectateLobbyOnDemand".to_string(),
            ]),
            cooldown_time: Duration::from_secs(24 * 60 * 60 / 50),
            request_timeout: Duration::from_secs(2),
            username: None,
        })
        .await
        .map(|s| s.msg)?)
}

#[utoipa::path(
    get,
    path = "/{match_id}/live-url",
    params(MatchIdQuery),
    responses(
        (status = OK, body = MatchSpectateResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Spectating match failed")
    ),
    tags = ["Matches"],
    summary = "Match Live Broadcast URL",
    description = r#"
This endpoints specates a match and returns the live URL to be used in any demofile broadcast parser.

Example Parsers:
- [Demofile-Net](https://github.com/saul/demofile-net)
- [Haste](https://github.com/blukai/haste/)
    "#
)]
pub async fn live_url(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "spectate",
            &[
                RateLimitQuota::ip_limit(10, Duration::from_secs(30 * 60)),
                RateLimitQuota::key_limit(10, Duration::from_secs(60)),
                RateLimitQuota::global_limit(10, Duration::from_secs(10)),
            ],
        )
        .await?;

    // Check if the match could be live, by checking the match id from a match 2 hours ago
    let match_id_2_hours_ago = state
        .ch_client
        .query("SELECT match_id FROM match_info WHERE created_at < now() - INTERVAL 2 HOUR ORDER BY match_id DESC LIMIT 1")
        .fetch_one::<u64>()
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch match id from Clickhouse: {e}"),
        })?;

    if match_id < match_id_2_hours_ago {
        return Err(APIError::StatusMsg {
            status: reqwest::StatusCode::BAD_REQUEST,
            message: format!("Match {match_id} cannot be live"),
        });
    }

    let spectate_response = tryhard::retry_fn(|| spectate_match(&state.steam_client, match_id))
        .retries(3)
        .fixed_backoff(Duration::from_millis(10))
        .await;

    let Ok(spectate_response) = spectate_response else {
        return Err(APIError::InternalError {
            message: "Failed to spectate match".to_string(),
        });
    };
    let Some(spectate_response) = spectate_response.result else {
        return Err(APIError::InternalError {
            message: "Failed to spectate match".to_string(),
        });
    };

    match spectate_response {
        CMsgClientToGcSpectateUserResponse {
            result: Some(r),
            client_broadcast_url: Some(broadcast_url),
            lobby_id,
            ..
        } if r == c_msg_client_to_gc_spectate_user_response::EResponse::KESuccess as i32 => {
            Ok(Json(MatchSpectateResponse {
                broadcast_url,
                lobby_id,
            }))
        }
        failed => {
            let result: Option<c_msg_client_to_gc_spectate_user_response::EResponse> =
                failed.result.and_then(|r| r.try_into().ok());
            Err(APIError::InternalError {
                message: format!(
                    "Failed to spectate match: {:?}",
                    result.map(|r| r.as_str_name()).unwrap_or("Unknown")
                ),
            })
        }
    }
}
