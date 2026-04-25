use core::time::Duration;
use std::collections::HashSet;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::{Itertools, chain};
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_get_match_history_response,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::clickhouse_batcher::{BatchQueryMulti, ClickhouseBatcherMulti};
use crate::services::clickhouse_insert_batcher::{BatchInsert, ClickhouseInsertBatcher};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;
use crate::utils::types::AccountIdQuery;

const MAX_REFETCH_ITERATIONS: i32 = 100;

pub(crate) type PlayerMatchHistory = Vec<PlayerMatchHistoryEntry>;

pub(crate) struct MatchHistoryReadQuery;

impl BatchQueryMulti for MatchHistoryReadQuery {
    type Key = u32;
    type Value = PlayerMatchHistoryEntry;

    fn build_query(keys: &[u32]) -> String {
        format!(
            "SELECT DISTINCT ON (match_id) ?fields FROM player_match_history \
             WHERE account_id IN ({}) ORDER BY match_id DESC",
            keys.iter().map(ToString::to_string).join(",")
        )
    }

    fn key_of(value: &PlayerMatchHistoryEntry) -> u32 {
        value.account_id
    }
}

pub(crate) type MatchHistoryReadBatcher = ClickhouseBatcherMulti<MatchHistoryReadQuery>;

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
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub(crate) hero_id: u32,
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
}

impl PlayerMatchHistoryEntry {
    fn from_protobuf(
        account_id: u32,
        entry: c_msg_client_to_gc_get_match_history_response::Match,
    ) -> Option<Self> {
        Some(Self {
            account_id,
            match_id: entry.match_id?,
            hero_id: entry.hero_id?,
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
        })
    }

    pub(crate) fn won(&self) -> bool {
        i8::try_from(self.match_result).is_ok_and(|r| r == self.player_team)
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

async fn fetch_match_history_raw(
    steam_client: &SteamClient,
    account_id: u32,
    continue_cursor: Option<u64>,
    bot_username: Option<String>,
) -> APIResult<(PlayerMatchHistory, Option<u64>)> {
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: Some(account_id),
        continue_cursor,
        game_mode: None,
        match_mode: None,
    };
    let response: CMsgClientToGcGetMatchHistoryResponse = steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
            msg,
            in_all_groups: Some(vec!["GetMatchHistory".to_owned()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(24 * 60 * 60 / 100),
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
    ty = "TimedCache<(u32, bool), PlayerMatchHistory>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(8 * 60)) }",
    result = true,
    convert = "{ (account_id, force_refetch) }",
    sync_writes = "by_key",
    key = "(u32, bool)"
)]
pub(crate) async fn fetch_steam_match_history(
    steam_client: &SteamClient,
    account_id: u32,
    force_refetch: bool,
    bot_username: Option<String>,
) -> APIResult<PlayerMatchHistory> {
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
    Ok(all_matches
        .into_iter()
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
| IP | 100req/s<br>Bot-Friend: 3req/h<br>With `force_refetch=true`: 1req/h |
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

    let ch_match_history = state.match_history_read_batcher.load(account_id).await?;

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
                    Quota::ip_limit(3, Duration::from_hours(1)),
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
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!("Failed to fetch player match history from Steam: {e:?}");
            vec![]
        }
    };

    // Queue missing entries for batch insertion to ClickHouse
    let ch_match_ids: HashSet<u64> = ch_match_history.iter().map(|e| e.match_id).collect();
    let ch_missing_entries = steam_match_history
        .iter()
        .filter(|e| !ch_match_ids.contains(&e.match_id))
        .cloned()
        .collect_vec();
    if !ch_missing_entries.is_empty() {
        state
            .match_history_insert_batcher
            .insert(ch_missing_entries)
            .await;
    }

    // Combine and return player match history
    let combined_match_history = chain!(ch_match_history, steam_match_history)
        .sorted_by_key(|e| e.match_id)
        .rev()
        .unique_by(|e| e.match_id)
        .collect_vec();
    let mut headers = HeaderMap::new();
    headers.insert("Called-Steam", "true".parse().unwrap());
    Ok((StatusCode::OK, headers, Json(combined_match_history)))
}
