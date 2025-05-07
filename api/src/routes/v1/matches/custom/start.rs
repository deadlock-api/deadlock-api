use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::custom::create;
use crate::routes::v1::matches::custom::types::{PartyIdQuery, StartCustomResponse};
use crate::state::AppState;
use crate::utils;
use crate::utils::steam::SteamProxyQuery;
use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use prost::Message;
use std::time::Duration;
use tracing::warn;
use valveprotos::deadlock::{
    CMsgClientToGcPartySetReadyStateResponse, CMsgClientToGcPartyStartMatch,
    EgcCitadelClientMessages, c_msg_client_to_gc_party_start_match_response,
};

async fn start_match(
    config: &Config,
    http_client: &reqwest::Client,
    username: String,
    party_id: u64,
) -> APIResult<()> {
    let msg = CMsgClientToGcPartyStartMatch {
        party_id: party_id.into(),
    };
    let result = utils::steam::call_steam_proxy(
        config,
        http_client,
        SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcPartyStartMatch,
            msg,
            in_all_groups: Some(vec!["LowRateLimitApis".to_string()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(10),
            request_timeout: Duration::from_secs(2),
            username: username.into(),
        },
    )
    .await
    .map_err(|e| APIError::InternalError {
        message: format!("Failed to start match: {e}"),
    })
    .and_then(|r| {
        BASE64_STANDARD
            .decode(&r.data)
            .map_err(|e| APIError::InternalError {
                message: format!("Failed to decode start match response: {e}"),
            })
    })
    .and_then(|raw_data| {
        CMsgClientToGcPartySetReadyStateResponse::decode(raw_data.as_ref()).map_err(|e| {
            APIError::InternalError {
                message: format!("Failed to parse start match response: {e}"),
            }
        })
    })?
    .result;

    if result.is_none_or(|r| {
        r != c_msg_client_to_gc_party_start_match_response::EResponse::KESuccess as i32
    }) {
        return Err(APIError::InternalError {
            message: format!("Failed to start match: {result:?}"),
        });
    }
    Ok(())
}

#[utoipa::path(
    post,
    path = "/{party_id}/start",
    params(PartyIdQuery),
    responses(
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Starting custom match failed")
    ),
    tags = ["Custom Matches [PREVIEW]"],
    summary = "Start Custom Match",
    description = "This endpoint allows you to start a previously created custom match."
)]
pub async fn start_custom(
    Path(PartyIdQuery { party_id }): Path<PartyIdQuery>,
    State(mut state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let party_code = create::get_party_code(&mut state.redis_client, party_id)
        .await
        .map_err(|_| APIError::InternalError {
            message: "Failed to retrieve party code".to_string(),
        })?;

    let Some((account_name, _)) = party_code.split_once(':') else {
        warn!("Failed to parse account name");
        return Err(APIError::InternalError {
            message: "Failed to parse account name".to_string(),
        });
    };
    start_match(
        &state.config,
        &state.http_client,
        account_name.to_string(),
        party_id,
    )
    .await?;
    let response = StartCustomResponse {
        message: "Match started".to_string(),
    };
    Ok(Json(response))
}
