use std::sync::Arc;

use crate::utils::parse::parse_steam_id_option;
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

const BATCH_SIZE: usize = 100;
const CLAIM_TTL_SECS: u64 = 15 * 60;
const POOL_LIMIT: usize = 200_000;
const MIN_MATCH_ID: u64 = 31_247_321;
const CURSOR_KEY: &str = "matches_to_fetch:cursor";
const CLAIM_PREFIX: &str = "matches_to_fetch:claimed:";

fn worklist(ids: Vec<u64>) -> impl IntoResponse {
    (
        [(CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(ids),
    )
}

#[cached(ttl = 300, convert = "{ 0 }", key = "u8", sync_writes = "default")]
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

#[cached(ttl = 60, convert = "{ 0 }", key = "u8", sync_writes = "default")]
async fn pending_pool(
    ch_client: &clickhouse::Client,
    prioritized: &[u32],
) -> clickhouse::error::Result<Arc<Vec<u64>>> {
    let exclude = if prioritized.is_empty() {
        String::new()
    } else {
        let ids = prioritized
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(",");
        format!(
            "AND match_id NOT IN (SELECT match_id FROM player_match_history \
             WHERE account_id IN ({ids}) AND match_id >= {MIN_MATCH_ID}) "
        )
    };
    let query = format!(
        "SELECT match_id FROM pending_matches FINAL \
         WHERE state = 'pending' AND match_id >= {MIN_MATCH_ID} {exclude}\
         ORDER BY match_id DESC LIMIT {POOL_LIMIT} \
         SETTINGS log_comment = 'matches_to_fetch_pool'"
    );
    let ids: Vec<u64> = ch_client.query(&query).fetch_all().await?;
    Ok(Arc::new(ids))
}

#[cached(
    ttl = 60,
    convert = "{ account_id }",
    key = "u32",
    sync_writes = "by_key"
)]
async fn pending_pool_for_account(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> clickhouse::error::Result<Arc<Vec<u64>>> {
    let query = format!(
        "SELECT match_id FROM pending_matches FINAL \
         WHERE state = 'pending' AND match_id >= {MIN_MATCH_ID} \
           AND match_id IN (SELECT match_id FROM player_match_history \
               WHERE account_id = {account_id} AND match_id >= {MIN_MATCH_ID}) \
         ORDER BY match_id DESC LIMIT {POOL_LIMIT} \
         SETTINGS log_comment = 'matches_to_fetch_pool_account'"
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

    let mut conn = state.redis_client.clone();
    let cursor: u64 = redis::cmd("INCR")
        .arg(CURSOR_KEY)
        .query_async(&mut conn)
        .await
        .unwrap_or(0);
    let start = usize::try_from(cursor.wrapping_mul(BATCH_SIZE as u64) % n as u64).unwrap_or(0);

    let mut claimed: Vec<u64> = Vec::with_capacity(BATCH_SIZE);
    let mut scanned = 0usize;
    while claimed.len() < BATCH_SIZE && scanned < n {
        let chunk = (BATCH_SIZE - claimed.len()).min(n - scanned);
        let ids: Vec<u64> = (0..chunk)
            .map(|k| pool[(start + scanned + k) % n])
            .collect();

        let mut pipe = redis::pipe();
        for id in &ids {
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
