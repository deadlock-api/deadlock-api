use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Quota, RateLimitClient};

use crate::context::AppState;
use crate::routes::v1::matches::ingest_salts;
use crate::routes::v1::matches::types::{ClickhouseSalts, MatchIdQuery};
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;
use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::Serialize;
use std::time::Duration;
use tracing::{debug, warn};
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse,
    EgcCitadelClientMessages, c_msg_client_to_gc_get_match_meta_data_response,
};

const FIRST_MATCH_DECEMBER_2024: u64 = 29507576;

#[derive(Serialize, ToSchema)]
struct MatchSaltsResponse {
    match_id: u64,
    cluster_id: Option<u32>,
    metadata_salt: Option<u32>,
    replay_salt: Option<u32>,
    metadata_url: Option<String>,
    demo_url: Option<String>,
}

impl From<(u64, CMsgClientToGcGetMatchMetaDataResponse)> for MatchSaltsResponse {
    fn from((match_id, salts): (u64, CMsgClientToGcGetMatchMetaDataResponse)) -> Self {
        Self {
            match_id,
            cluster_id: salts.replay_group_id,
            metadata_salt: salts.metadata_salt,
            replay_salt: salts.replay_salt,
            metadata_url: salts.replay_group_id.and_then(|cluster_id| {
                salts.metadata_salt.map(|salt| {
                    format!(
                        "http://replay{cluster_id}.valve.net/1422450/{match_id}_{salt}.meta.bz2"
                    )
                })
            }),
            demo_url: salts.replay_group_id.and_then(|cluster_id| {
                salts.replay_salt.map(|salt| {
                    format!("http://replay{cluster_id}.valve.net/1422450/{match_id}_{salt}.dem.bz2")
                })
            }),
        }
    }
}

#[cached(
    ty = "TimedCache<u64, CMsgClientToGcGetMatchMetaDataResponse>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ match_id }",
    sync_writes = "by_key",
    key = "u64"
)]
pub(super) async fn fetch_match_salts(
    rate_limit_client: &RateLimitClient,
    rate_limit_key: &RateLimitKey,
    steam_client: &SteamClient,
    ch_client: &clickhouse::Client,
    match_id: u64,
) -> APIResult<CMsgClientToGcGetMatchMetaDataResponse> {
    if match_id < FIRST_MATCH_DECEMBER_2024 {
        return Err(APIError::status_msg(
            reqwest::StatusCode::NOT_FOUND,
            format!("Match salts for match {match_id} cannot be fetched"),
        ));
    }

    // Try fetch from Clickhouse DB
    let salts = ch_client
        .query("SELECT ?fields FROM match_salts WHERE match_id = ?")
        .bind(match_id)
        .fetch_one::<ClickhouseSalts>()
        .await;
    if let Ok(salts) = salts {
        debug!("Match salts found in Clickhouse");
        return Ok(salts.into());
    }

    let has_metadata = ch_client
        .query("SELECT match_id FROM match_info WHERE match_id = ?")
        .bind(match_id)
        .fetch_one::<u64>()
        .await
        .is_ok();

    if has_metadata {
        warn!("Blocking request for match salts for match {match_id} with metadata");
        return Err(APIError::status_msg(
            reqwest::StatusCode::NOT_FOUND,
            format!(
                "Match salts for match {match_id} not wont be fetched, as it has metadata already"
            ),
        ));
    }

    rate_limit_client
        .apply_limits(
            rate_limit_key,
            "salts",
            &[
                Quota::ip_limit(10, Duration::from_secs(30 * 60)),
                Quota::key_limit(10, Duration::from_secs(60)),
                Quota::global_limit(10, Duration::from_secs(10)),
            ],
        )
        .await?;

    // If not in Clickhouse, fetch from Steam
    let msg = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        metadata_salt: None,
        target_account_id: None,
    };
    let salts: CMsgClientToGcGetMatchMetaDataResponse = steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData,
            msg,
            in_all_groups: Some(vec!["GetMatchMetaData".to_string()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(30 * 60),
            request_timeout: Duration::from_secs(2),
            username: None,
        })
        .await?
        .msg;
    if salts.result.is_none_or(|r| {
        r != c_msg_client_to_gc_get_match_meta_data_response::EResult::KEResultSuccess as i32
    }) {
        return Err(APIError::status_msg(
            reqwest::StatusCode::NOT_FOUND,
            format!("Failed to fetch match salts for match {match_id}"),
        ));
    }
    if salts.replay_group_id.is_some() && salts.metadata_salt.unwrap_or_default() != 0 {
        // Insert into Clickhouse
        if let Err(e) =
            ingest_salts::insert_salts_to_clickhouse(ch_client, vec![(match_id, salts)]).await
        {
            warn!("Failed to insert match salts into Clickhouse: {e}");
        }
        debug!("Match salts fetched from Steam");
        return Ok(salts);
    }
    Err(APIError::status_msg(
        reqwest::StatusCode::NOT_FOUND,
        format!("Match salts for match {match_id} not found"),
    ))
}

#[utoipa::path(
    get,
    path = "/{match_id}/salts",
    params(MatchIdQuery),
    responses(
        (status = OK, body = MatchSaltsResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching match salts failed")
    ),
    tags = ["Matches"],
    summary = "Salts",
    description = r"
This endpoints returns salts that can be used to fetch metadata and demofile for a match.

**Note:** We currently fetch many matches without salts, so for these matches we do not have salts stored.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | From DB: 100req/s<br>From Steam: 10req/30mins |
| Key | From DB: -<br>From Steam: 10req/min |
| Global | From DB: -<br>From Steam: 10req/10s |
    "
)]
pub(super) async fn salts(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    tryhard::retry_fn(|| {
        fetch_match_salts(
            &state.rate_limit_client,
            &rate_limit_key,
            &state.steam_client,
            &state.ch_client,
            match_id,
        )
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await
    .map(|salts| (match_id, salts).into())
    .map(|s: MatchSaltsResponse| Json(s))
}
