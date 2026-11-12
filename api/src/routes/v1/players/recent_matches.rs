//! The newest stored matches of many players at once, for tools that only need when each
//! player last played, such as Mod Manager's match sync picking which Steam friends to look up.
//! Not in the `OpenAPI` docs.

use core::time::Duration;
use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum_extra::extract::Query;
use clickhouse::Row;
use clickhouse_utils::in_clause;
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};

use super::rank::{account_cost, check_account_id_count};
use crate::context::AppState;
use crate::error::APIResult;
use crate::services::ch_cost::TrackedQuery as _;
use crate::services::protected_accounts::without_protected;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Quota, RateLimit, Scope};
use crate::utils::sql::POINT_LOOKUP_MAX_THREADS;

/// Charged per requested account, since the `ClickHouse` work scales with accounts.
const RATE_LIMIT: RateLimit = RateLimit::new(
    "recent_matches",
    &[
        Quota::new(Scope::Ip, 10_000, Duration::from_mins(1)),
        Quota::new(Scope::Ip, 100_000, Duration::from_hours(1)),
        Quota::new(Scope::Key, 50_000, Duration::from_mins(1)),
        Quota::new(Scope::Key, 500_000, Duration::from_hours(1)),
        Quota::new(Scope::Global, 60_000, Duration::from_mins(1)),
    ],
);

const MAX_ACCOUNT_IDS: usize = 1_000;
const DEFAULT_LIMIT: u32 = 20;
const MAX_LIMIT: u32 = 100;

#[derive(Debug, Deserialize)]
pub(super) struct RecentMatchesQuery {
    /// Comma separated list of account ids, in `SteamID3` or `SteamID64` format.
    #[serde(deserialize_with = "steam_id::de::account_ids")]
    account_ids: Vec<u32>,
    /// Matches per player, newest first: [`DEFAULT_LIMIT`] by default, at most [`MAX_LIMIT`].
    limit: Option<u32>,
}

#[derive(Debug, Clone, Row, Deserialize)]
struct RecentMatchRow {
    account_id: u32,
    match_id: u64,
    start_time: u32,
    match_duration_s: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct RecentMatch {
    match_id: u64,
    start_time: u32,
    match_duration_s: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(super) struct PlayerRecentMatches {
    account_id: u32,
    /// Newest first.
    matches: Vec<RecentMatch>,
}

/// `player_match_history` is sorted by `(account_id, match_id)`, so each account is a
/// primary-key range read in order. Unmerged duplicates of a match are dropped before the
/// per-account limit (measured on 100 sync accounts: same rows as a `GROUP BY`, -21% CPU,
/// 1 MB vs 4 MB peak).
fn build_query(account_ids: &[u32], limit: u32) -> String {
    let ids = in_clause(account_ids);
    format!(
        "SELECT account_id, match_id, start_time, match_duration_s FROM ( \
             SELECT account_id, match_id, toUInt32(start_time) AS start_time, match_duration_s \
             FROM player_match_history \
             WHERE account_id IN ({ids}) \
             ORDER BY account_id, match_id DESC \
             LIMIT 1 BY account_id, match_id \
         ) \
         LIMIT {limit} BY account_id \
         SETTINGS log_comment = 'players_recent_matches', max_threads = {POINT_LOOKUP_MAX_THREADS}"
    )
}

/// One entry per account, in request order, each with its matches newest first.
fn group_by_account(account_ids: &[u32], rows: Vec<RecentMatchRow>) -> Vec<PlayerRecentMatches> {
    let mut by_account: HashMap<u32, Vec<RecentMatch>> = HashMap::new();
    for row in rows {
        by_account
            .entry(row.account_id)
            .or_default()
            .push(RecentMatch {
                match_id: row.match_id,
                start_time: row.start_time,
                match_duration_s: row.match_duration_s,
            });
    }
    account_ids
        .iter()
        .map(|&account_id| {
            let mut matches = by_account.remove(&account_id).unwrap_or_default();
            matches.sort_unstable_by_key(|m| core::cmp::Reverse(m.match_id));
            PlayerRecentMatches {
                account_id,
                matches,
            }
        })
        .collect()
}

/// The newest stored matches of each player (only what is stored; Steam is never asked).
/// Every requested account is returned once, in request order, with no matches if none are
/// stored. Protected accounts are left out.
pub(super) async fn recent_matches(
    Query(RecentMatchesQuery { account_ids, limit }): Query<RecentMatchesQuery>,
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
) -> APIResult<Json<Vec<PlayerRecentMatches>>> {
    check_account_id_count(&account_ids, MAX_ACCOUNT_IDS)?;
    let account_ids: Vec<u32> = account_ids.into_iter().unique().collect();
    state
        .rate_limit_client
        .charge(&rate_limit_key, RATE_LIMIT, account_cost(account_ids.len()))
        .await?;
    let account_ids = without_protected(&state, account_ids).await?;
    if account_ids.is_empty() {
        return Ok(Json(Vec::new()));
    }
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let rows: Vec<RecentMatchRow> = state
        .ch_client_ro
        .query(&build_query(&account_ids, limit))
        .fetch_all_tracked()
        .await?;
    Ok(Json(group_by_account(&account_ids, rows)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn query_is_valid_sql() {
        assert_valid_sql(&build_query(&[1, 2, 3], 20));
    }

    #[test]
    fn groups_rows_per_requested_account_newest_first() {
        let row = |account_id, match_id| RecentMatchRow {
            account_id,
            match_id,
            start_time: u32::try_from(match_id).unwrap(),
            match_duration_s: 1_800,
        };
        let grouped = group_by_account(&[7, 8, 9], vec![row(9, 1), row(7, 5), row(7, 6)]);
        let ids: Vec<(u32, Vec<u64>)> = grouped
            .iter()
            .map(|p| (p.account_id, p.matches.iter().map(|m| m.match_id).collect()))
            .collect();
        assert_eq!(ids, [(7, vec![6, 5]), (8, vec![]), (9, vec![1])]);
    }
}
