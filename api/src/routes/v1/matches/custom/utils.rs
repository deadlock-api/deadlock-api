use core::time::Duration;

use redis::{AsyncTypedCommands, RedisResult};
use tracing::{error, info};
use valveprotos::deadlock::{
    CMsgClientToGcPartySetReadyState, CMsgClientToGcPartySetReadyStateResponse,
    EgcCitadelClientMessages, c_msg_client_to_gc_party_set_ready_state_response,
};

use crate::error::{APIError, APIResult};
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;

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
) -> APIResult<()> {
    let msg = CMsgClientToGcPartySetReadyState {
        party_id: lobby_id.into(),
        ready_state: true.into(),
        hero_roster: None,
    };
    let response: CMsgClientToGcPartySetReadyStateResponse = steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcPartySetReadyState,
            msg,
            in_all_groups: None,
            in_any_groups: None,
            cooldown_time: Duration::from_secs(0),
            request_timeout: Duration::from_secs(2),
            username: username.clone().into(),
            soft_cooldown_millis: None,
        })
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
