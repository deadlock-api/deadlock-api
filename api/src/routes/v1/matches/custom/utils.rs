use core::time::Duration;

use redis::{AsyncTypedCommands, RedisResult};
use tracing::{error, info};
use valveprotos::deadlock::{
    CMsgClientToGcPartyLeave, CMsgClientToGcPartyLeaveResponse, CMsgClientToGcPartySetReadyState,
    CMsgClientToGcPartySetReadyStateResponse, CMsgClientToGcPartyStartMatch,
    CMsgClientToGcPartyStartMatchResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_party_leave_response, c_msg_client_to_gc_party_set_ready_state_response,
    c_msg_client_to_gc_party_start_match_response,
};

use crate::error::{APIError, APIResult};
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;

fn build_proxy_query<M: prost::Message>(
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
    let mut retries_left = 100;
    let mut interval = tokio::time::interval(Duration::from_millis(100));
    loop {
        match get_party_info(redis_client, lobby_id).await {
            Ok(Some(party_code)) => {
                return Ok(Some(party_code));
            }
            Ok(None) => {
                retries_left -= 1;
                if retries_left <= 0 {
                    return Ok(None);
                }
                interval.tick().await;
            }
            Err(e) => {
                retries_left -= 1;
                if retries_left <= 0 {
                    return Err(e);
                }
                interval.tick().await;
            }
        }
    }
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
    if result
        .is_none_or(|r| r != c_msg_client_to_gc_party_leave_response::EResponse::KESuccess as i32)
    {
        error!("Failed to leave party: {username} {party_id} {result:?}");
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
