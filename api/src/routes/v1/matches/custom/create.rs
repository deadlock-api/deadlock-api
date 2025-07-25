use core::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_URL_SAFE;
use itertools::Itertools;
use rand::RngCore;
use rand::prelude::ThreadRng;
use redis::{AsyncTypedCommands, RedisResult};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use tokio::time::sleep;
use tracing::{debug, error, info};
use utoipa::{IntoParams, ToSchema};
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

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::{SteamProxyQuery, SteamProxyResponse};

#[derive(Serialize, Deserialize, IntoParams, ToSchema)]
pub(super) struct CreateCustomRequest {
    /// If a callback url is provided, we will send a POST request to this url when the match starts.
    #[serde(default)]
    #[param(default)]
    callback_url: Option<String>,
}

#[derive(Serialize, ToSchema)]
struct CreateCustomResponse {
    party_id: String,
    party_code: String,
    /// If a callback url is provided, this is the secret that should be used to verify the callback.
    /// The secret is a base64 encoded random string. To verify it you should compare it with the X-Callback-Secret header.
    /// If no callback url is provided, this will be None.
    callback_secret: Option<String>,
}

fn generate_callback_secret(length_bytes: usize) -> String {
    let mut secret_bytes = vec![0u8; length_bytes];
    ThreadRng::default().fill_bytes(&mut secret_bytes);
    BASE64_URL_SAFE.encode(&mut secret_bytes)
}

async fn create_party(
    state: &AppState,
) -> APIResult<SteamProxyResponse<CMsgClientToGcPartyCreateResponse>> {
    let msg = CMsgClientToGcPartyCreate {
        party_mm_info: CMsgPartyMmInfo {
            platform: (EgcPlatform::KEGcPlatformPc as i32).into(),
            ping_times: CMsgRegionPingTimesClient {
                data_center_codes: vec![6713953],
                ping_times: vec![20],
            }
            .into(),
            client_version: state
                .steam_client
                .get_current_client_version()
                .await?
                .into(),
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
    let result: SteamProxyResponse<CMsgClientToGcPartyCreateResponse> = state
        .steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcPartyCreate,
            msg,
            in_all_groups: None,
            in_any_groups: None,
            cooldown_time: Duration::from_secs(2 * 60 * 60),
            request_timeout: Duration::from_secs(2),
            username: None,
        })
        .await?;
    Ok(result)
}

async fn get_party_code(
    redis_client: &mut redis::aio::MultiplexedConnection,
    party_id: u64,
) -> RedisResult<Option<String>> {
    redis_client.get(party_id.to_string()).await
}

async fn wait_for_party_code(
    redis_client: &mut redis::aio::MultiplexedConnection,
    party_id: u64,
) -> RedisResult<Option<String>> {
    let mut retries_left = 100;
    let mut interval = tokio::time::interval(Duration::from_millis(100));
    loop {
        match get_party_code(redis_client, party_id).await {
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

async fn switch_to_spectator_slot(
    steam_client: &SteamClient,
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
    let response: CMsgClientToGcPartyActionResponse = steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcPartyAction,
            msg,
            in_all_groups: None,
            in_any_groups: None,
            cooldown_time: Duration::from_secs(0),
            request_timeout: Duration::from_secs(2),
            username: username.into(),
        })
        .await?
        .msg;
    if response
        .result
        .is_none_or(|r| r != c_msg_client_to_gc_party_action_response::EResponse::KESuccess as i32)
    {
        return Err(APIError::internal(format!(
            "Failed to switch to spectator slot: {response:?}"
        )));
    }
    Ok(())
}

async fn make_ready(steam_client: &SteamClient, username: String, party_id: u64) -> APIResult<()> {
    let msg = CMsgClientToGcPartySetReadyState {
        party_id: party_id.into(),
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
        })
        .await?
        .msg;

    info!("Made ready: {username} {party_id} {response:?}");
    let result = response.result;
    if result.is_none_or(|r| {
        r != c_msg_client_to_gc_party_set_ready_state_response::EResponse::KESuccess as i32
    }) {
        error!("Failed to make ready: {username} {party_id} {result:?}");
        return Err(APIError::internal(format!(
            "Failed to make ready: {result:?}"
        )));
    }
    Ok(())
}

async fn leave_party(steam_client: &SteamClient, username: String, party_id: u64) -> APIResult<()> {
    let msg = CMsgClientToGcPartyLeave {
        party_id: party_id.into(),
    };
    let response: CMsgClientToGcPartyLeaveResponse = steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcPartyLeave,
            msg,
            in_all_groups: None,
            in_any_groups: None,
            cooldown_time: Duration::from_secs(0),
            request_timeout: Duration::from_secs(2),
            username: username.clone().into(),
        })
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

#[utoipa::path(
    post,
    path = "/create",
    request_body = CreateCustomRequest,
    responses(
        (status = 200, description = "Successfully fetched custom match id.", body = CreateCustomResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Creating custom match failed")
    ),
    tags = ["Custom Matches"],
    summary = "Create Match",
    description = "
This endpoint allows you to create a custom match.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | API-Key ONLY |
| Key | 100req/30min |
| Global | 1000req/h |
"
)]
pub(super) async fn create_custom(
    rate_limit_key: RateLimitKey,
    State(mut state): State<AppState>,
    payload: Result<Json<CreateCustomRequest>, JsonRejection>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "create_custom",
            &[
                Quota::key_limit(100, Duration::from_secs(30 * 60)),
                Quota::global_limit(1000, Duration::from_secs(60 * 60)),
            ],
        )
        .await?;

    let callback_url = payload.ok().and_then(|p| p.0.callback_url);

    let SteamProxyResponse {
        username,
        msg: created_party,
    } = tryhard::retry_fn(|| create_party(&state))
        .retries(5)
        .linear_backoff(Duration::from_millis(100))
        .await?;
    debug!("Created party: {:?}", created_party);
    let Some(party_id) = created_party.party_id.filter(|&p| p > 0) else {
        error!(
            "Failed to create party, created_party is {:?}",
            created_party
        );
        return Err(APIError::internal("Failed to create party"));
    };

    // Store Callback URL & Callback Secret in Redis
    let callback_secret = match callback_url.map(|c| Url::parse(&c)) {
        Some(Ok(callback_url)) => {
            let callback_secret = generate_callback_secret(32);
            redis::pipe()
                .set_ex(
                    format!("{party_id}:callback-url"),
                    callback_url.to_string(),
                    20 * 60,
                )
                .set_ex(
                    format!("{party_id}:callback-secret"),
                    &callback_secret,
                    20 * 60,
                )
                .exec_async(&mut state.redis_client) // Execute the pipeline
                .await?;
            Some(callback_secret)
        }
        Some(Err(e)) => {
            error!("Failed to parse callback url: {e}");
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                "Failed to parse callback url",
            ));
        }
        None => None,
    };

    let steam_client = state.steam_client.clone();
    let username_clone = username.clone();
    tokio::spawn(async move {
        sleep(Duration::from_secs(15 * 60)).await; // Wait for 15 minutes

        // Leave the party
        let result = leave_party(&steam_client, username_clone, party_id).await;
        if let Err(e) = result {
            error!("Failed to leave party: {e}");
        }
    });

    let party_code = wait_for_party_code(&mut state.redis_client, party_id).await?;
    let Some(party_code) = party_code else {
        error!("Failed to retrieve party code");
        return Err(APIError::internal("Failed to retrieve party code"));
    };
    debug!("Retrieved party code: {party_code}");

    let Some((_, account_id, party_code)) = party_code.split(':').collect_tuple() else {
        error!("Failed to parse party code");
        return Err(APIError::internal("Failed to parse party code"));
    };

    let account_id = account_id
        .parse()
        .map_err(|_| APIError::internal("Failed to parse account id".to_owned()))?;

    switch_to_spectator_slot(&state.steam_client, username.clone(), party_id, account_id).await?;
    make_ready(&state.steam_client, username.clone(), party_id).await?;

    let response = CreateCustomResponse {
        party_id: party_id.to_string(),
        party_code: party_code.to_owned(),
        callback_secret,
    };
    Ok(Json(response))
}
