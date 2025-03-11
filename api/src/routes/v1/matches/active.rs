use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ActiveMatch;
use crate::state::AppState;
use crate::utils;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use itertools::Itertools;
use prost::Message;
use serde::Deserialize;
use std::time::Duration;
use utoipa::IntoParams;
use valveprotos::deadlock::{
    CMsgClientToGcGetActiveMatches, CMsgClientToGcGetActiveMatchesResponse,
    EgcCitadelClientMessages,
};

#[derive(Deserialize, IntoParams)]
pub struct ActiveMatchesQuery {
    #[serde(default)]
    pub account_id: Option<u32>,
}

#[cached(
    ty = "TimedCache<String, Vec<u8>>",
    create = "{ TimedCache::with_lifespan(60) }",
    result = true,
    convert = r#"{ format!("") }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn fetch_active_matches_raw(
    config: &Config,
    http_client: &reqwest::Client,
) -> APIResult<Vec<u8>> {
    utils::steam::call_steam_proxy(
        config,
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetActiveMatches,
        CMsgClientToGcGetActiveMatches::default(),
        Some(&["LowRateLimitApis"]),
        None,
        Duration::from_secs(60),
        Duration::from_secs(2),
    )
    .await
    .map_err(|e| APIError::InternalError {
        message: format!("Failed to fetch active matches: {e}"),
    })
    .and_then(|r| {
        BASE64_STANDARD
            .decode(&r.data)
            .map_err(|e| APIError::InternalError {
                message: format!("Failed to decode active matches: {e}"),
            })
    })
}

async fn parse_active_matches_raw(raw_data: &[u8]) -> APIResult<Vec<ActiveMatch>> {
    if raw_data.len() < 7 {
        return Err(APIError::InternalError {
            message: "Invalid active matches data".to_string(),
        });
    }
    let decompressed_data = snap::raw::Decoder::new()
        .decompress_vec(&raw_data[7..])
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to decompress active matches: {e}"),
        })?;
    CMsgClientToGcGetActiveMatchesResponse::decode(decompressed_data.as_ref())
        .map(|msg| msg.active_matches.into_iter().map_into().collect())
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to parse active matches: {e}"),
        })
}

#[utoipa::path(
    get,
    path = "/active/raw",
    responses(
        (status = OK, body = [u8]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching active matches failed")
    ),
    tags = ["Matches"],
    summary = "Active Matches as Protobuf",
    description = r#"
Returns active matches that are currently being played, serialized as protobuf message.

Fetched from the watch tab in game, which is limited to the **top 200 matches**.
    "#
)]
pub async fn active_matches_raw(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    tryhard::retry_fn(|| fetch_active_matches_raw(&state.config, &state.http_client))
        .retries(3)
        .fixed_backoff(Duration::from_millis(10))
        .await
}

#[utoipa::path(
    get,
    path = "/active",
    params(ActiveMatchesQuery),
    responses(
        (status = OK, body = [ActiveMatch]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing active matches failed")
    ),
    tags = ["Matches"],
    summary = "Active Matches",
    description = r#"
Returns active matches that are currently being played.

Fetched from the watch tab in game, which is limited to the **top 200 matches**.
    "#
)]
pub async fn active_matches(
    Query(ActiveMatchesQuery { account_id }): Query<ActiveMatchesQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let raw_data =
        tryhard::retry_fn(|| fetch_active_matches_raw(&state.config, &state.http_client))
            .retries(3)
            .fixed_backoff(Duration::from_millis(10))
            .await?;
    let mut active_matches = parse_active_matches_raw(&raw_data).await?;

    // Filter by account id if provided
    if let Some(account_id) = account_id {
        active_matches.retain(|m| {
            m.players
                .iter()
                .any(|p| p.account_id.is_some_and(|a| a == account_id))
        });
    };

    Ok(Json(active_matches))
}
