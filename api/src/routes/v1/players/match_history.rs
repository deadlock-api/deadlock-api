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
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, ECitadelGameMode,
    ECitadelMatchMode, EgcCitadelClientMessages, c_msg_client_to_gc_get_match_history_response,
};

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
const ETERNUS_MAX_BADGE: u32 = 116;

/// Columns the table coalesces to the latest non-NULL value; every other column
/// takes the latest row's value.
const COALESCED_COLUMNS: [&str; 4] = [
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
        // player entered the match with (see ETERNUS_MIN_BADGE). The join is pruned to the
        // Eternus entries; `match_player` filtered on `account_id` alone would fall back to a
        // bloom-filter scan over every part.
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
                 FROM match_player \
                 WHERE account_id IN ({ids}) AND match_mode = 'Ranked' AND (account_id, match_id) IN ( \
                     SELECT account_id, match_id FROM player_match_history \
                     WHERE account_id IN ({ids}) AND ranked_display_badge >= {ETERNUS_MIN_BADGE} \
                 ) \
                 GROUP BY account_id, match_id \
             ) AS ranks USING (account_id, match_id) \
             ORDER BY match_id DESC \
             SETTINGS log_comment = 'match_history'"
        )
    }

    fn key_of(value: &PlayerMatchHistoryEntry) -> u32 {
        value.account_id
    }
}

pub(crate) type MatchHistoryReadBatcher = ClickhouseBatcherMulti<MatchHistoryReadQuery>;

#[cached(
    ttl_secs = 600,
    convert = "{ account_id }",
    sync_writes = "by_key",
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

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, Row, Eq, PartialEq, Hash)]
pub(crate) struct PlayerMatchHistoryEntry {
    account_id: u32,
    pub(crate) match_id: u64,
    /// See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub(crate) hero_id: u8,
    hero_level: u32,
    pub(crate) start_time: u32,
    game_mode: i8,
    pub(crate) match_mode: i8,
    player_team: i8,
    pub(crate) player_kills: u32,
    pub(crate) player_deaths: u32,
    player_assists: u32,
    pub(crate) denies: u32,
    pub(crate) net_worth: u32,
    pub(crate) last_hits: u32,
    team_abandoned: Option<bool>,
    abandoned_time_s: Option<u32>,
    pub(crate) match_duration_s: u32,
    match_result: u32,
    objectives_mask_team0: u32,
    objectives_mask_team1: u32,
    brawl_score_team0: Option<u32>,
    brawl_score_team1: Option<u32>,
    brawl_avg_round_time_s: Option<u32>,
    /// How the match was scored for the player: 0 = invalid, 1 = win, 2 = loss, 3 = penalized, 4 = penalized party, 5 = not scored.
    player_match_outcome: i8,
    /// The ranked badge shown for the player after the match (tier = first digits, subtier = last digit). Within Eternus, where subranks are percentile cuts the GC misreports, this is the badge the player entered the match with. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    ranked_display_badge: Option<u32>,
    /// The ranked progress change the player got from this match.
    ranked_delta: Option<i32>,
    /// Non-zero if this match counted towards the player's ranked calibration.
    ranked_calibration_match: Option<u32>,
    /// Whether the player's demotion protection absorbed a loss in this match.
    ranked_used_demotion_protection: Option<bool>,
}

impl PlayerMatchHistoryEntry {
    fn from_protobuf(
        account_id: u32,
        entry: c_msg_client_to_gc_get_match_history_response::Match,
    ) -> Option<Self> {
        Some(Self {
            account_id,
            match_id: entry.match_id?,
            hero_id: u8::try_from(entry.hero_id?).ok()?,
            hero_level: entry.hero_level?,
            start_time: entry.start_time?,
            game_mode: i8::try_from(entry.game_mode?).ok()?,
            match_mode: i8::try_from(entry.match_mode?).ok()?,
            player_team: i8::try_from(entry.player_team?).ok()?,
            player_kills: entry.player_kills?,
            player_deaths: entry.player_deaths?,
            player_assists: entry.player_assists?,
            denies: entry.denies?,
            net_worth: entry.net_worth?,
            last_hits: entry.last_hits?,
            team_abandoned: entry.team_abandoned,
            abandoned_time_s: entry.abandoned_time_s,
            match_duration_s: entry.match_duration_s?,
            match_result: entry.match_result?,
            objectives_mask_team0: u32::try_from(entry.objectives_mask_team0?).ok()?,
            objectives_mask_team1: u32::try_from(entry.objectives_mask_team1?).ok()?,
            brawl_score_team0: entry.brawl_score_team0,
            brawl_score_team1: entry.brawl_score_team1,
            brawl_avg_round_time_s: entry.brawl_avg_round_time_s,
            player_match_outcome: i8::try_from(entry.player_match_outcome.unwrap_or_default())
                .ok()?,
            ranked_display_badge: entry
                .ranked_display_badge
                .map(|badge| badge.min(ETERNUS_MAX_BADGE)),
            ranked_delta: entry.ranked_delta,
            ranked_calibration_match: entry.ranked_calibration_match,
            ranked_used_demotion_protection: entry.ranked_used_demotion_protection,
        })
    }

    pub(crate) fn won(&self) -> bool {
        i8::try_from(self.match_result).is_ok_and(|r| r == self.player_team)
    }

    fn has_ranked_data(&self) -> bool {
        self.ranked_display_badge.is_some()
            || self.ranked_delta.is_some()
            || self.ranked_calibration_match.is_some()
            || self.ranked_used_demotion_protection.is_some()
    }

    /// Fills unset ranked fields from `fallback`, mirroring the table's
    /// `CoalescingMergeTree` merge.
    fn coalesce_ranked(mut self, fallback: &Self) -> Self {
        self.ranked_display_badge = self.ranked_display_badge.or(fallback.ranked_display_badge);
        self.ranked_delta = self.ranked_delta.or(fallback.ranked_delta);
        self.ranked_calibration_match = self
            .ranked_calibration_match
            .or(fallback.ranked_calibration_match);
        self.ranked_used_demotion_protection = self
            .ranked_used_demotion_protection
            .or(fallback.ranked_used_demotion_protection);
        self
    }
}

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
    ttl_secs = 480,
    convert = "{ (account_id, rank_interval) }",
    sync_writes = "by_key",
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
