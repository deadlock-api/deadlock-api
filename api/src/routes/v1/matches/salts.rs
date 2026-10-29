use core::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use clickhouse_utils::{BatchQuery, ClickhouseBatcher, in_clause};
use serde::{Deserialize, Serialize};
use steam_proxy::{SteamProxyError, SteamProxyOptions, SteamProxyReply};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_meta_data_response::EResult;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse,
    EgcCitadelClientMessages,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::to_fetch::{queue_requested_match, resolve_invalid_match};
use crate::routes::v1::matches::types::ClickhouseSalts;
use crate::services::feature_flags::STEAM_SALTS_FALLBACK;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{DOCUMENTED_DEFAULT, Quota, RateLimit, Scope, describe};
use crate::utils::types::MatchIdQuery;

/// Fetching salts from Steam.
pub(crate) const RATE_LIMIT: RateLimit = RateLimit::new(
    "salts",
    &[
        Quota::new(Scope::Ip, 3, Duration::from_hours(1)),
        Quota::new(Scope::Key, 300, Duration::from_hours(1)),
        Quota::new(Scope::Global, 1500, Duration::from_hours(1)),
    ],
);

/// Bot cooldown after a `GetMatchMetaData` job, i.e. 50 of them per bot per day.
const SALTS_JOB_COOLDOWN: Duration = Duration::from_secs(24 * 60 * 60 / 50);

/// `Cache-Control` of a response whose salts can no longer change: one week, as for metadata.
const SETTLED_CACHE_CONTROL: &str = "public, max-age=604800";

#[derive(Debug, Clone, Row, Deserialize)]
pub(crate) struct StoredSaltsRow {
    pub(crate) match_id: u64,
    pub(crate) cluster_id: Option<u32>,
    pub(crate) metadata_salt: Option<u32>,
    pub(crate) replay_salt: Option<u32>,
    pub(crate) verified: bool,
}

pub(crate) struct MatchSaltsReadQuery;

impl BatchQuery for MatchSaltsReadQuery {
    type Key = u64;
    type Value = StoredSaltsRow;

    fn build_query(keys: &[u64]) -> String {
        // Coalescing is done by hand instead of with FINAL, which was ~6x the rows and ~7x the
        // latency for these point lookups. An unmerged verification stamp carries only the
        // sorting key, so each key group is folded to what a merge would produce: the last
        // inserted non-NULL value per column. Insert order is the part's max block number
        // (third field of `_part`; inserts coalesce within their own part). `max()` stands in
        // where the value never conflicts within a group (replay salt) or only its presence
        // matters (the verdict stamps).
        //
        // A written-off candidate (`failed_at` set) is still served, but only when nothing
        // better exists. The downloader gives up on a match after about four days, and its
        // verdict is permanent: a later re-insert of the same salts coalesces onto the stamped
        // row. Valve does publish some metadata later than that, so hiding the candidate
        // would send every request for such a match to Steam, which only returns the same
        // salts again (or 503s when no bot is free) even though the file is there by now.
        format!(
            "SELECT ?fields FROM ( \
                 SELECT match_id, cluster_id, metadata_salt, \
                     max(replay_salt) AS replay_salt, \
                     argMax(created_at, block) AS created_at, \
                     max(verified_at) AS verified_at, \
                     max(failed_at) AS failed_at, \
                     verified_at IS NOT NULL AS verified \
                 FROM ( \
                     SELECT match_id, cluster_id, metadata_salt, replay_salt, \
                         created_at, verified_at, failed_at, \
                         toUInt64(splitByChar('_', _part)[3]) AS block \
                     FROM match_salts \
                     WHERE match_id IN ({}) AND metadata_salt > 0 AND cluster_id > 0 \
                 ) \
                 GROUP BY match_id, cluster_id, metadata_salt \
             ) \
             ORDER BY failed_at IS NULL DESC, verified_at IS NOT NULL DESC, created_at DESC \
             LIMIT 1 BY match_id \
             SETTINGS log_comment = 'salts_read'",
            in_clause(keys)
        )
    }

    fn key_of(value: &StoredSaltsRow) -> u64 {
        value.match_id
    }
}

pub(crate) type MatchSaltsReadBatcher = ClickhouseBatcher<MatchSaltsReadQuery>;

/// Salts cost a bot job or a contributor's upload, so they are written before the caller is
/// answered rather than through an insert batcher, whose buffer dies with the process.
pub(super) async fn insert_salts(
    ch_client: &clickhouse::Client,
    salts: &[ClickhouseSalts],
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client.insert::<ClickhouseSalts>("match_salts").await?;
    for salt in salts {
        inserter.write(salt).await?;
    }
    inserter.end().await
}

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
        // Replay salts are never exercised by the downloader, so they can only be gated on the
        // absence of a recorded failure rather than on proof.
        format!(
            "SELECT match_id, \
                maxIf(metadata_salt, verified_at IS NOT NULL) > 0 AS has_metadata, \
                maxIf(replay_salt, failed_at IS NULL) > 0 AS has_replay \
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
             SETTINGS log_comment = 'salts_match_info_exists', apply_patch_parts = 0",
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
            metadata_url: salts
                .replay_group_id
                .zip(salts.metadata_salt)
                .map(|(cluster_id, salt)| replay_file_url(cluster_id, match_id, salt, "meta")),
            demo_url: salts
                .replay_group_id
                .zip(salts.replay_salt)
                .map(|(cluster_id, salt)| replay_file_url(cluster_id, match_id, salt, "dem")),
        }
    }
}

/// URL of a match's `.{extension}.bz2` file (`meta` or `dem`) on Valve's replay servers.
pub(crate) fn replay_file_url(
    cluster_id: u32,
    match_id: u64,
    salt: u32,
    extension: &str,
) -> String {
    format!("http://replay{cluster_id}.valve.net/1422450/{match_id}_{salt}.{extension}.bz2")
}

/// Whether the Steam proxy turned the request away for want of a bot: all bots of the group
/// are on cooldown (429) or none is alive (503).
const fn is_proxy_exhausted(e: &SteamProxyError) -> bool {
    matches!(
        e,
        SteamProxyError::Cooldown { .. } | SteamProxyError::NoAliveBots(_)
    )
}

/// Salts for a match, and whether they are known to be its real ones.
#[derive(Debug, Clone)]
pub(crate) struct MatchSalts {
    pub(crate) salts: CMsgClientToGcGetMatchMetaDataResponse,
    /// Answered by Steam, or verified by the downloader fetching the metadata file with them.
    /// `POST /v1/matches/salts` takes unverified uploads, and a later candidate can replace an
    /// unproven one once the downloader writes it off.
    pub(crate) proven: bool,
}

impl MatchSalts {
    /// Proven salts for both files never change.
    fn is_settled(&self) -> bool {
        self.proven
            && self.salts.replay_group_id.is_some_and(|c| c > 0)
            && self.salts.metadata_salt.is_some_and(|s| s > 0)
            && self.salts.replay_salt.is_some_and(|s| s > 0)
    }
}

impl From<StoredSaltsRow> for MatchSalts {
    fn from(row: StoredSaltsRow) -> Self {
        Self {
            salts: CMsgClientToGcGetMatchMetaDataResponse {
                result: None,
                metadata_salt: row.metadata_salt,
                replay_salt: row.replay_salt,
                replay_group_id: row.cluster_id,
                replay_valid_through: None,
                replay_processing_through: None,
            },
            proven: row.verified,
        }
    }
}

fn not_found(match_id: u64) -> APIError {
    APIError::status_msg(
        StatusCode::NOT_FOUND,
        format!("Match salts for match {match_id} not found"),
    )
}

#[cached(
    max_size = 10_000,
    ttl_secs = 60,
    convert = "{ match_id }",
    key = "u64"
)]
pub(super) async fn fetch_match_salts(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    match_id: u64,
    is_custom: bool,
    disable_steam: bool,
) -> Result<MatchSalts, APIError> {
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

    if disable_steam || !state.feature_flags.is_enabled(&STEAM_SALTS_FALLBACK) {
        // Nobody fetches the match now: queue it so the to-fetch workers pick it up instead.
        if !has_metadata {
            queue_requested_match(state, match_id);
        }
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            "Match salts not found in Clickhouse and Steam fallback is disabled",
        ));
    }

    if has_metadata {
        warn!("Blocking request for match salts for match {match_id} with metadata");
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Match salts for match {match_id} won't be fetched, as it has metadata already"
            ),
        ));
    }

    // Rate limited: queue the match so the to-fetch workers pick it up instead.
    state
        .rate_limit_client
        .check(rate_limit_key, RATE_LIMIT)
        .await
        .inspect_err(|_| queue_requested_match(state, match_id))?;

    // If not in Clickhouse, fetch from Steam
    let msg = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        metadata_salt: None,
        target_account_id: None,
    };
    let result = state
        .steam_client
        .call_steam_proxy_raw(
            EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData,
            &msg,
            SteamProxyOptions {
                in_all_groups: Some(&["GetMatchMetaData"]),
                in_any_groups: None,
                cooldown: SALTS_JOB_COOLDOWN,
                // The salt scraper claims a full soft cooldown for prioritized matches, so an
                // on-demand lookup takes none and 503s rather than borrowing a bot that is still
                // cooling down. Custom matches keep half a window, as their salts have no other
                // source. `None` is not the strict choice here: the client substitutes
                // `cooldown / 2`.
                soft_cooldown: Some(if is_custom {
                    Duration::from_secs(SALTS_JOB_COOLDOWN.as_secs() / 2)
                } else {
                    Duration::ZERO
                }),
                request_timeout: Duration::from_secs(2),
                username: None,
            },
        )
        .await;
    let result = match result {
        Ok(result) => result,
        Err(e) => {
            // No bot to spare: queue the match so the to-fetch workers pick it up instead.
            if is_proxy_exhausted(&e) {
                queue_requested_match(state, match_id);
            }
            return Err(e.into());
        }
    };
    let username = format!("api-fetch:{}", result.username);
    let salts: SteamProxyReply<CMsgClientToGcGetMatchMetaDataResponse> = result.try_into()?;
    let salts = salts.msg;
    if salts.result == Some(EResult::KEResultInvalidMatch as i32) {
        // Steam doesn't know the match: stop handing it out to the to-fetch workers.
        resolve_invalid_match(state, match_id).await;
        return Err(not_found(match_id));
    }
    if salts
        .result
        .is_none_or(|r| r != EResult::KEResultSuccess as i32)
    {
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            format!("Failed to fetch match salts for match {match_id}"),
        ));
    }
    if salts.replay_group_id.is_some() && salts.metadata_salt.unwrap_or_default() != 0 {
        insert_salts(&state.ch_client, &[(match_id, salts, username).into()]).await?;
        debug!("Match salts fetched from Steam");
        return Ok(MatchSalts {
            salts,
            proven: true,
        });
    }
    Err(not_found(match_id))
}

#[derive(Deserialize, IntoParams)]
pub(super) struct SaltsQuery {
    /// If `true`, skip the Steam fallback when the salts are not available in Clickhouse
    /// and return an error instead.
    disable_steam: Option<bool>,
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
    summary = "Salts",
    description = describe(
        "
This endpoints returns salts that can be used to fetch metadata and demofile for a match.

**Note:** We currently fetch many matches without salts, so for these matches we do not have salts stored.

    ",
        [
            ("From DB", DOCUMENTED_DEFAULT),
            ("From Steam", RATE_LIMIT.quotas),
        ],
    )
)]
pub(super) async fn salts(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    Query(SaltsQuery { disable_steam }): Query<SaltsQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    fetch_match_salts(
        &state,
        &rate_limit_key,
        match_id,
        false,
        disable_steam.unwrap_or_default(),
    )
    .await
    .map(|salts| {
        // Unsettled salts keep the global default max-age.
        (
            salts
                .is_settled()
                .then_some([(header::CACHE_CONTROL, SETTLED_CACHE_CONTROL)]),
            Json(MatchSaltsResponse::from((match_id, salts.salts))),
        )
    })
}
