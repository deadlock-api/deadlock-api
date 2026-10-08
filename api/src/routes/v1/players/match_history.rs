use core::time::Duration;
use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum_extra::extract::Query;
use cached::macros::cached;
use chrono::Utc;
use clickhouse::Row;
use itertools::{Itertools, chain};
use serde::Deserialize;
use tracing::{debug, warn};
use utoipa::IntoParams;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, ECitadelGameMode,
    ECitadelMatchMode, EgcCitadelClientMessages, c_msg_client_to_gc_get_match_history_response,
};

pub(crate) use player_match_history::{ETERNUS_MAX_BADGE, PlayerMatchHistoryEntry};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{Language, resolve_version};
use crate::services::assets::versions::ranked_seasons::{fetch_ranked_seasons, interval_at};
use crate::services::clickhouse_batcher::{BatchQueryMulti, ClickhouseBatcherMulti, in_clause};
use crate::services::clickhouse_insert_batcher::{BatchInsert, ClickhouseInsertBatcher};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;
use crate::utils::types::AccountIdQuery;

const MAX_REFETCH_ITERATIONS: i32 = 100;

pub(crate) type PlayerMatchHistory = Vec<PlayerMatchHistoryEntry>;

/// Eternus badge bounds (tier 11, subranks 1-6). Eternus subranks are percentile cuts Valve
/// recomputes daily, but the GC's after-match `ranked_display_badge` keeps extending the
/// flat-progress ladder formula instead, yielding subranks Valve never displays (even badges
/// past 116). Within Eternus the badge the player *entered* the match with, from
/// `match_player.player_rank_initial_display_rank`, is the percentile-correct one, so reads
/// substitute it; entries whose rank metadata has not landed yet fall back to capping at
/// Eternus 6.
const ETERNUS_MIN_BADGE: u32 = 111;

/// Columns the table coalesces to the latest non-NULL value; every other column
/// takes the latest row's value.
pub(crate) const COALESCED_COLUMNS: [&str; 4] = [
    "ranked_display_badge",
    "ranked_delta",
    "ranked_calibration_match",
    "ranked_used_demotion_protection",
];

pub(crate) struct MatchHistoryReadQuery;

impl BatchQueryMulti for MatchHistoryReadQuery {
    type Key = u32;
    type Value = PlayerMatchHistoryEntry;

    fn build_query(keys: &[u32]) -> String {
        let ids = in_clause(keys);
        // Reproduces the table's CoalescingMergeTree merge rather than using FINAL,
        // which costs ~11x the time and ~35x the memory on a 20-account batch.
        // Grouping by (account_id, match_id) also keeps a match shared by two
        // batched accounts, which the previous `DISTINCT ON (match_id)` dropped.
        let inner_columns = PlayerMatchHistoryEntry::COLUMN_NAMES
            .iter()
            .map(|c| match *c {
                "account_id" | "match_id" => (*c).to_owned(),
                c if COALESCED_COLUMNS.contains(&c) => {
                    format!("argMaxIf({c}, created_at, {c} IS NOT NULL) AS {c}")
                }
                c => format!("argMax({c}, created_at) AS {c}"),
            })
            .join(", ");
        // Within Eternus, replace the GC's extrapolated after-match badge with the badge the
        // player entered the match with (see ETERNUS_MIN_BADGE). The join reads
        // player_match_stats, whose (account_id, match_id) key makes the account filter a
        // primary-key range (measured -31% wall, -40% read_rows vs. the match_player
        // bloom-filter read on a 7-account Eternus batch). It is not pruned to the Eternus
        // entries: the outer `if` only uses `initial_display_rank` for them anyway, and the
        // pruning subquery read player_match_history a second time (measured on 50 production
        // batches without it: identical results, -38% read_rows, p50 45 -> 34 ms).
        //
        // use_statistics/join-order-limit are off: since 26.8 the planner loads per-part
        // column statistics and reorders joins at plan time, ~200ms per query here for a
        // slightly worse plan (benchmarked 236ms -> 70ms with both disabled).
        //
        // max_threads is capped at 2: the inner GROUP BY builds one hash table of ~28
        // argMax states per thread, so the client default of 16 costs 29 MiB peak for no
        // latency gain (benchmarked 29 MiB -> 13 MiB, wall unchanged at p=0.93). This is a
        // point-lookup endpoint at ~185k calls/week, so the headroom matters more than
        // per-query parallelism.
        let outer_columns = PlayerMatchHistoryEntry::COLUMN_NAMES
            .iter()
            .map(|c| match *c {
                "ranked_display_badge" => format!(
                    "if(ranked_display_badge >= {ETERNUS_MIN_BADGE}, \
                     if(initial_display_rank > 0, \
                     greatest({ETERNUS_MIN_BADGE}, initial_display_rank), \
                     least(ranked_display_badge, {ETERNUS_MAX_BADGE})), \
                     ranked_display_badge) AS ranked_display_badge"
                ),
                c => (*c).to_owned(),
            })
            .join(", ");
        format!(
            "SELECT {outer_columns} FROM ( \
                 SELECT {inner_columns} FROM player_match_history \
                 WHERE account_id IN ({ids}) GROUP BY account_id, match_id \
             ) AS history \
             LEFT JOIN ( \
                 SELECT account_id, match_id, \
                        max(assumeNotNull(player_rank_initial_display_rank)) AS initial_display_rank \
                 FROM player_match_stats \
                 WHERE account_id IN ({ids}) AND match_mode = 'Ranked' \
                 GROUP BY account_id, match_id \
             ) AS ranks USING (account_id, match_id) \
             ORDER BY match_id DESC \
             SETTINGS log_comment = 'match_history', \
                 use_statistics = 0, query_plan_optimize_join_order_limit = 0, \
                 max_threads = 2"
        )
    }

    fn key_of(value: &PlayerMatchHistoryEntry) -> u32 {
        value.account_id
    }
}

pub(crate) type MatchHistoryReadBatcher = ClickhouseBatcherMulti<MatchHistoryReadQuery>;

#[cached(
    max_size = 1_000,
    ttl_secs = 60,
    convert = "{ account_id }",
    key = "u32"
)]
async fn fetch_ch_match_history(
    batcher: &MatchHistoryReadBatcher,
    account_id: u32,
) -> Result<PlayerMatchHistory, APIError> {
    batcher.load(account_id).await
}

pub(crate) struct MatchHistoryInsert;

impl BatchInsert for MatchHistoryInsert {
    type Row = PlayerMatchHistoryEntry;

    fn table_name() -> &'static str {
        "player_match_history"
    }
}

pub(crate) type MatchHistoryInsertBatcher = ClickhouseInsertBatcher<MatchHistoryInsert>;

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub(crate) struct MatchHistoryQuery {
    /// Refetch the match history from Steam, even if it is already cached in `ClickHouse`.
    /// Only use this if you are sure that the data in `ClickHouse` is outdated.
    /// Enabling this flag results in a strict rate limit.
    #[serde(default)]
    #[param(default)]
    force_refetch: bool,
}

/// Queues for insertion whatever `ClickHouse` is missing or has no ranked data for,
/// then merges both sides. Steam wins, but keeps ranked fields only `ClickHouse`
/// has: the ranked call covers just the current interval, so older ranked matches
/// are stored, never re-fetched.
async fn merge_and_store(
    state: &AppState,
    ch_match_history: PlayerMatchHistory,
    steam_match_history: PlayerMatchHistory,
) -> PlayerMatchHistory {
    let mut ch_by_match: HashMap<u64, PlayerMatchHistoryEntry> = ch_match_history
        .into_iter()
        .map(|e| (e.match_id, e))
        .collect();

    let pending = steam_match_history
        .iter()
        .filter(|e| {
            ch_by_match
                .get(&e.match_id)
                .is_none_or(|ch| e.has_ranked_data() && !ch.has_ranked_data())
        })
        .cloned()
        .collect_vec();
    if !pending.is_empty() {
        state.batchers.match_history_insert.insert(pending).await;
    }

    let merged = steam_match_history
        .into_iter()
        .map(|e| match ch_by_match.remove(&e.match_id) {
            Some(ch) => e.coalesce_ranked(&ch),
            None => e,
        })
        .collect_vec();
    chain!(merged, ch_by_match.into_values())
        .sorted_by_key(|e| e.match_id)
        .rev()
        .collect_vec()
}

/// `None` skips the ranked call, leaving the ranked_* fields to `ClickHouse`.
async fn current_rank_interval(state: &AppState) -> Option<u32> {
    let version = resolve_version(state, None).await.ok()?;
    let seasons = fetch_ranked_seasons(&state.r2_client, version, Language::default().as_str())
        .await
        .ok()?;
    interval_at(&seasons, Utc::now().timestamp())
}

async fn fetch_bot_username(
    pg_client: &sqlx::Pool<sqlx::Postgres>,
    account_id: u32,
) -> Option<String> {
    sqlx::query!(
        "SELECT bot_id FROM bot_friends WHERE friend_id = $1",
        i32::try_from(account_id).unwrap_or(-1)
    )
    .fetch_optional(pg_client)
    .await
    .ok()
    .flatten()
    .map(|r| r.bot_id)
}

/// With `rank_interval` set the GC returns only that interval's ranked matches, but
/// each entry then carries the ranked_* fields.
async fn fetch_match_history_raw(
    steam_client: &SteamClient,
    account_id: u32,
    continue_cursor: Option<u64>,
    bot_username: Option<String>,
    rank_interval: Option<u32>,
) -> APIResult<(PlayerMatchHistory, Option<u64>)> {
    // The GC gates the ranked_* fields on all three of `game_mode`, `match_mode` and
    // `rank_interval` being set; with any one unset it omits all four.
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: Some(account_id),
        continue_cursor,
        game_mode: rank_interval
            .is_some()
            .then_some(ECitadelGameMode::KECitadelGameModeNormal as i32),
        match_mode: rank_interval
            .is_some()
            .then_some(ECitadelMatchMode::KECitadelMatchModeRanked as i32),
        ranked_type: None,
        rank_interval,
        cabal_id: None,
    };
    let response: CMsgClientToGcGetMatchHistoryResponse = steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
            msg,
            in_all_groups: Some(vec!["GetMatchHistory".to_owned()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(24 * 60 * 60 / 50),
            request_timeout: Duration::from_secs(3),
            username: bot_username,
            soft_cooldown_millis: None,
        })
        .await?
        .msg;
    if response.result.is_none_or(|r| {
        r != c_msg_client_to_gc_get_match_history_response::EResult::KEResultSuccess as i32
    }) {
        return Err(APIError::internal(format!(
            "Failed to fetch player match history: {response:?}"
        )));
    }
    Ok((
        response
            .matches
            .into_iter()
            .filter_map(|e| {
                PlayerMatchHistoryEntry::from_protobuf(account_id, e).map_or_else(
                    || {
                        warn!("Failed to parse player match history entry: {e:?}");
                        None
                    },
                    Some,
                )
            })
            .collect(),
        response.continue_cursor,
    ))
}

#[cached(
    max_size = 1_000,
    ttl_secs = 480,
    convert = "{ (account_id, rank_interval) }",
    key = "(u32, Option<u32>)",
    force_refresh = "{ force_refetch }"
)]
pub(crate) async fn fetch_steam_match_history(
    steam_client: &SteamClient,
    account_id: u32,
    force_refetch: bool,
    bot_username: Option<String>,
    rank_interval: Option<u32>,
) -> Result<PlayerMatchHistory, APIError> {
    debug!("Fetching match history from Steam for account_id {account_id}");
    let mut continue_cursor = None;
    let mut all_matches = vec![];
    let mut iterations = 0;
    loop {
        iterations += 1;
        let result = fetch_match_history_raw(
            steam_client,
            account_id,
            continue_cursor,
            bot_username.clone(),
            None,
        )
        .await?;

        // Check if the result is empty, in which case we can stop
        if result.0.is_empty() {
            break;
        }
        // Add the new matches to the list
        all_matches.extend(result.0);

        // If force_refetch is false, then we stop fetching more matches
        if !force_refetch {
            break;
        }

        // Check if the new continue cursor is None or 0, in which case we stop fetching more matches
        if result.1.is_none_or(|c| c == 0) {
            break;
        }

        // Check if the new continue cursor is bigger than the previous one, in which case we stop fetching more matches
        if let Some(prev_cursor) = continue_cursor
            && let Some(new_cursor) = result.1
            && new_cursor >= prev_cursor
        {
            break;
        }

        // Check if we have reached the maximum number of iterations, in which case we stop fetching more matches
        if iterations > MAX_REFETCH_ITERATIONS {
            break;
        }

        // Update the continue cursor
        continue_cursor = result.1;
    }

    // Returns the whole interval's ranked history in one response, no cursor. Its
    // entries are a field-wise superset, so chaining it first makes `unique_by`
    // prefer it. Failing here only costs the ranked fields.
    let ranked_matches = match rank_interval {
        Some(interval) => {
            fetch_match_history_raw(steam_client, account_id, None, bot_username, Some(interval))
                .await
                .map_or_else(
                    |e| {
                        warn!("Failed to fetch ranked match history for {account_id}: {e:?}");
                        vec![]
                    },
                    |r| r.0,
                )
        }
        None => vec![],
    };

    Ok(chain!(ranked_matches, all_matches)
        .unique_by(|e| e.match_id)
        .sorted_by_key(|e| e.match_id)
        .rev()
        .collect_vec())
}

#[utoipa::path(
    get,
    path = "/{account_id}/match-history",
    params(AccountIdQuery, MatchHistoryQuery),
    responses(
        (status = OK, body = [PlayerMatchHistoryEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, body = [PlayerMatchHistoryEntry], description = "Rate limit exceeded. Returns stored match history from ClickHouse as a fallback. When `force_refetch=true`, returns an error instead."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching player match history failed")
    ),
    tags = ["Players"],
    summary = "Match History",
    description = "
This endpoint returns the player match history for the given `account_id`.

If the account is friends with one of our bots, the match history is a combination of the data from **Steam** and **ClickHouse**, so you always get the most up-to-date data and full history.
If the account is not friends with a bot, only the stored match history from **ClickHouse** is returned.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGcGetMatchHistory
- CMsgClientToGcGetMatchHistoryResponse

### Rate Limits (only applies to bot friends):
| Type | Limit |
| ---- | ----- |
| IP | 100req/s<br>Bot-Friend: 10req/h<br>With `force_refetch=true`: 1req/h |
| Key | -<br>Bot-Friend: 300req/h<br>With `force_refetch=true`: 5req/h |
| Global | -<br>Bot-Friend: 1500req/h<br>With `force_refetch=true`: 10req/h |
    "
)]
pub(super) async fn match_history(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<MatchHistoryQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<(StatusCode, HeaderMap, Json<PlayerMatchHistory>)> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }

    let ch_match_history =
        fetch_ch_match_history(&state.batchers.match_history_read, account_id).await?;

    // Look up bot friend username for this account
    let bot_username = fetch_bot_username(&state.pg_client, account_id).await;

    // If the account is not friends with a bot, return only stored history from ClickHouse
    if bot_username.is_none() {
        let mut headers = HeaderMap::new();
        headers.insert("Called-Steam", "false".parse().unwrap());
        return Ok((StatusCode::OK, headers, Json(ch_match_history)));
    }

    // Apply rate limits based on the query parameters
    let res = if query.force_refetch {
        state
            .rate_limit_client
            .apply_limits(
                &rate_limit_key,
                "match_history_refetch",
                &[
                    Quota::ip_limit(1, Duration::from_hours(1)),
                    Quota::key_limit(5, Duration::from_hours(1)),
                    Quota::global_limit(10, Duration::from_hours(1)),
                ],
            )
            .await
    } else {
        state
            .rate_limit_client
            .apply_limits(
                &rate_limit_key,
                "match_history",
                &[
                    Quota::ip_limit(10, Duration::from_hours(1)),
                    Quota::key_limit(300, Duration::from_hours(1)),
                    Quota::global_limit(1500, Duration::from_hours(1)),
                ],
            )
            .await
    };
    if let Err(e) = res {
        warn!("Reached rate limits: {e:?}");
        if query.force_refetch {
            return Err(e);
        }
        // Fallback to stored history with 429 status for normal requests
        let mut headers = HeaderMap::new();
        headers.insert("Called-Steam", "false".parse().unwrap());
        return Ok((
            StatusCode::TOO_MANY_REQUESTS,
            headers,
            Json(ch_match_history),
        ));
    }

    // Fetch player match history from Steam and ClickHouse
    let steam_match_history = match fetch_steam_match_history(
        &state.steam_client,
        account_id,
        query.force_refetch,
        bot_username,
        current_rank_interval(&state).await,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!("Failed to fetch player match history from Steam: {e:?}");
            vec![]
        }
    };

    let combined_match_history =
        merge_and_store(&state, ch_match_history, steam_match_history).await;
    let mut headers = HeaderMap::new();
    headers.insert("Called-Steam", "true".parse().unwrap());
    Ok((StatusCode::OK, headers, Json(combined_match_history)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn match_history_build_query_is_valid_sql() {
        assert_valid_sql(&MatchHistoryReadQuery::build_query(&[1, 2, 3]));
    }

    #[test]
    fn match_history_rank_join_reads_player_match_stats() {
        let query = MatchHistoryReadQuery::build_query(&[1]);
        assert!(query.contains("AS initial_display_rank FROM player_match_stats WHERE"));
        assert!(!query.contains("FROM match_player"));
        // player_match_history is read once, by the history subquery only.
        assert_eq!(query.matches("FROM player_match_history").count(), 1);
    }

    /// The projection is generated from `COLUMN_NAMES`, so every column must reach
    /// the query or the row would deserialize into the wrong fields.
    #[test]
    fn match_history_build_query_projects_every_column() {
        let query = MatchHistoryReadQuery::build_query(&[1]);
        for column in PlayerMatchHistoryEntry::COLUMN_NAMES {
            assert!(query.contains(column), "{column} missing from {query}");
        }
    }
}
