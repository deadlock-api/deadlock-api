use core::time::Duration;

use axum::http::StatusCode;
use itertools::Itertools;
use redis::{AsyncTypedCommands, RedisResult};
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
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;

pub(super) fn build_proxy_query<M: prost::Message>(
    msg_type: EgcCitadelClientMessages,
    msg: M,
    username: String,
) -> SteamProxyQuery<M> {
    SteamProxyQuery {
        msg_type,
        msg,
        in_all_groups: None,
        in_any_groups: None,
        cooldown_time: Duration::ZERO,
        request_timeout: Duration::from_secs(2),
        username: Some(username),
        soft_cooldown_millis: None,
    }
}

pub(super) async fn get_party_info(
    redis_client: &mut redis::aio::MultiplexedConnection,
    lobby_id: u64,
) -> RedisResult<Option<String>> {
    redis_client.get(lobby_id.to_string()).await
}

pub(super) async fn get_party_info_with_retries(
    redis_client: &mut redis::aio::MultiplexedConnection,
    lobby_id: u64,
) -> RedisResult<Option<String>> {
    let mut attempts_left = 100;
    let mut interval = tokio::time::interval(Duration::from_millis(100));
    loop {
        let result = get_party_info(redis_client, lobby_id).await;
        attempts_left -= 1;
        if matches!(result, Ok(Some(_))) || attempts_left == 0 {
            return result;
        }
        interval.tick().await;
    }
}

/// Applies the rate limits every custom match endpoint shares, bucketed by `endpoint`.
pub(super) async fn apply_custom_match_rate_limits(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    endpoint: &str,
) -> APIResult<()> {
    state
        .rate_limit_client
        .apply_limits(
            rate_limit_key,
            endpoint,
            &[
                Quota::ip_limit(10, Duration::from_hours(1)),
                Quota::key_limit(100, Duration::from_mins(30)),
                Quota::global_limit(1000, Duration::from_hours(1)),
            ],
        )
        .await?;
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
    let lobby_id = lobby_id.parse().map_err(|_| {
        APIError::status_msg(StatusCode::BAD_REQUEST, "Invalid lobby id".to_owned())
    })?;
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
        .call_steam_proxy(build_proxy_query(
            EgcCitadelClientMessages::KEMsgClientToGcPartySetReadyState,
            msg,
            username.clone(),
        ))
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
        .call_steam_proxy(build_proxy_query(
            EgcCitadelClientMessages::KEMsgClientToGcPartyLeave,
            msg,
            username.clone(),
        ))
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
        .call_steam_proxy(build_proxy_query(
            EgcCitadelClientMessages::KEMsgClientToGcPartyStartMatch,
            msg,
            username.clone(),
        ))
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
