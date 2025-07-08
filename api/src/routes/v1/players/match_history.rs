use core::time::Duration;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::{Itertools, chain};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_get_match_history_response,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::players::AccountIdQuery;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;

const MAX_REFETCH_ITERATIONS: i32 = 100;

pub(crate) type PlayerMatchHistory = Vec<PlayerMatchHistoryEntry>;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, Row, Eq, PartialEq, Hash)]
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
    /// Return only the already stored match history from `ClickHouse`.
    /// There is no rate limit for this option, so if you need a lot of data, you can use this option.
    /// This option is not compatible with `force_refetch`.
    #[serde(default)]
    #[param(default)]
    only_stored_history: bool,
}

pub(crate) async fn insert_match_history_to_ch(
    ch_client: &clickhouse::Client,
    match_history: &[PlayerMatchHistoryEntry],
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client.insert("player_match_history")?;
    for entry in match_history {
        inserter.write(entry).await?;
    }
    inserter.end().await
}

#[cached(
    ty = "TimedCache<u32, PlayerMatchHistory>",
    create = "{ TimedCache::with_lifespan(10 * 60) }", // High cache lifespan is ok, as the player match history gets enhanced by Steam API
    result = true,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
pub(crate) async fn fetch_match_history_from_clickhouse(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> clickhouse::error::Result<PlayerMatchHistory> {
    ch_client
        .query(
            "SELECT DISTINCT ON (match_id) ?fields FROM player_match_history WHERE account_id = ? \
             ORDER BY match_id DESC",
        )
        .bind(account_id)
        .fetch_all()
        .await
}

async fn fetch_match_history_raw(
    steam_client: &SteamClient,
    account_id: u32,
    continue_cursor: Option<u64>,
) -> APIResult<(PlayerMatchHistory, Option<u64>)> {
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: Some(account_id),
        continue_cursor,
        ranked_interval: None,
    };
    let response: CMsgClientToGcGetMatchHistoryResponse = steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
            msg,
            in_all_groups: Some(vec!["GetMatchHistory".to_owned()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(24 * 60 * 60 / 100), // 100req/day
            request_timeout: Duration::from_secs(3),
            username: None,
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
                if let Some(entry) = PlayerMatchHistoryEntry::from_protobuf(account_id, e) {
                    Some(entry)
                } else {
                    warn!("Failed to parse player match history entry: {:?}", e);
                    None
                }
            })
            .collect(),
        response.continue_cursor,
    ))
}

#[cached(
    ty = "TimedCache<(u32, bool), PlayerMatchHistory>",
    create = "{ TimedCache::with_lifespan(10 * 60) }",
    result = true,
    convert = "{ (account_id, force_refetch) }",
    sync_writes = "by_key",
    key = "(u32, bool)"
)]
pub(crate) async fn fetch_steam_match_history(
    steam_client: &SteamClient,
    account_id: u32,
    force_refetch: bool,
) -> APIResult<PlayerMatchHistory> {
    debug!("Fetching match history from Steam for account_id {account_id}");
    let mut continue_cursor = None;
    let mut all_matches = vec![];
    let mut iterations = 0;
    loop {
        iterations += 1;
        let result = fetch_match_history_raw(steam_client, account_id, continue_cursor).await?;

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

async fn exists_newer_match_than(
    ch_client: &clickhouse::Client,
    account_id: u32,
    match_id: u64,
) -> bool {
    let query = format!(
        "
    SELECT match_id
    FROM match_player
    WHERE account_id = {account_id} AND match_id > {match_id}
    ORDER BY match_id DESC
    LIMIT 1
    "
    );
    ch_client.query(&query).fetch_one::<u64>().await.is_ok()
}

#[utoipa::path(
    get,
    path = "/{account_id}/match-history",
    params(AccountIdQuery, MatchHistoryQuery),
    responses(
        (status = OK, body = [PlayerMatchHistoryEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching player match history failed")
    ),
    tags = ["Players"],
    summary = "Match History",
    description = "
This endpoint returns the player match history for the given `account_id`.

The player match history is a combination of the data from **Steam** and **ClickHouse**, so you always get the most up-to-date data and full history.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGcGetMatchHistory
- CMsgClientToGcGetMatchHistoryResponse

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 5req/min<br>With `only_stored_history=true`: 100req/s<br>With `force_refetch=true`: 5req/h |
| Key | 50req/min & 1000req/h<br>With `only_stored_history=true`: -<br>With `force_refetch=true`: 5req/h |
| Global | 2000req/h<br>With `only_stored_history=true`: -<br>With `force_refetch=true`: 10req/h |
    "
)]
pub(super) async fn match_history(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<MatchHistoryQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<Json<PlayerMatchHistory>> {
    if query.force_refetch && query.only_stored_history {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Cannot use both force_refetch and only_stored_history at the same time".to_owned(),
        ));
    }

    let ch_match_history =
        fetch_match_history_from_clickhouse(&state.ch_client_ro, account_id).await?;

    // If only stored history is requested, we can just return the data from ClickHouse
    if query.only_stored_history {
        return Ok(Json(ch_match_history));
    }

    let last_match = ch_match_history.iter().max_by_key(|h| h.match_id);

    let mut force_update = false;
    if let Some(last_match) = last_match {
        // if newer than 40 min, check if there is a newer match, otherwise return the clickhouse data
        let is_newer_than_40_min = last_match.start_time
            >= u32::try_from((chrono::Utc::now() - chrono::Duration::minutes(40)).timestamp())
                .unwrap_or_default();
        if is_newer_than_40_min {
            let exists_newer_match =
                exists_newer_match_than(&state.ch_client_ro, account_id, last_match.match_id).await;
            if exists_newer_match {
                force_update = true; // force update if there is a newer match
            } else {
                return Ok(Json(ch_match_history));
            }
        }
    }

    // Apply rate limits based on the query parameters
    let res = if query.force_refetch {
        state
            .rate_limit_client
            .apply_limits(
                &rate_limit_key,
                "match_history_refetch",
                &[
                    Quota::ip_limit(5, Duration::from_secs(60 * 60)),
                    Quota::key_limit(5, Duration::from_secs(60 * 60)),
                    Quota::global_limit(10, Duration::from_secs(60 * 60)),
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
                    Quota::ip_limit(5, Duration::from_secs(60)),
                    Quota::key_limit(50, Duration::from_secs(60)),
                    Quota::key_limit(1000, Duration::from_secs(60 * 60)),
                    Quota::global_limit(2000, Duration::from_secs(60 * 60)),
                ],
            )
            .await
    };
    if let Err(e) = res {
        warn!("Reached rate limits: {e:?}");
        return Err(e);
    }

    // Fetch player match history from Steam and ClickHouse
    let steam_match_history = if force_update {
        fetch_steam_match_history_no_cache(&state.steam_client, account_id, query.force_refetch)
            .await
    } else {
        fetch_steam_match_history(&state.steam_client, account_id, query.force_refetch).await
    };
    let steam_match_history = match steam_match_history {
        Ok(r) => r,
        Err(e) => {
            warn!("Failed to fetch player match history from Steam: {e:?}");
            vec![]
        }
    };

    // Insert missing entries to ClickHouse
    let ch_match_ids = ch_match_history.iter().map(|e| e.match_id).collect_vec();
    let ch_missing_entries = steam_match_history
        .iter()
        .filter(|e| !ch_match_ids.contains(&e.match_id))
        .copied()
        .collect_vec();
    if !ch_missing_entries.is_empty() {
        let ch_client = state.ch_client;
        tokio::spawn(async move {
            let result = insert_match_history_to_ch(&ch_client, &ch_missing_entries).await;
            if let Err(e) = result {
                warn!("Failed to insert player match history to ClickHouse: {e:?}");
            }
            // Purge Cache of `fetch_match_history_from_clickhouse`
            FETCH_MATCH_HISTORY_FROM_CLICKHOUSE
                .lock()
                .await
                .remove(&account_id);
        });
    }

    // Combine and return player match history
    let combined_match_history = chain!(ch_match_history, steam_match_history)
        .sorted_by_key(|e| e.match_id)
        .rev()
        .unique_by(|e| e.match_id)
        .collect_vec();
    Ok(Json(combined_match_history))
}

pub(crate) async fn match_history_v2(
    path: Path<AccountIdQuery>,
    query: Query<MatchHistoryQuery>,
    rate_limit_key: RateLimitKey,
    state: State<AppState>,
) -> APIResult<impl IntoResponse> {
    match_history(path, query, rate_limit_key, state)
        .await
        .map(|r| Json(json!({"cursor": 0, "matches": r.0})))
}
