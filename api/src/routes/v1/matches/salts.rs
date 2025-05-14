use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{RateLimitClient, RateLimitQuota};

use crate::routes::v1::matches::ingest_salts;
use crate::routes::v1::matches::types::{ClickhouseSalts, MatchIdQuery};
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse,
    EgcCitadelClientMessages, c_msg_client_to_gc_get_match_meta_data_response,
};

#[derive(Deserialize, IntoParams, Default)]
pub struct SaltsQuery {
    /// Whether the match needs a demo file or not
    ///
    /// Does not work for old matches, where Valve does not provide this information
    #[serde(default)]
    pub needs_demo: bool,
}

#[derive(Serialize, ToSchema)]
pub struct MatchSaltsResponse {
    pub match_id: u64,
    pub cluster_id: Option<u32>,
    pub metadata_salt: Option<u32>,
    pub replay_salt: Option<u32>,
    pub metadata_url: Option<String>,
    pub demo_url: Option<String>,
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
    ty = "TimedCache<(u64, bool), CMsgClientToGcGetMatchMetaDataResponse>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ (match_id, needs_demo) }",
    sync_writes = "by_key",
    key = "(u64, bool)"
)]
pub async fn fetch_match_salts(
    rate_limit_client: &RateLimitClient,
    rate_limit_key: &RateLimitKey,
    steam_client: &SteamClient,
    ch_client: &clickhouse::Client,
    match_id: u64,
    needs_demo: bool,
) -> APIResult<CMsgClientToGcGetMatchMetaDataResponse> {
    // 30742540 is the first match from December, block older requests to avoid spamming
    if match_id < 30742540 {
        return Err(APIError::StatusMsg {
            status: reqwest::StatusCode::NOT_FOUND,
            message: format!("Match salts for match {match_id} cannot be fetched"),
        });
    }

    // Try fetch from Clickhouse DB
    let salts = ch_client
        .query("SELECT ?fields FROM match_salts WHERE match_id = ?")
        .bind(match_id)
        .fetch_one::<ClickhouseSalts>()
        .await;
    if let Ok(salts) = salts {
        if salts.has_metadata_salt() && (!needs_demo || salts.has_replay_salt()) {
            debug!("Match salts found in Clickhouse");
            return Ok(salts.into());
        }
    }

    let has_metadata = ch_client
        .query("SELECT match_id FROM match_info WHERE match_id = ?")
        .bind(match_id)
        .fetch_one::<u64>()
        .await
        .is_ok();

    if has_metadata {
        warn!("Blocking request for match salts for match {match_id} with metadata");
        return Err(APIError::StatusMsg {
            status: reqwest::StatusCode::NOT_FOUND,
            message: format!("Match salts for match {match_id} not found"),
        });
    }

    rate_limit_client
        .apply_limits(
            rate_limit_key,
            "salts",
            &[
                RateLimitQuota::ip_limit(5, Duration::from_secs(60)),
                RateLimitQuota::key_limit(100, Duration::from_secs(10)),
                RateLimitQuota::global_limit(100, Duration::from_secs(1)),
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
        return Err(APIError::StatusMsg {
            status: reqwest::StatusCode::NOT_FOUND,
            message: format!("Failed to fetch match salts for match {match_id}"),
        });
    }
    if salts.replay_group_id.is_some() && salts.metadata_salt.unwrap_or_default() != 0 {
        // Insert into Clickhouse
        if let Err(e) = ingest_salts::insert_salts_to_clickhouse(
            ch_client,
            vec![(match_id, salts, Some("api".to_string()))],
        )
        .await
        {
            warn!("Failed to insert match salts into Clickhouse: {e}");
        }
        debug!("Match salts fetched from Steam");
        return Ok(salts);
    }
    Err(APIError::StatusMsg {
        status: reqwest::StatusCode::NOT_FOUND,
        message: format!("Match salts for match {match_id} not found"),
    })
}

#[utoipa::path(
    get,
    path = "/{match_id}/salts",
    params(MatchIdQuery, SaltsQuery),
    responses(
        (status = OK, body = MatchSaltsResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching match salts failed")
    ),
    tags = ["Matches"],
    summary = "Match Salts",
    description = r#"
This endpoints returns salts that can be used to fetch metadata and demofile for a match.

**Note:** We currently fetch many matches without salts, so for these matches we do not have salts stored.
    "#
)]
pub async fn salts(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    Query(SaltsQuery { needs_demo }): Query<SaltsQuery>,
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
            needs_demo,
        )
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await
    .map(|salts| (match_id, salts).into())
    .map(|s: MatchSaltsResponse| Json(s))
}
