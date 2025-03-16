use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::routes::v1::players::types::{
    AccountIdQuery, PlayerMatchHistory, PlayerMatchHistoryEntry,
};
use crate::state::AppState;
use crate::utils;
use crate::utils::limiter::{RateLimitQuota, apply_limits};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use futures::future::join;
use itertools::{Itertools, chain};
use prost::Message;
use std::time::Duration;
use tracing::{debug, warn};
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_get_match_history_response,
};

pub async fn insert_match_history_to_clickhouse(
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
                    "SELECT ?fields FROM player_match_history FINAL WHERE account_id = ? ORDER BY start_time DESC"
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

#[cached(
    ty = "TimedCache<u32, Vec<u8>>",
    create = "{ TimedCache::with_lifespan(5 * 60) }",
    result = true,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
async fn fetch_match_history_raw(
    config: &Config,
    http_client: &reqwest::Client,
    account_id: u32,
) -> APIResult<Vec<u8>> {
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: Some(account_id),
        continue_cursor: None,
        ranked_interval: None,
    };
    utils::steam::call_steam_proxy(
        config,
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
        msg,
        None,
        Some(&["GetMatchHistory", "GetMatchHistoryOnDemand"]),
        Duration::from_secs(10 * 60),
        Duration::from_secs(3),
    )
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
) -> APIResult<PlayerMatchHistory> {
    let decoded_message = CMsgClientToGcGetMatchHistoryResponse::decode(raw_data).map_err(|e| {
        APIError::InternalError {
            message: format!("Failed to parse player match history: {e}"),
        }
    })?;
    if decoded_message.result.is_none_or(|r| {
        r != c_msg_client_to_gc_get_match_history_response::EResult::KEResultSuccess as i32
    }) {
        println!("{:?}", decoded_message);
        return Err(APIError::InternalError {
            message: format!(
                "Failed to fetch player match history: {:?}",
                decoded_message
            ),
        });
    }
    Ok(decoded_message
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
        .collect())
}

pub async fn fetch_steam_match_history(
    account_id: u32,
    config: &Config,
    http_client: &reqwest::Client,
) -> APIResult<PlayerMatchHistory> {
    tryhard::retry_fn(|| async {
        let raw_data = fetch_match_history_raw(config, http_client, account_id).await?;
        parse_match_history_raw(account_id, &raw_data).await
    })
    .retries(10)
    .fixed_backoff(Duration::from_millis(10))
    .await
}

#[utoipa::path(
    get,
    path = "/{account_id}/match-history",
    params(AccountIdQuery),
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
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(
        &headers,
        &state,
        "match_history",
        &[RateLimitQuota::ip_limit(100, Duration::from_secs(1))],
    )
    .await?;
    let ch_client = &state.clickhouse_client;

    // Fetch player match history from Steam and ClickHouse
    let (steam_match_history, ch_match_history) = join(
        fetch_steam_match_history(account_id, &state.config, &state.http_client),
        fetch_match_history_from_clickhouse(ch_client, account_id),
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
        .cloned()
        .collect_vec();
    let insert_to_ch = insert_match_history_to_clickhouse(ch_client, &ch_missing_entries).await;
    if let Err(e) = insert_to_ch {
        warn!("Failed to insert player match history to ClickHouse: {e:?}")
    };

    // Combine and return player match history
    let combined_match_history = chain!(ch_match_history, steam_match_history)
        .sorted_by_key(|e| e.match_id)
        .rev()
        .unique_by(|e| e.match_id)
        .collect_vec();
    Ok(Json(combined_match_history))
}
