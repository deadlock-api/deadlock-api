use core::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse,
    EgcCitadelClientMessages, c_msg_client_to_gc_get_match_meta_data_response,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ClickhouseSalts;
use crate::services::clickhouse_batcher::{BatchQuery, ClickhouseBatcher, in_clause};
use crate::services::clickhouse_insert_batcher::{BatchInsert, ClickhouseInsertBatcher};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::types::{SteamProxyQuery, SteamProxyResponse};
use crate::utils::types::MatchIdQuery;

const FIRST_MATCH_DECEMBER_2024: u64 = 29507576;

pub(crate) struct MatchSaltsReadQuery;

impl BatchQuery for MatchSaltsReadQuery {
    type Key = u64;
    type Value = ClickhouseSalts;

    fn build_query(keys: &[u64]) -> String {
        format!(
            "SELECT ?fields FROM match_salts FINAL \
             WHERE match_id IN ({}) AND metadata_salt > 0 AND cluster_id > 0 \
             SETTINGS log_comment = 'salts_read'",
            in_clause(keys)
        )
    }

    fn key_of(value: &ClickhouseSalts) -> u64 {
        value.match_id
    }
}

pub(crate) type MatchSaltsReadBatcher = ClickhouseBatcher<MatchSaltsReadQuery>;

pub(crate) struct MatchSaltsInsert;

impl BatchInsert for MatchSaltsInsert {
    type Row = ClickhouseSalts;

    fn table_name() -> &'static str {
        "match_salts"
    }
}

pub(crate) type MatchSaltsInsertBatcher = ClickhouseInsertBatcher<MatchSaltsInsert>;

#[derive(Debug, Clone, Row, Deserialize)]
pub(crate) struct MatchSaltsExistsRow {
    pub(crate) match_id: u64,
    pub(crate) has_metadata: Option<u8>,
    pub(crate) has_replay: Option<u8>,
}

pub(crate) struct MatchSaltsExistsQuery;

impl BatchQuery for MatchSaltsExistsQuery {
    type Key = u64;
    type Value = MatchSaltsExistsRow;

    fn build_query(keys: &[u64]) -> String {
        format!(
            "SELECT match_id, \
                max(metadata_salt) > 0 AS has_metadata, \
                max(replay_salt) > 0 AS has_replay \
             FROM match_salts \
             WHERE match_id IN ({}) \
             GROUP BY match_id \
             SETTINGS log_comment = 'salts_exists'",
            in_clause(keys)
        )
    }

    fn key_of(value: &MatchSaltsExistsRow) -> u64 {
        value.match_id
    }
}

pub(crate) type MatchSaltsExistsBatcher = ClickhouseBatcher<MatchSaltsExistsQuery>;

#[derive(Debug, Clone, Row, Deserialize)]
pub(crate) struct MatchInfoExistsRow {
    pub(crate) match_id: u64,
}

pub(crate) struct MatchInfoExistsQuery;

impl BatchQuery for MatchInfoExistsQuery {
    type Key = u64;
    type Value = MatchInfoExistsRow;

    fn build_query(keys: &[u64]) -> String {
        format!(
            "SELECT DISTINCT match_id FROM match_player WHERE match_id IN ({}) \
             SETTINGS log_comment = 'salts_match_info_exists'",
            in_clause(keys)
        )
    }

    fn key_of(value: &MatchInfoExistsRow) -> u64 {
        value.match_id
    }
}

pub(crate) type MatchInfoExistsBatcher = ClickhouseBatcher<MatchInfoExistsQuery>;

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
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60)) }",
    result = true,
    convert = "{ match_id }",
    sync_writes = "by_key",
    key = "u64"
)]
pub(super) async fn fetch_match_salts(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    match_id: u64,
    is_custom: bool,
) -> APIResult<CMsgClientToGcGetMatchMetaDataResponse> {
    // Try fetch from Clickhouse via batcher
    if let Ok(salts) = state.batchers.match_salts_read.load(match_id).await {
        debug!("Match salts found in Clickhouse");
        return Ok(salts.into());
    }

    let has_metadata = state
        .batchers
        .match_info_exists
        .load(match_id)
        .await
        .is_ok();

    if has_metadata {
        warn!("Blocking request for match salts for match {match_id} with metadata");
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Match salts for match {match_id} won't be fetched, as it has metadata already"
            ),
        ));
    }

    if match_id < FIRST_MATCH_DECEMBER_2024 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Match salts for match {match_id} cannot be fetched"),
        ));
    }

    state
        .rate_limit_client
        .apply_limits(
            rate_limit_key,
            "salts",
            &[
                Quota::ip_limit(3, Duration::from_hours(1)),
                Quota::key_limit(300, Duration::from_hours(1)),
                Quota::global_limit(1500, Duration::from_hours(1)),
            ],
        )
        .await?;

    // If not in Clickhouse, fetch from Steam
    let msg = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        metadata_salt: None,
        target_account_id: None,
    };
    let result = state
        .steam_client
        .call_steam_proxy_raw(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData,
            msg,
            in_all_groups: Some(vec!["GetMatchMetaData".to_owned()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(24 * 60 * 60 / 100),
            request_timeout: Duration::from_secs(2),
            username: None,
            soft_cooldown_millis: is_custom.then_some(Duration::from_secs(24 * 60 * 60 / 200)),
        })
        .await?;
    let username = result.username.clone();
    let salts: SteamProxyResponse<CMsgClientToGcGetMatchMetaDataResponse> = result.try_into()?;
    let salts = salts.msg;
    if salts.result.is_none_or(|r| {
        r != c_msg_client_to_gc_get_match_meta_data_response::EResult::KEResultSuccess as i32
    }) {
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            format!("Failed to fetch match salts for match {match_id}"),
        ));
    }
    if salts.replay_group_id.is_some() && salts.metadata_salt.unwrap_or_default() != 0 {
        // Queue for batch insertion into Clickhouse
        state
            .batchers
            .match_salts_insert
            .insert(vec![(match_id, salts, username).into()])
            .await;
        debug!("Match salts fetched from Steam");
        return Ok(salts);
    }
    Err(APIError::status_msg(
        StatusCode::NOT_FOUND,
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
    description = "
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
    fetch_match_salts(&state, &rate_limit_key, match_id, false)
        .await
        .map(|salts| (match_id, salts).into())
        .map(|s: MatchSaltsResponse| Json(s))
}
