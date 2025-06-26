use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ActiveMatch;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::types::SteamProxyQuery;
use crate::utils::parse::parse_steam_id_option;
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
pub(super) struct ActiveMatchesQuery {
    /// The account ID to filter active matches by (SteamID3)
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    account_id: Option<u32>,
}

#[cached(
    ty = "TimedCache<u8, Vec<u8>>",
    create = "{ TimedCache::with_lifespan(60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn fetch_active_matches_raw(state: &AppState) -> APIResult<Vec<u8>> {
    let steam_response = state
        .steam_client
        .call_steam_proxy_raw(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetActiveMatches,
            msg: CMsgClientToGcGetActiveMatches::default(),
            in_all_groups: Some(vec!["LowRateLimitApis".to_string()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(600),
            request_timeout: Duration::from_secs(2),
            username: None,
        })
        .await?;
    Ok(BASE64_STANDARD.decode(&steam_response.data)?)
}

fn parse_active_matches_raw(raw_data: &[u8]) -> APIResult<Vec<ActiveMatch>> {
    if raw_data.len() < 7 {
        return Err(APIError::internal("Invalid active matches data"));
    }
    let decompressed_data = snap::raw::Decoder::new().decompress_vec(&raw_data[7..])?;
    let decoded_message =
        CMsgClientToGcGetActiveMatchesResponse::decode(decompressed_data.as_ref())?;
    Ok(decoded_message
        .active_matches
        .into_iter()
        .map_into()
        .collect())
}

#[utoipa::path(
    get,
    path = "/active/raw",
    responses(
        (status = OK, body = [u8]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching active matches failed")
    ),
    tags = ["Matches"],
    summary = "Active as Protobuf",
    description = r#"
Returns active matches that are currently being played, serialized as protobuf message.

Fetched from the watch tab in game, which is limited to the **top 200 matches**.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | 10req/s |
    "#
)]
pub(super) async fn active_matches_raw(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "active_matches",
            &[Quota::global_limit(10, Duration::from_secs(1))], // To protect massive amount of calls, during steam downtime
        )
        .await?;

    tryhard::retry_fn(|| fetch_active_matches_raw(&state))
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
    summary = "Active",
    description = r#"
Returns active matches that are currently being played.

Fetched from the watch tab in game, which is limited to the **top 200 matches**.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | 10req/s |
    "#
)]
pub(super) async fn active_matches(
    Query(ActiveMatchesQuery { account_id }): Query<ActiveMatchesQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "active_matches",
            &[Quota::global_limit(10, Duration::from_secs(1))], // To protect massive amount of calls, during steam downtime
        )
        .await?;

    let mut active_matches = tryhard::retry_fn(|| async {
        let raw_data = fetch_active_matches_raw(&state).await?;
        parse_active_matches_raw(&raw_data)
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await?;

    // Filter by account id if provided
    if let Some(account_id) = account_id {
        active_matches.retain(|m| {
            m.players
                .iter()
                .any(|p| p.account_id.is_some_and(|a| a == account_id))
        });
    }

    Ok(Json(active_matches))
}
