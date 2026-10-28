use core::time::Duration;

use axum::http::StatusCode;
use itertools::Itertools as _;
use redis::{AsyncTypedCommands as _, RedisResult};
use steam_proxy::SteamProxyOptions;
use tracing::{error, info};
use valveprotos::deadlock::{
    CMsgClientToGcPartyLeave, CMsgClientToGcPartyLeaveResponse, CMsgClientToGcPartySetReadyState,
    CMsgClientToGcPartySetReadyStateResponse, CMsgClientToGcPartyStartMatch,
    CMsgClientToGcPartyStartMatchResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_party_leave_response, c_msg_client_to_gc_party_set_ready_state_response,
    c_msg_client_to_gc_party_start_match_response,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Quota, RateLimit, Scope};
use crate::services::steam::client::SteamClient;

/// Options for a job on the bot that hosts the party.
pub(super) const fn party_options(username: &str) -> SteamProxyOptions<'_> {
    SteamProxyOptions {
        in_all_groups: None,
        in_any_groups: None,
        cooldown: Duration::ZERO,
        soft_cooldown: None,
        request_timeout: Duration::from_secs(2),
        username: Some(username),
    }
}

pub(super) async fn get_party_info(
    redis_client: &mut redis::aio::ConnectionManager,
    lobby_id: u64,
) -> RedisResult<Option<String>> {
    redis_client.get(lobby_id.to_string()).await
}

pub(super) async fn get_party_info_with_retries(
    redis_client: &mut redis::aio::ConnectionManager,
    lobby_id: u64,
) -> RedisResult<Option<String>> {
    let mut attempts_left = 100u32;
    let mut interval = tokio::time::interval(Duration::from_millis(100));
    loop {
        let result = get_party_info(redis_client, lobby_id).await;
        attempts_left = attempts_left.saturating_sub(1);
        if matches!(result, Ok(Some(_))) || attempts_left == 0 {
            return result;
        }
        interval.tick().await;
    }
}

/// The quotas of every custom match endpoint, each counted in its own bucket.
pub(super) const QUOTAS: &[Quota] = &[
    Quota::new(Scope::Ip, 10, Duration::from_hours(1)),
    Quota::new(Scope::Key, 100, Duration::from_mins(30)),
    Quota::new(Scope::Global, 1000, Duration::from_hours(1)),
];

/// Applies [`QUOTAS`] in the bucket `endpoint`.
pub(super) async fn apply_custom_match_rate_limits(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    endpoint: &str,
) -> APIResult<()> {
    let limit = RateLimit::new(endpoint, QUOTAS);
    state.rate_limit_client.check(rate_limit_key, limit).await?;
    Ok(())
}

/// Rate limits a lobby action under `endpoint`, then resolves the lobby's party id and the
/// username of the bot hosting it. `wait_for_party` keeps polling for a party that is still
/// being set up.
pub(super) async fn resolve_lobby_bot(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    endpoint: &str,
    lobby_id: &str,
    wait_for_party: bool,
) -> APIResult<(u64, String)> {
    apply_custom_match_rate_limits(state, rate_limit_key, endpoint).await?;
    let Ok(lobby_id) = lobby_id.parse() else {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Invalid lobby id".to_owned(),
        ));
    };
    let redis_client = &mut state.redis_client.clone();
    let party_info = if wait_for_party {
        get_party_info_with_retries(redis_client, lobby_id).await?
    } else {
        get_party_info(redis_client, lobby_id).await?
    };
    let Some(party_info) = party_info else {
        error!("Failed to retrieve party info");
        return Err(APIError::internal("Failed to retrieve party info"));
    };
    let Some((username, _, _)) = party_info.split(':').collect_tuple() else {
        error!("Failed to parse party info");
        return Err(APIError::internal("Failed to parse party info"));
    };
    Ok((lobby_id, username.to_owned()))
}

pub(super) async fn make_ready(
    steam_client: &SteamClient,
    username: String,
    lobby_id: u64,
    read_state: bool,
) -> APIResult<()> {
    let msg = CMsgClientToGcPartySetReadyState {
        party_id: lobby_id.into(),
        ready_state: read_state.into(),
        hero_roster: None,
    };
    let response: CMsgClientToGcPartySetReadyStateResponse = steam_client
        .call_steam_proxy(
            EgcCitadelClientMessages::KEMsgClientToGcPartySetReadyState,
            &msg,
            party_options(&username),
        )
        .await?
        .msg;

    info!("Made ready: {username} {lobby_id} {response:?}");
    let result = response.result;
    if result.is_none_or(|r| {
        r != c_msg_client_to_gc_party_set_ready_state_response::EResponse::KESuccess as i32
    }) {
        error!("Failed to make ready: {username} {lobby_id} {result:?}");
        return Err(APIError::internal(format!(
            "Failed to make ready: {result:?}"
        )));
    }
    Ok(())
}

pub(super) async fn leave_party(
    steam_client: &SteamClient,
    username: String,
    party_id: u64,
) -> APIResult<()> {
    let msg = CMsgClientToGcPartyLeave {
        party_id: party_id.into(),
    };
    let response: CMsgClientToGcPartyLeaveResponse = steam_client
        .call_steam_proxy(
            EgcCitadelClientMessages::KEMsgClientToGcPartyLeave,
            &msg,
            party_options(&username),
        )
        .await?
        .msg;

    info!("Left Party: {username} {party_id} {response:?}");
    let result = response.result;
    if result.is_none_or(|r| {
        r != c_msg_client_to_gc_party_leave_response::EResponse::KESuccess as i32
            && r != c_msg_client_to_gc_party_leave_response::EResponse::KENotInParty as i32
    }) {
        return Err(APIError::internal(format!(
            "Failed to leave party: {result:?}"
        )));
    }
    Ok(())
}

pub(super) async fn start_match(
    steam_client: &SteamClient,
    username: String,
    party_id: u64,
) -> APIResult<()> {
    let msg = CMsgClientToGcPartyStartMatch {
        party_id: party_id.into(),
    };
    let response: CMsgClientToGcPartyStartMatchResponse = steam_client
        .call_steam_proxy(
            EgcCitadelClientMessages::KEMsgClientToGcPartyStartMatch,
            &msg,
            party_options(&username),
        )
        .await?
        .msg;

    info!("Start match: {username} {party_id} {response:?}");
    let result = response.result;
    if result.is_none_or(|r| {
        r != c_msg_client_to_gc_party_start_match_response::EResponse::KESuccess as i32
    }) {
        error!("Failed to start match: {username} {party_id} {result:?}");
        return Err(APIError::internal(format!(
            "Failed to start match: {result:?}"
        )));
    }
    Ok(())
}
