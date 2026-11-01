use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::header::{CACHE_CONTROL, COOKIE, SET_COOKIE};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum_extra::extract::Query;
use cached::macros::cached;
use db_clients::RELEASE_IF_OWNED;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use tracing::{debug, warn};
use uuid::Uuid;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::pending_matches::{MIN_AGE_SECS, MIN_MATCH_ID};
use crate::utils::request::header_str;
use crate::utils::sql::id_list;

const BATCH_SIZE: usize = 50;
const CLAIM_TTL_SECS: u64 = 15 * 60;
const POOL_LIMIT: usize = 200_000;
const CLAIM_PREFIX: &str = "matches_to_fetch:claimed:";
/// Set of the match ids one to-fetch response claimed, keyed by its claim token.
const CLAIM_LIST_PREFIX: &str = "matches_to_fetch:claim_list:";
/// Carries a response's claim token, so the worker can release the list it was handed.
const CLAIM_COOKIE: &str = "to_fetch_claim";

fn worklist(ids: impl Serialize) -> Response {
    (
        [(CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(ids),
    )
        .into_response()
}

/// The claim token in the request's [`CLAIM_COOKIE`], if it holds a valid one.
fn claim_token(headers: &HeaderMap) -> Option<Uuid> {
    header_str(headers, COOKIE)?
        .split(';')
        .find_map(|cookie| cookie.trim().strip_prefix(CLAIM_COOKIE)?.strip_prefix('='))
        .and_then(|token| Uuid::parse_str(token).ok())
}

/// The `Set-Cookie` value handing out `token`, or clearing the cookie if `None`. Scoped to
/// the to-fetch routes and living as long as the claims it releases.
fn claim_cookie(token: Option<Uuid>) -> APIResult<HeaderValue> {
    let (value, max_age) = token.map_or((String::new(), 0), |t| (t.to_string(), CLAIM_TTL_SECS));
    HeaderValue::from_str(&format!(
        "{CLAIM_COOKIE}={value}; Path=/v1/matches/to-fetch; Max-Age={max_age}; HttpOnly; Secure; \
         SameSite=Strict"
    ))
    .map_err(|e| APIError::internal(format!("Invalid claim cookie: {e}")))
}

/// Releases the claims of the list handed out with `token`, leaving matches other workers
/// have claimed since alone.
async fn release_claim_list(
    conn: &mut redis::aio::ConnectionManager,
    token: Uuid,
) -> redis::RedisResult<()> {
    let list_key = format!("{CLAIM_LIST_PREFIX}{token}");
    let (ids,): (Vec<u64>,) = redis::pipe()
        .atomic()
        .smembers(&list_key)
        .del(&list_key)
        .ignore()
        .query_async(conn)
        .await?;
    if !ids.is_empty() {
        release_claims(conn, &ids, &token.to_string()).await;
    }
    Ok(())
}

/// Remembers which matches `token` claimed, so [`release_claim_list`] can release them.
async fn store_claim_list(
    conn: &mut redis::aio::ConnectionManager,
    token: Uuid,
    ids: &[u64],
) -> redis::RedisResult<()> {
    let list_key = format!("{CLAIM_LIST_PREFIX}{token}");
    redis::pipe()
        .sadd(&list_key, ids)
        .ignore()
        .expire(&list_key, i64::try_from(CLAIM_TTL_SECS).unwrap_or(i64::MAX))
        .ignore()
        .query_async(conn)
        .await
}

/// The prioritized accounts, or none if Postgres fails. That fallback is cached too, so an
/// outage costs one failed query a minute instead of one per request.
#[cached(ttl_secs = 60, convert = "{ 0 }", key = "u8", sync_writes = "default")]
async fn prioritized_account_ids(pg_client: &Pool<Postgres>) -> Arc<Vec<u32>> {
    let ids: Vec<i64> = match sqlx::query_scalar(
        "SELECT steam_id3 FROM prioritized_steam_accounts WHERE deleted_at IS NULL",
    )
    .fetch_all(pg_client)
    .await
    {
        Ok(ids) => ids,
        Err(e) => {
            // Without the prioritized accounts the pool is just the newest pending matches.
            warn!("Failed to load prioritized accounts: {e}");
            vec![]
        }
    };
    Arc::new(
        ids.into_iter()
            .filter_map(|id| u32::try_from(id).ok())
            .collect(),
    )
}

/// Cache key of [`pending_pool`]: the pool depends on the prioritized accounts.
fn pool_key(prioritized: &[u32]) -> u64 {
    use core::hash::{BuildHasher as _, BuildHasherDefault};
    BuildHasherDefault::<std::hash::DefaultHasher>::default().hash_one(prioritized)
}

/// Pending matches in fetch order: prioritized accounts' matches first, then newest day first;
/// within a day matches requested from the API (dated by an estimate from their id; older
/// requests without one count as today's), then ranked, unranked, street brawl and everything
/// else; within those a higher-badge player (any one player's badge at that match) first, then
/// the newest.
/// Holds every pending prioritized match plus the newest others, up to `POOL_LIMIT`.
#[cached(
    max_size = 2,
    ttl_secs = 60,
    convert = "{ pool_key(prioritized) }",
    key = "u64",
    sync_writes = "default"
)]
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
    let query = format!(
        "WITH prio AS ({prio})
         SELECT match_id FROM (
             SELECT match_id, match_id IN prio AS is_prio, start_time, match_mode, game_mode, badge
             FROM pending_matches FINAL
             WHERE state = 'pending' AND match_id >= {MIN_MATCH_ID}
               AND start_time < now() - INTERVAL {MIN_AGE_SECS} SECOND
             ORDER BY is_prio DESC, match_id DESC LIMIT {POOL_LIMIT}
         )
         ORDER BY is_prio DESC,
                  toDate(if(start_time = 0, now(), start_time)) DESC,
                  multiIf(match_mode = 'Invalid', 1,
                          match_mode = 'Ranked', 2,
                          game_mode = 'StreetBrawl', 4,
                          match_mode = 'Unranked', 3,
                          5),
                  badge DESC,
                  match_id DESC
         SETTINGS log_comment = 'matches_to_fetch_pool'"
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
         ORDER BY match_id DESC LIMIT {BATCH_SIZE} \
         SETTINGS log_comment = 'matches_to_fetch_pool_account', use_statistics = 0"
    );
    let ids: Vec<u64> = ch_client.query(&query).fetch_all().await?;
    Ok(Arc::new(ids))
}

#[derive(Deserialize)]
pub(super) struct ToFetchQuery {
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "steam_id::de::account_id_option")]
    account_id: Option<u32>,
}

/// Hands out the next matches to fetch and claims them for [`CLAIM_TTL_SECS`], so other
/// workers skip them. The response's [`CLAIM_COOKIE`] identifies the claimed list: sending it
/// with the next to-fetch request, or to [`release_matches_to_fetch`], releases that list.
pub(super) async fn matches_to_fetch(
    Query(ToFetchQuery { account_id }): Query<ToFetchQuery>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> APIResult<impl IntoResponse> {
    debug!(?account_id, "matches_to_fetch request");

    // A worker asking again is done with its previous list. Release it first, so the
    // matches it didn't get to are handed out again, possibly to this worker.
    let mut conn = state.redis_client.clone();
    if let Some(old) = claim_token(&headers)
        && let Err(e) = release_claim_list(&mut conn, old).await
    {
        warn!("Failed to release the previous claims of matches to fetch: {e}");
    }

    if let Some(account_id) = account_id {
        let ids = pending_pool_for_account(&state.ch_client_ro, account_id).await?;
        return Ok(worklist(ids));
    }

    let prioritized = prioritized_account_ids(&state.pg_client).await;
    let pool = pending_pool(&state.ch_client_ro, prioritized.as_slice()).await?;
    let n = pool.len();
    if n == 0 {
        return Ok(worklist(Vec::<u64>::new()));
    }

    // Walk the pool in priority order, skipping matches another worker has claimed.
    // The claims carry this request's token, so a failed chunk can release exactly its own.
    let token_id = Uuid::new_v4();
    let token = token_id.to_string();
    let mut claimed: Vec<u64> = Vec::with_capacity(BATCH_SIZE);
    let mut scanned = 0usize;
    while claimed.len() < BATCH_SIZE && scanned < n {
        let chunk = BATCH_SIZE
            .saturating_sub(claimed.len())
            .min(n.saturating_sub(scanned));
        let Some(ids) = pool.get(scanned..scanned.saturating_add(chunk)) else {
            break;
        };

        let mut pipe = redis::pipe();
        for id in ids {
            pipe.cmd("SET")
                .arg(format!("{CLAIM_PREFIX}{id}"))
                .arg(&token)
                .arg("NX")
                .arg("EX")
                .arg(CLAIM_TTL_SECS);
        }
        let results: Vec<Option<String>> = match pipe.query_async(&mut conn).await {
            Ok(results) => results,
            Err(e) => {
                // Redis may have run some of the SETs before failing; claims nobody is handed
                // would hide those matches from every worker for `CLAIM_TTL_SECS`.
                release_claims(&mut conn, ids, &token).await;
                // The matches claimed so far are this worker's: hand them out.
                if claimed.is_empty() {
                    return Err(e.into());
                }
                warn!("Failed to claim more matches to fetch: {e}");
                break;
            }
        };

        for (id, res) in ids.iter().zip(results.iter()) {
            if res.is_some() {
                claimed.push(*id);
            }
        }
        scanned = scanned.saturating_add(chunk);
    }

    if claimed.is_empty() {
        return Ok(worklist(claimed));
    }
    // Without the list the claims can't be released early, but they still expire.
    if let Err(e) = store_claim_list(&mut conn, token_id, &claimed).await {
        warn!("Failed to store the claim list of matches to fetch: {e}");
    }
    let mut response = worklist(claimed);
    response
        .headers_mut()
        .insert(SET_COOKIE, claim_cookie(Some(token_id))?);
    Ok(response)
}

/// Releases the matches handed out with the request's [`CLAIM_COOKIE`], for a worker that
/// won't fetch the rest of its list. Matches it did fetch leave the pool on their own.
pub(super) async fn release_matches_to_fetch(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> APIResult<impl IntoResponse> {
    if let Some(token) = claim_token(&headers) {
        let mut conn = state.redis_client.clone();
        release_claim_list(&mut conn, token).await?;
    }
    Ok((StatusCode::NO_CONTENT, [(SET_COOKIE, claim_cookie(None)?)]))
}

/// Best effort: releases the claims of `ids` that hold `token`, leaving other workers' alone.
async fn release_claims(conn: &mut redis::aio::ConnectionManager, ids: &[u64], token: &str) {
    let mut pipe = redis::pipe();
    for id in ids {
        pipe.cmd("EVAL")
            .arg(RELEASE_IF_OWNED)
            .arg(1)
            .arg(format!("{CLAIM_PREFIX}{id}"))
            .arg(token)
            .ignore();
    }
    if let Err(e) = pipe.query_async::<()>(conn).await {
        warn!("Failed to release claims of matches to fetch: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claim_token_reads_the_claim_cookie() {
        let token = Uuid::new_v4();
        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&format!("other=1; {CLAIM_COOKIE}={token}; x=y")).unwrap(),
        );
        assert_eq!(claim_token(&headers), Some(token));
    }

    #[test]
    fn claim_token_ignores_missing_and_invalid_cookies() {
        let mut headers = HeaderMap::new();
        assert_eq!(claim_token(&headers), None);
        headers.insert(COOKIE, HeaderValue::from_static("to_fetch_claim=nope"));
        assert_eq!(claim_token(&headers), None);
        headers.insert(COOKIE, HeaderValue::from_static("to_fetch_claimx=1"));
        assert_eq!(claim_token(&headers), None);
    }

    #[test]
    fn claim_cookie_round_trips_and_clears() {
        let token = Uuid::new_v4();
        let set = claim_cookie(Some(token)).unwrap();
        let set = set.to_str().unwrap();
        assert!(set.starts_with(&format!(
            "{CLAIM_COOKIE}={token}; Path=/v1/matches/to-fetch;"
        )));
        assert!(set.contains("Max-Age=900"));
        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_str(set.split(';').next().unwrap()).unwrap(),
        );
        assert_eq!(claim_token(&headers), Some(token));

        let clear = claim_cookie(None).unwrap();
        assert!(
            clear
                .to_str()
                .unwrap()
                .starts_with(&format!("{CLAIM_COOKIE}=; "))
        );
        assert!(clear.to_str().unwrap().contains("Max-Age=0"));
    }

    #[tokio::test]
    #[ignore = "needs a throwaway Redis at TEST_REDIS_URL"]
    async fn release_claim_list_releases_only_own_claims() {
        let url = std::env::var("TEST_REDIS_URL").expect("TEST_REDIS_URL");
        let client = redis::Client::open(url).unwrap();
        let mut conn = client.get_connection_manager().await.unwrap();
        let (mine, theirs) = (Uuid::new_v4(), Uuid::new_v4());
        let ids = [1_u64, 2, 3].map(|i| u64::from(u32::MAX) + i);
        for id in ids {
            let _: () = redis::cmd("SET")
                .arg(format!("{CLAIM_PREFIX}{id}"))
                .arg(mine.to_string())
                .query_async(&mut conn)
                .await
                .unwrap();
        }
        store_claim_list(&mut conn, mine, &ids).await.unwrap();
        // The claim on the second match expired and another worker took it.
        let _: () = redis::cmd("SET")
            .arg(format!("{CLAIM_PREFIX}{}", ids[1]))
            .arg(theirs.to_string())
            .query_async(&mut conn)
            .await
            .unwrap();

        release_claim_list(&mut conn, mine).await.unwrap();

        let claims: Vec<Option<String>> = redis::cmd("MGET")
            .arg(ids.map(|id| format!("{CLAIM_PREFIX}{id}")).to_vec())
            .query_async(&mut conn)
            .await
            .unwrap();
        assert_eq!(claims, [None, Some(theirs.to_string()), None]);
        let list_exists: bool = redis::cmd("EXISTS")
            .arg(format!("{CLAIM_LIST_PREFIX}{mine}"))
            .query_async(&mut conn)
            .await
            .unwrap();
        assert!(!list_exists);
        // Releasing again is a no-op.
        release_claim_list(&mut conn, mine).await.unwrap();
    }
}
