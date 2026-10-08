use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::HeaderValue;
use axum::http::header::CACHE_CONTROL;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use serde::Deserialize;
use sqlx::{Pool, Postgres};
use tracing::debug;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::players::rank::badge_from_flat_progress_sql;
use crate::utils::parse::parse_steam_id_option;
use crate::utils::sql::id_list;

const BATCH_SIZE: usize = 100;
const CLAIM_TTL_SECS: u64 = 15 * 60;
const POOL_LIMIT: usize = 200_000;
const MIN_MATCH_ID: u64 = 31_247_321;
const CLAIM_PREFIX: &str = "matches_to_fetch:claimed:";

fn worklist(ids: Vec<u64>) -> impl IntoResponse {
    (
        [(CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(ids),
    )
}

#[cached(ttl_secs = 300, convert = "{ 0 }", key = "u8", sync_writes = "default")]
async fn prioritized_account_ids(pg_client: &Pool<Postgres>) -> Result<Arc<Vec<u32>>, sqlx::Error> {
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT steam_id3 FROM prioritized_steam_accounts WHERE deleted_at IS NULL",
    )
    .fetch_all(pg_client)
    .await?;
    Ok(Arc::new(
        ids.into_iter()
            .filter_map(|id| u32::try_from(id).ok())
            .collect(),
    ))
}

/// Pending matches in fetch order: prioritized accounts' matches, then ranked, unranked,
/// street brawl and everything else; ranked games with higher-badge players (badge after each
/// player's latest ranked match) first, then the newest. Holds every pending prioritized match plus the
/// newest others, up to `POOL_LIMIT`.
#[cached(ttl_secs = 60, convert = "{ 0 }", key = "u8", sync_writes = "default")]
async fn pending_pool(
    ch_client: &clickhouse::Client,
    prioritized: &[u32],
) -> clickhouse::error::Result<Arc<Vec<u64>>> {
    let prio = if prioritized.is_empty() {
        "SELECT toUInt64(0) AS match_id WHERE 0".to_owned()
    } else {
        let ids = id_list(prioritized);
        format!(
            "SELECT match_id FROM player_match_history \
             WHERE account_id IN ({ids}) AND match_id >= {MIN_MATCH_ID}"
        )
    };
    // Matches missing from `player_match_by_match` get the defaults 'Invalid' and badge 0.
    let badge = badge_from_flat_progress_sql(
        "player_rank_final_flat_progress",
        "player_rank_initial_display_rank",
    );
    // CTEs are inlined per reference, so without MATERIALIZED the pending_matches FINAL scan ran
    // three times and the ~77M-row player_match_by_match lookup twice.
    let query = format!(
        "WITH prio AS ({prio}),
         pool AS MATERIALIZED (
             SELECT match_id, match_id IN prio AS is_prio FROM pending_matches FINAL
             WHERE state = 'pending' AND match_id >= {MIN_MATCH_ID}
             ORDER BY is_prio DESC, match_id DESC LIMIT {POOL_LIMIT}
         ),
         players AS MATERIALIZED (
             SELECT match_id, account_id, match_mode, game_mode FROM player_match_by_match
             WHERE match_id IN (SELECT match_id FROM pool)
         ),
         badges AS (
             SELECT account_id,
                    argMax(if(player_rank_final_flat_progress IS NULL,
                              toUInt32(player_rank_initial_display_rank),
                              {badge}), match_id) AS badge
             FROM player_match_stats
             WHERE account_id IN (SELECT account_id FROM players WHERE match_mode = 'Ranked')
               AND match_mode = 'Ranked' AND player_rank_initial_display_rank > 0
             GROUP BY account_id
         )
         SELECT match_id
         FROM pool LEFT JOIN players USING match_id LEFT JOIN badges USING account_id
         GROUP BY match_id, is_prio
         ORDER BY if(is_prio, 0, multiIf(any(match_mode) = 'Ranked', 1,
                                         any(game_mode) = 'StreetBrawl', 3,
                                         any(match_mode) = 'Unranked', 2,
                                         4)),
                  avgIf(badge, badge > 0 AND match_mode = 'Ranked') DESC,
                  match_id DESC
         SETTINGS log_comment = 'matches_to_fetch_pool', enable_materialized_cte = 1"
    );
    let ids: Vec<u64> = ch_client.query(&query).fetch_all().await?;
    Ok(Arc::new(ids))
}

#[cached(
    max_size = 1_000,
    ttl_secs = 60,
    convert = "{ account_id }",
    key = "u32"
)]
async fn pending_pool_for_account(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> clickhouse::error::Result<Arc<Vec<u64>>> {
    // use_statistics = 0: since 26.8 loading per-part statistics at plan time costs
    // more than it saves on this query (benchmarked 58ms -> 19ms without).
    let query = format!(
        "SELECT match_id FROM pending_matches FINAL \
         WHERE state = 'pending' AND match_id >= {MIN_MATCH_ID} \
           AND match_id IN (SELECT match_id FROM player_match_history \
               WHERE account_id = {account_id} AND match_id >= {MIN_MATCH_ID}) \
         ORDER BY match_id DESC LIMIT {POOL_LIMIT} \
         SETTINGS log_comment = 'matches_to_fetch_pool_account', use_statistics = 0"
    );
    let ids: Vec<u64> = ch_client.query(&query).fetch_all().await?;
    Ok(Arc::new(ids))
}

#[derive(Deserialize)]
pub(super) struct ToFetchQuery {
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    account_id: Option<u32>,
}

pub(super) async fn matches_to_fetch(
    Query(ToFetchQuery { account_id }): Query<ToFetchQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    debug!(?account_id, "matches_to_fetch request");

    if let Some(account_id) = account_id {
        let ids = pending_pool_for_account(&state.ch_client_ro, account_id).await?;
        return Ok(worklist(ids.as_ref().clone()));
    }

    let prioritized = prioritized_account_ids(&state.pg_client)
        .await
        .unwrap_or_default();
    let pool = pending_pool(&state.ch_client_ro, prioritized.as_slice()).await?;
    let n = pool.len();
    if n == 0 {
        return Ok(worklist(Vec::new()));
    }

    // Walk the pool in priority order, skipping matches another worker has claimed.
    let mut conn = state.redis_client.clone();
    let mut claimed: Vec<u64> = Vec::with_capacity(BATCH_SIZE);
    let mut scanned = 0usize;
    while claimed.len() < BATCH_SIZE && scanned < n {
        let chunk = (BATCH_SIZE - claimed.len()).min(n - scanned);
        let ids = &pool[scanned..scanned + chunk];

        let mut pipe = redis::pipe();
        for id in ids {
            pipe.cmd("SET")
                .arg(format!("{CLAIM_PREFIX}{id}"))
                .arg(1u8)
                .arg("NX")
                .arg("EX")
                .arg(CLAIM_TTL_SECS);
        }
        let results: Vec<Option<String>> = pipe.query_async(&mut conn).await.unwrap_or_default();

        for (id, res) in ids.iter().zip(results.iter()) {
            if res.is_some() {
                claimed.push(*id);
            }
        }
        scanned += chunk;
    }

    Ok(worklist(claimed))
}
