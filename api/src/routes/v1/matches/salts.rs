use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::ingest_salts;
use crate::routes::v1::matches::types::{ClickhouseSalts, MatchIdQuery};
use crate::state::AppState;
use crate::utils;
use crate::utils::limiter::{RateLimitQuota, apply_limits};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use prost::Message;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse,
    EgcCitadelClientMessages,
};

#[derive(Deserialize, IntoParams, Default)]
pub struct SaltsQuery {
    /// Whether the match needs a demo file or not
    ///
    /// Does not work for old matches, where Valve does not provide this information
    #[serde(default)]
    pub needs_demo: bool,
}

#[derive(Serialize, Deserialize, ToSchema)]
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
    ty = "TimedCache<String, CMsgClientToGcGetMatchMetaDataResponse>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{match_id}-{needs_demo}") }"#,
    sync_writes = "by_key",
    key = "String"
)]
pub async fn fetch_match_salts(
    config: &Config,
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    match_id: u64,
    needs_demo: bool,
) -> APIResult<CMsgClientToGcGetMatchMetaDataResponse> {
    // 30742540 is he first match from december, block older requests to avoid spamming
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

    // If not in Clickhouse, fetch from Steam
    let msg = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        metadata_salt: None,
        target_account_id: None,
    };
    let response = utils::steam::call_steam_proxy(
        config,
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData,
        msg,
        None,
        Some(&["GetMatchMetaData", "GetMatchMetaDataOnDemand"]),
        Duration::from_secs(30 * 60),
        Duration::from_secs(2),
    )
    .await;
    match response {
        Err(e) => {
            warn!("Failed to fetch match salts from Steam: {e}");
        }
        Ok(r) => {
            match BASE64_STANDARD.decode(&r.data) {
                Err(e) => {
                    warn!("Failed to decode match salts from Steam: {e}");
                }
                Ok(data) => {
                    match CMsgClientToGcGetMatchMetaDataResponse::decode(data.as_slice()) {
                        Err(e) => {
                            warn!("Failed to parse match salts from Steam: {e}");
                        }
                        Ok(salts) => {
                            if salts.replay_group_id.is_some()
                                && salts.metadata_salt.unwrap_or_default() != 0
                            {
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
                        }
                    }
                }
            }
        }
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
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(
        &headers,
        &state,
        "salts",
        &[RateLimitQuota::ip_limit(100, Duration::from_secs(1))],
    )
    .await?;
    tryhard::retry_fn(|| {
        fetch_match_salts(
            &state.config,
            &state.http_client,
            &state.clickhouse_client,
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
