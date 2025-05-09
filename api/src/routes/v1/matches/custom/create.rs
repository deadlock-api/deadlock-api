use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::limiter::{RateLimitQuota, apply_limits};
use crate::utils::steam;
use crate::utils::steam::SteamProxyQuery;
use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use itertools::Itertools;
use prost::Message;
use redis::{AsyncCommands, RedisResult};
use serde::Serialize;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, info, warn};
use utoipa::ToSchema;
use valveprotos::deadlock::c_msg_client_to_gc_party_action::EAction;
use valveprotos::deadlock::{
    CMsgClientToGcPartyAction, CMsgClientToGcPartyActionResponse, CMsgClientToGcPartyCreate,
    CMsgClientToGcPartyCreateResponse, CMsgClientToGcPartyLeave, CMsgClientToGcPartyLeaveResponse,
    CMsgClientToGcPartySetReadyState, CMsgClientToGcPartySetReadyStateResponse, CMsgPartyMmInfo,
    CMsgRegionPingTimesClient, ECitadelBotDifficulty, ECitadelMmPreference,
    EgcCitadelClientMessages, c_msg_client_to_gc_party_action_response,
    c_msg_client_to_gc_party_leave_response, c_msg_client_to_gc_party_set_ready_state_response,
    cso_citadel_party,
};
use valveprotos::gcsdk::EgcPlatform;

#[derive(Serialize, ToSchema)]
pub struct CreateCustomResponse {
    pub party_id: u64,
    pub party_code: String,
}

async fn create_party(
    config: &Config,
    http_client: &reqwest::Client,
) -> APIResult<(CMsgClientToGcPartyCreateResponse, String)> {
    let msg = CMsgClientToGcPartyCreate {
        party_mm_info: CMsgPartyMmInfo {
            platform: (EgcPlatform::KEGcPlatformPc as i32).into(),
            ping_times: CMsgRegionPingTimesClient {
                data_center_codes: vec![6713953],
                ping_times: vec![20],
            }
            .into(),
            client_version: steam::get_current_client_version(http_client).await?.into(),
            region_mode: None,
        }
        .into(),
        invite_account_id: None,
        disable_party_code: false.into(),
        is_private_lobby: true.into(),
        region_mode: None,
        server_search_key: None,
        mm_preference: (ECitadelMmPreference::KECitadelMmPreferenceCasual as i32).into(),
        private_lobby_settings: cso_citadel_party::PrivateLobbySettings {
            min_roster_size: None,
            match_slots: vec![],
            randomize_lanes: false.into(),
            server_region: None,
            is_publicly_visible: true.into(),
            cheats_enabled: false.into(),
            available_regions: vec![],
            duplicate_heroes_enabled: false.into(),
            experimental_heroes_enabled: false.into(),
        }
        .into(),
        bot_difficulty: (ECitadelBotDifficulty::KECitadelBotDifficultyNone as i32).into(),
    };
    let result = steam::call_steam_proxy(
        config,
        http_client,
        SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcPartyCreate,
            msg,
            in_all_groups: Some(vec!["LowRateLimitApis".to_string()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(2 * 60 * 60),
            request_timeout: Duration::from_secs(2),
            username: None,
        },
    )
    .await
    .map_err(|e| APIError::InternalError {
        message: format!("Failed to create party: {e}"),
    })?;
    let raw_data = BASE64_STANDARD
        .decode(&result.data)
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to decode party create response: {e}"),
        })?;
    let decoded_message =
        CMsgClientToGcPartyCreateResponse::decode(raw_data.as_ref()).map_err(|e| {
            APIError::InternalError {
                message: format!("Failed to parse party create response: {e}"),
            }
        })?;
    Ok((decoded_message, result.username))
}

pub async fn get_party_code(
    redis_client: &mut redis::aio::MultiplexedConnection,
    party_id: u64,
) -> RedisResult<String> {
    redis_client.get(party_id.to_string()).await
}

pub async fn wait_for_party_code(
    redis_client: &mut redis::aio::MultiplexedConnection,
    party_id: u64,
) -> RedisResult<String> {
    let mut retries_left = 100;
    loop {
        match get_party_code(redis_client, party_id).await {
            Ok(party_code) => {
                return Ok(party_code);
            }
            Err(e) => {
                retries_left -= 1;
                if retries_left <= 0 {
                    return Err(e);
                }
                sleep(Duration::from_millis(100)).await;
            }
        }
    }
}

async fn switch_to_spectator_slot(
    config: &Config,
    http_client: &reqwest::Client,
    username: String,
    party_id: u64,
    account_id: u32,
) -> APIResult<()> {
    let msg = CMsgClientToGcPartyAction {
        party_id: party_id.into(),
        target_account_id: account_id.into(),
        action_id: (EAction::KESetPlayerSlot as i32).into(),
        uint_value: 31.into(),
        ..Default::default()
    };
    let result = steam::call_steam_proxy(
        config,
        http_client,
        SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcPartyAction,
            msg,
            in_all_groups: Some(vec!["LowRateLimitApis".to_string()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(0),
            request_timeout: Duration::from_secs(2),
            username: username.into(),
        },
    )
    .await
    .map_err(|e| APIError::InternalError {
        message: format!("Failed to switch to spectator slot in party: {e:?}"),
    })
    .and_then(|r| {
        BASE64_STANDARD
            .decode(&r.data)
            .map_err(|e| APIError::InternalError {
                message: format!("Failed to decode party action response: {e}"),
            })
    })
    .and_then(|raw_data| {
        CMsgClientToGcPartyActionResponse::decode(raw_data.as_ref()).map_err(|e| {
            APIError::InternalError {
                message: format!("Failed to parse party action response: {e}"),
            }
        })
    })?
    .result;
    if result
        .is_none_or(|r| r != c_msg_client_to_gc_party_action_response::EResponse::KESuccess as i32)
    {
        return Err(APIError::InternalError {
            message: format!("Failed to switch to spectator slot: {result:?}"),
        });
    }
    Ok(())
}

async fn make_ready(
    config: &Config,
    http_client: &reqwest::Client,
    username: String,
    party_id: u64,
) -> APIResult<()> {
    let msg = CMsgClientToGcPartySetReadyState {
        party_id: party_id.into(),
        ready_state: true.into(),
        hero_roster: None,
    };
    let result = steam::call_steam_proxy(
        config,
        http_client,
        SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcPartySetReadyState,
            msg,
            in_all_groups: Some(vec!["LowRateLimitApis".to_string()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(0),
            request_timeout: Duration::from_secs(2),
            username: username.clone().into(),
        },
    )
    .await
    .map_err(|e| APIError::InternalError {
        message: format!("Failed to set ready: {e}"),
    })
    .and_then(|r| {
        BASE64_STANDARD
            .decode(&r.data)
            .map_err(|e| APIError::InternalError {
                message: format!("Failed to decode set ready response: {e}"),
            })
    })
    .and_then(|raw_data| {
        CMsgClientToGcPartySetReadyStateResponse::decode(raw_data.as_ref()).map_err(|e| {
            APIError::InternalError {
                message: format!("Failed to parse set ready response: {e}"),
            }
        })
    })?;

    info!("Made ready: {username} {party_id} {result:?}");
    let result = result.result;
    if result.is_none_or(|r| {
        r != c_msg_client_to_gc_party_set_ready_state_response::EResponse::KESuccess as i32
    }) {
        warn!("Failed to make ready: {username} {party_id} {result:?}");
        return Err(APIError::InternalError {
            message: format!("Failed to make ready: {result:?}"),
        });
    }
    Ok(())
}

async fn leave_party(
    config: &Config,
    http_client: &reqwest::Client,
    username: String,
    party_id: u64,
) -> APIResult<()> {
    let msg = CMsgClientToGcPartyLeave {
        party_id: party_id.into(),
    };
    let result = steam::call_steam_proxy(
        config,
        http_client,
        SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcPartyLeave,
            msg,
            in_all_groups: Some(vec!["LowRateLimitApis".to_string()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(0),
            request_timeout: Duration::from_secs(2),
            username: username.clone().into(),
        },
    )
    .await
    .map_err(|e| APIError::InternalError {
        message: format!("Failed to leave party: {e}"),
    })
    .and_then(|r| {
        BASE64_STANDARD
            .decode(&r.data)
            .map_err(|e| APIError::InternalError {
                message: format!("Failed to decode leave party response: {e}"),
            })
    })
    .and_then(|raw_data| {
        CMsgClientToGcPartyLeaveResponse::decode(raw_data.as_ref()).map_err(|e| {
            APIError::InternalError {
                message: format!("Failed to parse leave party response: {e}"),
            }
        })
    })?;

    info!("Left Party: {username} {party_id} {result:?}");
    let result = result.result;
    if result
        .is_none_or(|r| r != c_msg_client_to_gc_party_leave_response::EResponse::KESuccess as i32)
    {
        warn!("Failed to leave party: {username} {party_id} {result:?}");
        return Err(APIError::InternalError {
            message: format!("Failed to leave party: {result:?}"),
        });
    }
    Ok(())
}

#[utoipa::path(
    post,
    path = "/create",
    responses(
        (status = 200, description = "Successfully fetched custom match id.", body = CreateCustomResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Creating custom match failed")
    ),
    tags = ["Custom Matches [PREVIEW]"],
    summary = "Create Custom Match",
    description = "This endpoint allows you to create a custom match."
)]
pub async fn create_custom(
    headers: HeaderMap,
    State(mut state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(
        &headers,
        &state,
        "create_custom",
        &[
            RateLimitQuota::key_limit(10, Duration::from_secs(3600)),
            RateLimitQuota::global_limit(100, Duration::from_secs(3600)),
        ],
    )
    .await?;

    let (created_party, username) = create_party(&state.config, &state.http_client).await?;
    debug!("Created party: {:?}", created_party);
    let Some(party_id) = created_party.party_id.filter(|&p| p > 0) else {
        warn!("Failed to create party");
        return Err(APIError::InternalError {
            message: "Failed to create party".to_string(),
        });
    };

    let config_clone = state.config.clone();
    let username_clone = username.clone();
    tokio::spawn(async move {
        sleep(Duration::from_secs(15 * 60)).await; // Wait for 15 minutes

        // Leave the party
        let http_client = reqwest::Client::new();
        let result = leave_party(&config_clone, &http_client, username_clone, party_id).await;
        if let Err(e) = result {
            warn!("Failed to leave party: {e}");
        };
    });

    let party_code = wait_for_party_code(&mut state.redis_client, party_id)
        .await
        .map_err(|e| {
            warn!("Failed to retrieve party code: {e}");
            APIError::InternalError {
                message: "Failed to retrieve party code".to_string(),
            }
        })?;
    debug!("Retrieved party code: {party_code}");

    let Some((_, account_id, party_code)) = party_code.split(':').collect_tuple() else {
        warn!("Failed to parse party code");
        return Err(APIError::InternalError {
            message: "Failed to parse party code".to_string(),
        });
    };

    let account_id = account_id.parse().map_err(|_| APIError::InternalError {
        message: "Failed to parse account id".to_string(),
    })?;

    match switch_to_spectator_slot(
        &state.config,
        &state.http_client,
        username.clone(),
        party_id,
        account_id,
    )
    .await
    {
        Ok(_) => {
            debug!("Switched to spectator slot");
        }
        Err(e) => {
            warn!("Failed to switch to spectator slot: {e}");
            return Err(APIError::InternalError {
                message: "Failed to switch to spectator slot".to_string(),
            });
        }
    }

    match make_ready(
        &state.config,
        &state.http_client,
        username.clone(),
        party_id,
    )
    .await
    {
        Ok(_) => {
            debug!("Made ready");
        }
        Err(e) => {
            warn!("Failed to make ready: {e}");
            return Err(APIError::InternalError {
                message: "Failed to make ready".to_string(),
            });
        }
    }

    let response = CreateCustomResponse {
        party_id,
        party_code: party_code.to_string(),
    };
    Ok(Json(response))
}
