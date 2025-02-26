use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ActiveMatch;
use crate::state::AppState;
use crate::utils;
use crate::utils::limiter::apply_limits;
use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use itertools::Itertools;
use prost::Message;
use valveprotos::deadlock::{
    CMsgClientToGcGetActiveMatches, CMsgClientToGcGetActiveMatchesResponse,
    EgcCitadelClientMessages,
};

#[cached(
    ty = "TimedCache<String, Vec<u8>>",
    create = "{ TimedCache::with_lifespan(60) }",
    result = true,
    convert = r#"{ format!("") }"#
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
        std::time::Duration::from_secs(60),
        &["LowRateLimitApis"],
    )
    .await
    .map_err(|e| APIError::InternalError {
        message: format!("Failed to fetch active matches: {}", e),
    })
    .and_then(|r| {
        BASE64_STANDARD
            .decode(&r.data)
            .map_err(|e| APIError::InternalError {
                message: format!("Failed to decode active matches: {}", e),
            })
    })
}

async fn parse_active_matches_raw(raw_data: &[u8]) -> APIResult<Vec<ActiveMatch>> {
    let decompressed_data = snap::raw::Decoder::new()
        .decompress_vec(&raw_data[7..])
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to decompress active matches: {}", e),
        })?;
    CMsgClientToGcGetActiveMatchesResponse::decode(decompressed_data.as_ref())
        .map(|msg| msg.active_matches.into_iter().map_into().collect())
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to parse active matches: {}", e),
        })
}

#[utoipa::path(
    get,
    path = "/active/raw",
    responses(
        (status = OK, body = [u8]),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching active matches failed")
    ),
    tags = ["Matches"],
    summary = "Active Matches as Protobuf",
    description = r#"
Returns active matches that are currently being played, serialized as protobuf message.

Fetched from the watch tab in game.
    "#
)]
pub async fn active_matches_raw(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(&headers, &state, "active_matches", &[100.into()]).await?;
    fetch_active_matches_raw(&state.config, &state.http_client).await
}

#[utoipa::path(
    get,
    path = "/active",
    responses(
        (status = OK, body = [ActiveMatch]),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing active matches failed")
    ),
    tags = ["Matches"],
    summary = "Active Matches",
    description = r#"
Returns active matches that are currently being played.

Fetched from the watch tab in game.
    "#
)]
pub async fn active_matches(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(&headers, &state, "active_matches", &[100.into()]).await?;
    let raw_data = fetch_active_matches_raw(&state.config, &state.http_client).await?;
    parse_active_matches_raw(&raw_data).await.map(Json)
}
