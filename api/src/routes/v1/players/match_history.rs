use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::RateLimitQuota;
use crate::services::rate_limiter::extractor::RateLimitKey;

use crate::routes::v1::players::types::{
    AccountIdQuery, PlayerMatchHistory, PlayerMatchHistoryEntry,
};
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use futures::future::join;
use itertools::{Itertools, chain};
use prost::Message;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;
use tracing::{debug, warn};
use utoipa::IntoParams;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_get_match_history_response,
};

const MAX_REFETCH_ITERATIONS: i32 = 100;

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub struct MatchHistoryQuery {
    /// Refetch the match history from Steam, even if it is already cached in ClickHouse.
    /// Only use this if you are sure that the data in ClickHouse is outdated.
    /// Enabling this flag results in a strict rate limit.
    #[serde(default)]
    #[param(default)]
    pub force_refetch: bool,
    /// Return only the already stored match history from ClickHouse.
    /// There is no rate limit for this option, so if you need a lot of data, you can use this option.
    /// This option is not compatible with `force_refetch`.
    #[serde(default)]
    #[param(default)]
    pub only_stored_history: bool,
}

pub async fn insert_match_history_to_ch(
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
pub async fn fetch_match_history_from_clickhouse(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> APIResult<PlayerMatchHistory> {
    tryhard::retry_fn(||
            async {
                ch_client.query(
                    "SELECT DISTINCT ON (match_id) ?fields FROM player_match_history WHERE account_id = ? ORDER BY match_id DESC"
                )
                    .bind(account_id)
                    .fetch_all()
                    .await
                    .map_err(|e| APIError::InternalError {
                        message: format!("Failed to fetch player match history from ClickHouse: {e}"),
                    })
            }
        )
        .retries(3)
        .fixed_backoff(Duration::from_millis(10))
        .await
}

async fn fetch_match_history_raw(
    steam_client: &SteamClient,
    account_id: u32,
    continue_cursor: Option<u64>,
) -> APIResult<Vec<u8>> {
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: Some(account_id),
        continue_cursor,
        ranked_interval: None,
    };
    steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
            msg,
            in_all_groups: Some(vec!["GetMatchHistory".to_string()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(24 * 60 * 60 / 20), // 200req/day
            request_timeout: Duration::from_secs(3),
            username: None,
        })
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch player match history: {e}"),
        })
        .and_then(|r| {
            debug!("Fetched player match history with: {}", r.username);

            BASE64_STANDARD
                .decode(&r.data)
                .map_err(|e| APIError::InternalError {
                    message: format!("Failed to decode player match history: {e}"),
                })
        })
}

async fn parse_match_history_raw(
    account_id: u32,
    raw_data: &[u8],
) -> APIResult<(PlayerMatchHistory, Option<u64>)> {
    let decoded_message = CMsgClientToGcGetMatchHistoryResponse::decode(raw_data).map_err(|e| {
        APIError::InternalError {
            message: format!("Failed to parse player match history: {e}"),
        }
    })?;
    if decoded_message.result.is_none_or(|r| {
        r != c_msg_client_to_gc_get_match_history_response::EResult::KEResultSuccess as i32
    }) {
        println!("{decoded_message:?}");
        return Err(APIError::InternalError {
            message: format!("Failed to fetch player match history: {decoded_message:?}"),
        });
    }
    Ok((
        decoded_message
            .matches
            .into_iter()
            .flat_map(
                |e| match PlayerMatchHistoryEntry::from_protobuf(account_id, e) {
                    Some(entry) => Some(entry),
                    None => {
                        warn!("Failed to parse player match history entry: {:?}", e);
                        None
                    }
                },
            )
            .collect(),
        decoded_message.continue_cursor,
    ))
}

#[cached(
    ty = "TimedCache<(u32, bool), PlayerMatchHistory>",
    create = "{ TimedCache::with_lifespan(5 * 60) }",
    result = true,
    convert = "{ (account_id, force_refetch) }",
    sync_writes = "by_key",
    key = "(u32, bool)"
)]
pub async fn fetch_steam_match_history(
    steam_client: &SteamClient,
    account_id: u32,
    force_refetch: bool,
) -> APIResult<PlayerMatchHistory> {
    let mut continue_cursor = None;
    let mut all_matches = vec![];
    let mut iterations = 0;
    loop {
        iterations += 1;
        let result = tryhard::retry_fn(|| async {
            let raw_data =
                fetch_match_history_raw(steam_client, account_id, continue_cursor).await?;
            parse_match_history_raw(account_id, &raw_data).await
        })
        .retries(10)
        .fixed_backoff(Duration::from_millis(10))
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
        if let Some(prev_cursor) = continue_cursor {
            if let Some(new_cursor) = result.1 {
                if new_cursor >= prev_cursor {
                    break;
                }
            }
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
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching player match history failed")
    ),
    tags = ["Players"],
    summary = "Match History",
    description = r#"
This endpoint returns the player match history for the given `account_id`.

The player match history is a combination of the data from **Steam** and **ClickHouse**, so you always get the most up-to-date data and full history.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGcGetMatchHistory
- CMsgClientToGcGetMatchHistoryResponse
    "#
)]
pub async fn match_history(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<MatchHistoryQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<Json<PlayerMatchHistory>> {
    if query.force_refetch && query.only_stored_history {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Cannot use both force_refetch and only_stored_history at the same time"
                .to_string(),
        });
    }

    // If only stored history is requested, we can just fetch from ClickHouse
    if query.only_stored_history {
        return fetch_match_history_from_clickhouse(&state.ch_client, account_id)
            .await
            .map(Json);
    }

    // Apply rate limits based on the query parameters
    let res = if query.force_refetch {
        state
            .rate_limit_client
            .apply_limits(
                &rate_limit_key,
                "match_history_refetch",
                &[
                    RateLimitQuota::ip_limit(5, Duration::from_secs(3600)),
                    RateLimitQuota::global_limit(10, Duration::from_secs(3600)),
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
                    RateLimitQuota::ip_limit(5, Duration::from_secs(60)),
                    RateLimitQuota::key_limit(30, Duration::from_secs(60)),
                    RateLimitQuota::global_limit(400, Duration::from_secs(60)),
                ],
            )
            .await
    };
    if let Err(e) = res {
        warn!("Reached rate limits: {e:?}");
        return Err(e);
    }

    // Fetch player match history from Steam and ClickHouse
    let (steam_match_history, ch_match_history) = join(
        fetch_steam_match_history(&state.steam_client, account_id, query.force_refetch),
        fetch_match_history_from_clickhouse(&state.ch_client, account_id),
    )
    .await;
    let steam_match_history = match steam_match_history {
        Ok(r) => r,
        Err(e) => {
            warn!("Failed to fetch player match history from Steam: {e:?}");
            vec![]
        }
    };
    let ch_match_history = ch_match_history?;

    // Insert missing entries to ClickHouse
    let ch_match_ids = ch_match_history.iter().map(|e| e.match_id).collect_vec();
    let ch_missing_entries = steam_match_history
        .iter()
        .filter(|e| !ch_match_ids.contains(&e.match_id))
        .copied()
        .collect_vec();
    if !ch_missing_entries.is_empty() {
        let ch_client = state.ch_client;
        let handle = tokio::spawn(async move {
            let result = insert_match_history_to_ch(&ch_client, &ch_missing_entries).await;
            if let Err(e) = result {
                warn!("Failed to insert player match history to ClickHouse: {e:?}")
            };
        })
        .await;
        if let Err(e) = handle {
            warn!("Failed to spawn task to insert player match history to ClickHouse: {e:?}");
        };
    }

    // Combine and return player match history
    let combined_match_history = chain!(ch_match_history, steam_match_history)
        .sorted_by_key(|e| e.match_id)
        .rev()
        .unique_by(|e| e.match_id)
        .collect_vec();
    Ok(Json(combined_match_history))
}

pub async fn match_history_v2(
    path: Path<AccountIdQuery>,
    query: Query<MatchHistoryQuery>,
    rate_limit_key: RateLimitKey,
    state: State<AppState>,
) -> APIResult<impl IntoResponse> {
    match_history(path, query, rate_limit_key, state)
        .await
        .map(|r| Json(json!({"cursor": 0, "matches": r.0})))
}
