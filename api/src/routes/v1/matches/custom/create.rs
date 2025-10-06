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
use reqwest::Url;
use serde::{Deserialize, Serialize};
use strum::Display;
use tokio::time::sleep;
use tracing::{debug, error, info};
use utoipa::{IntoParams, ToSchema};
use valveprotos::deadlock::c_msg_client_to_gc_party_action::EAction;
use valveprotos::deadlock::{
    CMsgClientToGcPartyAction, CMsgClientToGcPartyActionResponse, CMsgClientToGcPartyCreate,
    CMsgClientToGcPartyCreateResponse, CMsgClientToGcPartyLeave, CMsgClientToGcPartyLeaveResponse,
    CMsgPartyMmInfo, CMsgRegionPingTimesClient, ECitadelBotDifficulty, ECitadelMmPreference,
    EgcCitadelClientMessages, c_msg_client_to_gc_party_action_response,
    c_msg_client_to_gc_party_leave_response, cso_citadel_party,
};
use valveprotos::gcsdk::EgcPlatform;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::custom::utils;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::{SteamProxyQuery, SteamProxyResponse};

#[derive(Clone, Deserialize, IntoParams, ToSchema)]
pub(super) struct CreateCustomRequest {
    /// If a callback url is provided, we will send a POST request to this url when the match starts.
    #[serde(default)]
    #[param(default)]
    callback_url: Option<String>,
    /// If auto-ready is disabled, the bot will not automatically ready up.
    /// You need to call the `ready` endpoint to ready up.
    #[serde(default)]
    #[param(default)]
    disable_auto_ready: Option<bool>,
    #[serde(default)]
    #[param(default)]
    region_mode: Option<RegionMode>,
    #[serde(default)]
    #[param(default, minimum = 1, maximum = 12)]
    min_roster_size: Option<u32>,
    #[serde(default)]
    #[param(default)]
    randomize_lanes: Option<bool>,
    #[serde(default)]
    #[param(default)]
    is_publicly_visible: Option<bool>,
    #[serde(default)]
    #[param(default)]
    cheats_enabled: Option<bool>,
    #[serde(default)]
    #[param(default)]
    duplicate_heroes_enabled: Option<bool>,
    #[serde(default)]
    #[param(default)]
    experimental_heroes_enabled: Option<bool>,
}

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Display, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
#[repr(i32)]
enum RegionMode {
    Row = 0,
    Europe = 1,
    SeAsia = 2,
    SAmerica = 3,
    Russia = 4,
    Oceania = 5,
}

impl From<RegionMode> for i32 {
    fn from(val: RegionMode) -> Self {
        val as i32
    }
}

impl From<RegionMode> for u32 {
    fn from(val: RegionMode) -> Self {
        val as u32
    }
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
    settings: Option<CreateCustomRequest>,
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
            region_mode: settings
                .as_ref()
                .and_then(|m| m.region_mode.map(Into::into)),
        }
        .into(),
        invite_account_id: None,
        disable_party_code: false.into(),
        is_private_lobby: true.into(),
        region_mode: settings
            .as_ref()
            .and_then(|m| m.region_mode.map(Into::into)),
        server_search_key: None,
        mm_preference: (ECitadelMmPreference::KECitadelMmPreferenceCasual as i32).into(),
        private_lobby_settings: cso_citadel_party::PrivateLobbySettings {
            min_roster_size: settings.as_ref().and_then(|m| m.min_roster_size),
            match_slots: vec![],
            randomize_lanes: settings.as_ref().and_then(|m| m.randomize_lanes),
            server_region: settings
                .as_ref()
                .and_then(|m| m.region_mode.map(Into::into)),
            is_publicly_visible: settings
                .as_ref()
                .map(|m| m.is_publicly_visible.unwrap_or(true)),
            cheats_enabled: settings.as_ref().and_then(|m| m.cheats_enabled),
            available_regions: vec![],
            duplicate_heroes_enabled: settings.as_ref().and_then(|m| m.duplicate_heroes_enabled),
            experimental_heroes_enabled: settings
                .as_ref()
                .and_then(|m| m.experimental_heroes_enabled),
        }
        .into(),
        bot_difficulty: (ECitadelBotDifficulty::KECitadelBotDifficultyNone as i32).into(),
        dev_force_hideout: None,
        hideout_search_key: None,
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
            soft_cooldown_millis: None,
        })
        .await?;
    Ok(result)
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
            soft_cooldown_millis: None,
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
            soft_cooldown_millis: None,
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
This endpoint creates a custom match using a bot account.

**Process:**
1. A party is created with your provided settings.
2. The system waits for the party code to be generated.
3. The party code is returned in the response.
4. The bot switches to spectator mode.
5. The bot marks itself as ready.
6. You and other players join, ready up, and start the match.

**Callbacks:**
If a callback URL is provided, POST requests will be sent to it:
- **settings:** When lobby settings change, a POST is sent to `{callback_url}/settings` with the `CsoCitadelParty` protobuf message as JSON.
- **match start:** When the match starts, a POST is sent to `{callback_url}` with the match ID.

_Protobuf definitions: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)_

**Note:**
The bot will leave the match 15 minutes after creation, regardless of match state.

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

    let callback_url = payload.as_ref().ok().and_then(|p| p.0.callback_url.clone());

    let SteamProxyResponse {
        username,
        msg: created_party,
    } = tryhard::retry_fn(|| create_party(&state, payload.as_ref().ok().map(|p| p.0.clone())))
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

    let party_code = utils::get_party_info_with_retries(&mut state.redis_client, party_id).await?;
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

    if !payload
        .as_ref()
        .ok()
        .and_then(|p| p.0.disable_auto_ready)
        .unwrap_or_default()
    {
        utils::make_ready(&state.steam_client, username.clone(), party_id).await?;
    }

    let response = CreateCustomResponse {
        party_id: party_id.to_string(),
        party_code: party_code.to_owned(),
        callback_secret,
    };
    Ok(Json(response))
}
