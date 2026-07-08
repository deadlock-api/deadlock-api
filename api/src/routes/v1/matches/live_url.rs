use core::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use cached::macros::cached;
use redis::{AsyncTypedCommands, ExpireOption};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use tracing::debug;
use utoipa::ToSchema;
use uuid::Uuid;
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

const SPECTATED_MATCHES_KEY: &str = "spectated_matches";
const LIVE_URL_TTL_SECS: i64 = 60 * 60;
const MAX_BROADCAST_URLS_PER_REQUEST: usize = 1000;

#[derive(Serialize, ToSchema)]
struct MatchSpectateResponse {
    broadcast_url: String,
    lobby_id: Option<u64>,
}

#[derive(Deserialize, Serialize, ToSchema)]
struct LiveUrl {
    match_id: u64,
    broadcast_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lobby_id: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    updated_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    started_at: Option<i64>,
}

#[derive(Deserialize, ToSchema)]
pub(super) struct IngestLiveUrl {
    match_id: u64,
    broadcast_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lobby_id: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    started_at: Option<i64>,
}

#[cached(
    ttl = 3600,
    convert = "{ api_key }",
    sync_writes = "by_key",
    key = "Uuid"
)]
async fn uses_live_events_pool(
    pg_client: &Pool<Postgres>,
    api_key: Uuid,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT live_events_pool FROM api_keys WHERE key = $1 AND disabled IS false",
        api_key
    )
    .fetch_optional(pg_client)
    .await?;
    Ok(row.is_some_and(|r| r.live_events_pool))
}

#[cached(
    ttl = 60,
    convert = "{ match_id }",
    sync_writes = "by_key",
    key = "u64"
)]
pub(super) async fn spectate_match(
    steam_client: &SteamClient,
    match_id: u64,
    live_events_pool: bool,
) -> Result<(String, Option<u64>), APIError> {
    let client_version = steam_client.get_current_client_version().await?;
    let msg = CMsgClientToGcSpectateLobby {
        match_id: Some(match_id),
        client_version: Some(client_version),
        client_platform: Some(EgcPlatform::KEGcPlatformPc as i32),
        ..Default::default()
    };
    debug!(?msg);
    let primary_group = if live_events_pool {
        "SpectateLobbyLiveEventsApi"
    } else {
        "SpectateLobby"
    };
    let response: CMsgClientToGcSpectateLobbyResponse = steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcSpectateLobby,
            msg,
            in_all_groups: None,
            in_any_groups: Some(vec![
                primary_group.to_owned(),
                "SpectateLobbyOnDemand".to_owned(),
            ]),
            cooldown_time: Duration::from_secs(24 * 60 * 60 / 50),
            request_timeout: Duration::from_secs(2),
            username: None,
            soft_cooldown_millis: None,
        })
        .await
        .map(|s| s.msg)?;

    let Some(response) = response.result else {
        return Err(APIError::internal("Failed to spectate match"));
    };

    match response {
        CMsgClientToGcSpectateUserResponse {
            result: Some(r),
            client_broadcast_url: Some(broadcast_url),
            lobby_id,
            ..
        } if r == c_msg_client_to_gc_spectate_user_response::EResponse::KESuccess as i32 => {
            Ok((broadcast_url, lobby_id))
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
| IP | 2req/h |
| Key | 5req/m, 100req/h |
| Global | 5req/10s, 500req/h |
    "
)]
pub(super) async fn url(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    rate_limit_key: RateLimitKey,
    State(mut state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let (broadcast_url, lobby_id) =
        resolve_broadcast_url(&mut state, &rate_limit_key, match_id).await?;
    Ok(Json(MatchSpectateResponse {
        broadcast_url,
        lobby_id,
    }))
}

/// Resolve a match's live broadcast URL, reusing a cached one when present and otherwise spectating
/// the lobby (rate-limited, since spectating is expensive) and caching the result for 15 minutes.
///
/// # Errors
///
/// Returns `BAD_REQUEST` if the match is too old to be live, `TOO_MANY_REQUESTS` if the spectate
/// rate limit is hit, or an internal error if spectating fails.
pub(super) async fn resolve_broadcast_url(
    state: &mut AppState,
    rate_limit_key: &RateLimitKey,
    match_id: u64,
) -> APIResult<(String, Option<u64>)> {
    let oldest_possibly_live_match_id = state
        .ch_client
        .query("SELECT min(match_id) FROM match_player WHERE start_time >= now() - INTERVAL 4 HOUR SETTINGS log_comment = 'live_url', apply_patch_parts = 0, optimize_use_projections = 0")
        .fetch_one::<u64>()
        .await?;

    if match_id < oldest_possibly_live_match_id {
        return Err(APIError::status_msg(
            reqwest::StatusCode::BAD_REQUEST,
            format!("Match {match_id} cannot be live"),
        ));
    }

    // Check Redis for a cached broadcast URL
    let cached: Option<String> = state
        .redis_client
        .hget(SPECTATED_MATCHES_KEY, match_id.to_string())
        .await?;

    if let Some(cached) = cached
        && let Ok(cached) = serde_json::from_str::<serde_json::Value>(&cached)
        && let Some(broadcast_url) = cached.get("broadcast_url").and_then(|v| v.as_str())
    {
        return Ok((
            broadcast_url.to_string(),
            cached.get("lobby_id").and_then(serde_json::Value::as_u64),
        ));
    }

    state
        .rate_limit_client
        .apply_limits(
            rate_limit_key,
            "spectate",
            &[
                Quota::ip_limit(2, Duration::from_hours(1)),
                Quota::key_limit(5, Duration::from_mins(1)),
                Quota::key_limit(100, Duration::from_hours(1)),
                Quota::global_limit(5, Duration::from_secs(10)),
                Quota::global_limit(500, Duration::from_hours(1)),
            ],
        )
        .await?;

    let live_events_pool = match rate_limit_key.api_key {
        Some(api_key) => uses_live_events_pool(&state.pg_client, api_key)
            .await
            .unwrap_or(false),
        None => false,
    };

    let (broadcast_url, lobby_id) =
        tryhard::retry_fn(|| spectate_match(&state.steam_client, match_id, live_events_pool))
            .retries(3)
            .fixed_backoff(Duration::from_millis(10))
            .await?;

    let payload = &serde_json::json!({
        "match_type": "GapMatch",
        "match_id": match_id,
        "broadcast_url": broadcast_url,
        "lobby_id": lobby_id,
        "updated_at": chrono::Utc::now().timestamp(),
    });
    state
        .redis_client
        .hset(
            SPECTATED_MATCHES_KEY,
            match_id.to_string(),
            serde_json::to_string(payload)?,
        )
        .await?;
    state
        .redis_client
        .hexpire(
            SPECTATED_MATCHES_KEY,
            LIVE_URL_TTL_SECS,
            ExpireOption::NONE,
            match_id.to_string(),
        )
        .await?;

    Ok((broadcast_url, lobby_id))
}

#[utoipa::path(
    get,
    path = "/live/urls",
    responses(
        (status = OK, body = [LiveUrl]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching live URLs failed")
    ),
    tags = ["Matches"],
    summary = "Live Broadcast URLs",
    description = "
Returns a list of all currently available live broadcast URLs.

These can be used in any demofile broadcast parser:
- [Demofile-Net](https://github.com/saul/demofile-net)
- [Haste](https://github.com/blukai/haste/)

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn urls(State(mut state): State<AppState>) -> APIResult<impl IntoResponse> {
    let values: Vec<String> = state.redis_client.hvals(SPECTATED_MATCHES_KEY).await?;
    let urls: Vec<LiveUrl> = values
        .iter()
        .filter_map(|v| serde_json::from_str(v).ok())
        .collect();
    Ok(Json(urls))
}

#[utoipa::path(
    post,
    path = "/live/urls",
    request_body = Vec<IngestLiveUrl>,
    responses(
        (status = OK),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Ingesting live URLs failed")
    ),
    tags = ["Matches"],
    summary = "Ingest Live Broadcast URLs",
    description = "
Submit one or more live broadcast URLs so they show up in the `GET /live/urls` listing.

Each submitted URL is stored for 15 minutes; re-submit periodically to keep a match listed
while it is still live. Existing entries for the same `match_id` are overwritten.

These URLs can be used in any demofile broadcast parser:
- [Demofile-Net](https://github.com/saul/demofile-net)
- [Haste](https://github.com/blukai/haste/)

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn ingest_urls(
    rate_limit_key: RateLimitKey,
    State(mut state): State<AppState>,
    Json(broadcast_urls): Json<Vec<IngestLiveUrl>>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "ingest_broadcast_urls",
            &[Quota::ip_limit(100, Duration::from_secs(1))],
        )
        .await?;

    if broadcast_urls.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "No broadcast URLs provided",
        ));
    }

    if broadcast_urls.len() > MAX_BROADCAST_URLS_PER_REQUEST {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Too many broadcast URLs provided (max {MAX_BROADCAST_URLS_PER_REQUEST}, got {})",
                broadcast_urls.len()
            ),
        ));
    }

    // Validate everything up front so we never persist a partial batch.
    if let Some(invalid) = broadcast_urls
        .iter()
        .find(|b| b.broadcast_url.trim().is_empty())
    {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Empty broadcast_url for match {}", invalid.match_id),
        ));
    }

    let now = chrono::Utc::now().timestamp();
    for broadcast in &broadcast_urls {
        let payload = serde_json::json!({
            "match_type": "IngestedMatch",
            "match_id": broadcast.match_id,
            "broadcast_url": broadcast.broadcast_url,
            "lobby_id": broadcast.lobby_id,
            "updated_at": now,
            "started_at": broadcast.started_at,
        });
        let field = broadcast.match_id.to_string();
        state
            .redis_client
            .hset(
                SPECTATED_MATCHES_KEY,
                &field,
                serde_json::to_string(&payload)?,
            )
            .await?;
        state
            .redis_client
            .hexpire(
                SPECTATED_MATCHES_KEY,
                LIVE_URL_TTL_SECS,
                ExpireOption::NONE,
                &field,
            )
            .await?;
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "urls_ingested": broadcast_urls.len(),
    })))
}
