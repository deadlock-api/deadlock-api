use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::header::{CACHE_CONTROL, COOKIE, SET_COOKIE};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use db_clients::RELEASE_IF_OWNED;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use tracing::{debug, warn};
use uuid::Uuid;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::ch_cost::TrackedQuery as _;
use crate::services::pending_matches::{MIN_AGE_SECS, MIN_MATCH_ID, abandon_requested_matches};
use crate::utils::request::header_str;
use crate::utils::sql::id_list;

const BATCH_SIZE: usize = 50;
/// Covers a Mod Manager pass: up to 32 salt fetches 2 minutes apart. Workers release their
/// list when done with it, so a long claim only delays the matches of a worker that died.
const CLAIM_TTL_SECS: u64 = 75 * 60;
const POOL_LIMIT: usize = 200_000;
/// Pool entries the claim script walks per call.
const CLAIM_SCAN_CHUNK: usize = 1_000;
const CLAIM_PREFIX: &str = "matches_to_fetch:claimed:";
/// How often a match was handed out while still pending, keyed by match id. A successful
/// fetch takes it out of the pool within a minute, so a match handed out this often is one
/// the workers can't fetch.
const HANDOUT_PREFIX: &str = "matches_to_fetch:handouts:";
const MAX_HANDOUTS: u32 = 5;
/// A match that used up its handouts rests this long after its last one, then gets
/// [`MAX_HANDOUTS`] more. Requested matches don't come back: they are marked done instead.
const HANDOUT_TTL_SECS: u64 = 6 * 60 * 60;
/// Walks `KEYS` as (claim key, handout key) pairs, claiming each match for the token `ARGV[1]`
/// for `ARGV[2]` seconds unless another worker holds it or it was handed out `ARGV[3]` times
/// already, until `ARGV[5]` are claimed. Counts every claim as a handout, kept for `ARGV[4]`
/// seconds after the last. Returns (1-based pair index, handouts) per claimed match, flattened.
const CLAIM_SCRIPT: &str = "
local token, ttl, max_handouts, handout_ttl = ARGV[1], ARGV[2], tonumber(ARGV[3]), ARGV[4]
local needed = tonumber(ARGV[5])
local claimed = {}
for i = 1, #KEYS - 1, 2 do
    if needed <= 0 then break end
    if tonumber(redis.call('get', KEYS[i + 1]) or '0') < max_handouts
        and redis.call('set', KEYS[i], token, 'NX', 'EX', ttl) then
        local handouts = redis.call('incr', KEYS[i + 1])
        redis.call('expire', KEYS[i + 1], handout_ttl)
        claimed[#claimed + 1] = (i + 1) / 2
        claimed[#claimed + 1] = handouts
        needed = needed - 1
    end
end
return claimed";
/// Decrements each handout counter in `KEYS`, deleting it once nothing is left: the handouts
/// of matches a worker gave back without Steam refusing them.
const REFUND_SCRIPT: &str = "
for i = 1, #KEYS do
    if redis.call('decr', KEYS[i]) <= 0 then
        redis.call('del', KEYS[i])
    end
end
return 0";
/// Set of the match ids one to-fetch response claimed, keyed by its claim token.
const CLAIM_LIST_PREFIX: &str = "matches_to_fetch:claim_list:";
/// The requested ones among them, kept apart so the set above keeps its shape.
const CLAIM_REQUESTED_PREFIX: &str = "matches_to_fetch:claim_list_requested:";
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

/// The matches one to-fetch response claimed, as released.
#[derive(Debug, Default)]
struct ClaimList {
    ids: Vec<u64>,
    /// The ones that were requested from the API rather than proven public matches.
    requested: HashSet<u64>,
    /// The ones whose claim this list still held: claims that expired meanwhile may belong
    /// to other workers now.
    released: HashSet<u64>,
}

/// Releases the claims of the list handed out with `token`, leaving matches other workers
/// have claimed since alone.
async fn release_claim_list(
    conn: &mut redis::aio::ConnectionManager,
    token: Uuid,
) -> redis::RedisResult<ClaimList> {
    let list_key = format!("{CLAIM_LIST_PREFIX}{token}");
    let requested_key = format!("{CLAIM_REQUESTED_PREFIX}{token}");
    let (ids, requested): (Vec<u64>, Vec<u64>) = redis::pipe()
        .atomic()
        .smembers(&list_key)
        .smembers(&requested_key)
        .del(&[&list_key, &requested_key])
        .ignore()
        .query_async(conn)
        .await?;
    let released = if ids.is_empty() {
        HashSet::new()
    } else {
        release_claims(conn, &ids, &token.to_string()).await
    };
    Ok(ClaimList {
        ids,
        requested: requested.into_iter().collect(),
        released,
    })
}

/// Remembers which matches `token` claimed, and which of them are requested ones, so
/// [`release_claim_list`] can release them.
async fn store_claim_list(
    conn: &mut redis::aio::ConnectionManager,
    token: Uuid,
    ids: &[u64],
    requested: &[u64],
) -> redis::RedisResult<()> {
    let ttl = i64::try_from(CLAIM_TTL_SECS).unwrap_or(i64::MAX);
    let list_key = format!("{CLAIM_LIST_PREFIX}{token}");
    let mut pipe = redis::pipe();
    pipe.sadd(&list_key, ids)
        .ignore()
        .expire(&list_key, ttl)
        .ignore();
    if !requested.is_empty() {
        let requested_key = format!("{CLAIM_REQUESTED_PREFIX}{token}");
        pipe.sadd(&requested_key, requested)
            .ignore()
            .expire(&requested_key, ttl)
            .ignore();
    }
    pipe.query_async(conn).await
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

#[derive(Debug, Clone, Row, Deserialize)]
struct PoolEntry {
    match_id: u64,
    /// Only known because the API was asked for it; nothing proves it is a public match.
    requested: bool,
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
) -> clickhouse::error::Result<Arc<Vec<PoolEntry>>> {
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
         SELECT match_id, match_mode = 'Invalid' AS requested FROM (
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
    let entries: Vec<PoolEntry> = ch_client.query(&query).fetch_all_tracked().await?;
    Ok(Arc::new(entries))
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
    let ids: Vec<u64> = ch_client.query(&query).fetch_all_tracked().await?;
    Ok(Arc::new(ids))
}

#[derive(Deserialize)]
pub(super) struct ToFetchQuery {
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "steam_id::de::account_id_option")]
    account_id: Option<u32>,
    /// How many matches to hand out, at most [`BATCH_SIZE`]. A worker should ask for no more
    /// than it fetches before the claims expire, so it doesn't hold matches others could fetch.
    limit: Option<usize>,
}

/// Claims up to `needed` of `entries` for `token` in one script call, skipping matches another
/// worker holds or that used up their handouts. Returns each claimed entry with its handout
/// count, in pool order.
async fn claim_chunk<'a>(
    conn: &mut redis::aio::ConnectionManager,
    entries: &'a [PoolEntry],
    token: &str,
    needed: usize,
) -> redis::RedisResult<Vec<(&'a PoolEntry, u32)>> {
    let mut cmd = redis::cmd("EVAL");
    cmd.arg(CLAIM_SCRIPT).arg(entries.len().saturating_mul(2));
    for entry in entries {
        cmd.arg(format!("{CLAIM_PREFIX}{}", entry.match_id))
            .arg(format!("{HANDOUT_PREFIX}{}", entry.match_id));
    }
    cmd.arg(token)
        .arg(CLAIM_TTL_SECS)
        .arg(MAX_HANDOUTS)
        .arg(HANDOUT_TTL_SECS)
        .arg(needed);
    let flat: Vec<i64> = cmd.query_async(conn).await?;
    Ok(flat
        .as_chunks::<2>()
        .0
        .iter()
        .filter_map(|&[index, handouts]| {
            let entry = entries.get(usize::try_from(index).ok()?.checked_sub(1)?)?;
            Some((entry, u32::try_from(handouts).unwrap_or(u32::MAX)))
        })
        .collect())
}

/// Hands out the next matches to fetch and claims them for [`CLAIM_TTL_SECS`], so other
/// workers skip them. The response's [`CLAIM_COOKIE`] identifies the claimed list: sending it
/// with the next to-fetch request, or to [`release_matches_to_fetch`], releases that list.
///
/// A match handed out [`MAX_HANDOUTS`] times is one the workers can't fetch, such as a private
/// or bot lobby Steam won't show them, and they don't report refusals. It is left out for
/// [`HANDOUT_TTL_SECS`], and a requested one, which nothing proves is a public match, is
/// marked done.
pub(super) async fn matches_to_fetch(
    Query(ToFetchQuery { account_id, limit }): Query<ToFetchQuery>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> APIResult<impl IntoResponse> {
    debug!(?account_id, ?limit, "matches_to_fetch request");
    let limit = limit.unwrap_or(BATCH_SIZE).clamp(1, BATCH_SIZE);

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
        return Ok(worklist(ids.iter().take(limit).collect::<Vec<_>>()));
    }

    let prioritized = prioritized_account_ids(&state.pg_client).await;
    let pool = pending_pool(&state.ch_client_ro, prioritized.as_slice()).await?;

    // Walk the pool in priority order, skipping matches another worker has claimed.
    // The claims carry this request's token, so a failed chunk can release exactly its own.
    let token_id = Uuid::new_v4();
    let token = token_id.to_string();
    let mut claimed: Vec<u64> = Vec::with_capacity(limit);
    let mut claimed_requested: Vec<u64> = Vec::new();
    let mut abandoned: Vec<u64> = Vec::new();
    for entries in pool.chunks(CLAIM_SCAN_CHUNK) {
        let needed = limit.saturating_sub(claimed.len());
        if needed == 0 {
            break;
        }
        match claim_chunk(&mut conn, entries, &token, needed).await {
            Ok(chunk_claims) => {
                for (entry, handouts) in chunk_claims {
                    claimed.push(entry.match_id);
                    if entry.requested {
                        claimed_requested.push(entry.match_id);
                    }
                    // This is its last handout: the worker it goes to still tries it.
                    if entry.requested && handouts >= MAX_HANDOUTS {
                        abandoned.push(entry.match_id);
                    }
                }
            }
            Err(e) => {
                // A script error doesn't undo the claims it made before; claims nobody is
                // handed would hide those matches from every worker for `CLAIM_TTL_SECS`.
                let ids: Vec<u64> = entries.iter().map(|e| e.match_id).collect();
                let _released = release_claims(&mut conn, &ids, &token).await;
                // The matches claimed so far are this worker's: hand them out.
                if claimed.is_empty() {
                    return Err(e.into());
                }
                warn!("Failed to claim more matches to fetch: {e}");
                break;
            }
        }
    }
    if !abandoned.is_empty() {
        debug!(?abandoned, "giving up on requested matches");
        abandon_requested_matches(&state, &abandoned);
    }

    if claimed.is_empty() {
        return Ok(worklist(claimed));
    }
    // Without the list the claims can't be released early, but they still expire.
    if let Err(e) = store_claim_list(&mut conn, token_id, &claimed, &claimed_requested).await {
        warn!("Failed to store the claim list of matches to fetch: {e}");
    }
    let mut response = worklist(claimed);
    response
        .headers_mut()
        .insert(SET_COOKIE, claim_cookie(Some(token_id))?);
    Ok(response)
}

/// How a worker's attempt at a match it was handed ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum AttemptResult {
    /// Steam answered with the salts, and the worker uploaded them.
    Fetched,
    /// Steam doesn't know the match.
    Invalid,
    /// Steam won't show the match to the worker's account, e.g. a private or bot lobby.
    NoPermission,
    /// Steam says the match is still being played or processed.
    InFlight,
    /// No answer about the match: a timeout, a rate limit, a lost connection. Also what a
    /// result this API doesn't know yet reads as.
    #[serde(other)]
    Failed,
}

impl AttemptResult {
    /// Whether Steam turned the match down, so the handout counts against it.
    const fn is_refusal(self) -> bool {
        matches!(self, Self::Invalid | Self::NoPermission)
    }

    const fn label(result: Option<Self>) -> &'static str {
        match result {
            None => "untried",
            Some(Self::Fetched) => "fetched",
            Some(Self::Invalid) => "invalid",
            Some(Self::NoPermission) => "no_permission",
            Some(Self::InFlight) => "in_flight",
            Some(Self::Failed) => "failed",
        }
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct Attempt {
    match_id: u64,
    result: AttemptResult,
}

/// What a worker did with the list it releases. A match of the list that isn't in `attempts`
/// was not tried.
#[derive(Debug, Default, Deserialize)]
pub(super) struct ReleaseReport {
    #[serde(default)]
    attempts: Vec<Attempt>,
}

/// What a report means for each match of the released list: the handouts to give back, and
/// the requested matches to give up on.
#[derive(Debug, Default, PartialEq, Eq)]
struct ReportOutcome {
    refunds: Vec<u64>,
    abandoned: Vec<u64>,
}

/// Only a refusal from Steam counts as a handout: a match the worker didn't try, fetched, or
/// got no answer for gets its handout back. Steam not knowing a requested match is enough to
/// give up on it. A proven match isn't given up on a worker's word, only rested once its
/// refusals use up its handouts. Reports about matches outside the list are ignored.
fn report_outcome(list: &ClaimList, report: &ReleaseReport) -> ReportOutcome {
    let results: HashMap<u64, AttemptResult> = report
        .attempts
        .iter()
        .map(|a| (a.match_id, a.result))
        .collect();
    let mut outcome = ReportOutcome::default();
    for &id in &list.ids {
        let result = results.get(&id).copied();
        metrics::counter!("matches_to_fetch_attempts", "result" => AttemptResult::label(result))
            .increment(1);
        match result {
            Some(AttemptResult::Invalid) if list.requested.contains(&id) => {
                outcome.abandoned.push(id);
            }
            Some(r) if r.is_refusal() => {}
            _ if list.released.contains(&id) => outcome.refunds.push(id),
            _ => {}
        }
    }
    outcome
}

/// Best effort: gives back one handout of each of `ids`.
async fn refund_handouts(conn: &mut redis::aio::ConnectionManager, ids: &[u64]) {
    if ids.is_empty() {
        return;
    }
    let mut cmd = redis::cmd("EVAL");
    cmd.arg(REFUND_SCRIPT).arg(ids.len());
    for id in ids {
        cmd.arg(format!("{HANDOUT_PREFIX}{id}"));
    }
    if let Err(e) = cmd.query_async::<()>(conn).await {
        warn!("Failed to refund handouts of matches to fetch: {e}");
    }
}

/// Releases the matches handed out with the request's [`CLAIM_COOKIE`], for a worker that
/// won't fetch the rest of its list. Matches it did fetch leave the pool on their own.
///
/// The worker can report how its attempts ended in a JSON [`ReleaseReport`] body. Without one,
/// every match of the list keeps its handout; with one, only Steam's refusals do (see
/// [`report_outcome`]).
pub(super) async fn release_matches_to_fetch(
    State(state): State<AppState>,
    headers: HeaderMap,
    report: Option<Json<ReleaseReport>>,
) -> APIResult<impl IntoResponse> {
    if let Some(token) = claim_token(&headers) {
        let mut conn = state.redis_client.clone();
        let list = release_claim_list(&mut conn, token).await?;
        if let Some(Json(report)) = report {
            let ReportOutcome { refunds, abandoned } = report_outcome(&list, &report);
            refund_handouts(&mut conn, &refunds).await;
            if !abandoned.is_empty() {
                debug!(
                    ?abandoned,
                    "giving up on requested matches Steam doesn't know"
                );
                abandon_requested_matches(&state, &abandoned);
            }
        }
    }
    Ok((StatusCode::NO_CONTENT, [(SET_COOKIE, claim_cookie(None)?)]))
}

/// Best effort: releases the claims of `ids` that hold `token`, leaving other workers' alone.
/// Returns the ids whose claim it released.
async fn release_claims(
    conn: &mut redis::aio::ConnectionManager,
    ids: &[u64],
    token: &str,
) -> HashSet<u64> {
    let mut pipe = redis::pipe();
    for id in ids {
        pipe.cmd("EVAL")
            .arg(RELEASE_IF_OWNED)
            .arg(1)
            .arg(format!("{CLAIM_PREFIX}{id}"))
            .arg(token);
    }
    match pipe.query_async::<Vec<i64>>(conn).await {
        Ok(released) => ids
            .iter()
            .zip(released)
            .filter_map(|(&id, deleted)| (deleted > 0).then_some(id))
            .collect(),
        Err(e) => {
            warn!("Failed to release claims of matches to fetch: {e}");
            HashSet::new()
        }
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
        assert!(set.contains("Max-Age=4500"));
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
    async fn claim_chunk_skips_claimed_and_exhausted_matches() {
        let url = std::env::var("TEST_REDIS_URL").expect("TEST_REDIS_URL");
        let client = redis::Client::open(url).unwrap();
        let mut conn = client.get_connection_manager().await.unwrap();
        let base = u64::from(u32::MAX) + 1_000 + u64::from(rand_suffix());
        let entries: Vec<PoolEntry> = (0..4)
            .map(|i| PoolEntry {
                match_id: base + i,
                requested: i % 2 == 0,
            })
            .collect();
        let ids = |claims: &[(&PoolEntry, u32)]| -> Vec<u64> {
            claims.iter().map(|(e, _)| e.match_id).collect()
        };
        // Another worker holds the first match; the second used up its handouts.
        let _: () = redis::cmd("SET")
            .arg(format!("{CLAIM_PREFIX}{base}"))
            .arg("theirs")
            .query_async(&mut conn)
            .await
            .unwrap();
        let _: () = redis::cmd("SET")
            .arg(format!("{HANDOUT_PREFIX}{}", base + 1))
            .arg(MAX_HANDOUTS)
            .query_async(&mut conn)
            .await
            .unwrap();

        // Stops once `needed` are claimed.
        let first = claim_chunk(&mut conn, &entries, "a", 1).await.unwrap();
        assert_eq!(ids(&first), [base + 2]);
        assert_eq!(first[0].1, 1);
        let rest = claim_chunk(&mut conn, &entries, "b", 10).await.unwrap();
        assert_eq!(ids(&rest), [base + 3]);

        // Released claims are handed out again, each time counted, until the handouts run out.
        for handouts in 2..=MAX_HANDOUTS {
            release_claims(&mut conn, &[base + 2], "a").await;
            let again = claim_chunk(&mut conn, &entries, "a", 10).await.unwrap();
            assert_eq!(ids(&again), [base + 2]);
            assert_eq!(again[0].1, handouts);
        }
        release_claims(&mut conn, &[base + 2], "a").await;
        assert!(
            claim_chunk(&mut conn, &entries, "a", 10)
                .await
                .unwrap()
                .is_empty()
        );
        let ttl: i64 = redis::cmd("TTL")
            .arg(format!("{HANDOUT_PREFIX}{}", base + 2))
            .query_async(&mut conn)
            .await
            .unwrap();
        assert!(ttl > 0 && ttl <= i64::try_from(HANDOUT_TTL_SECS).unwrap());
    }

    fn rand_suffix() -> u32 {
        u32::try_from(Uuid::new_v4().as_u128() % 100_000).unwrap() * 10
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
        store_claim_list(&mut conn, mine, &ids, &ids[..1])
            .await
            .unwrap();
        // The claim on the second match expired and another worker took it.
        let _: () = redis::cmd("SET")
            .arg(format!("{CLAIM_PREFIX}{}", ids[1]))
            .arg(theirs.to_string())
            .query_async(&mut conn)
            .await
            .unwrap();

        let list = release_claim_list(&mut conn, mine).await.unwrap();
        assert_eq!(list.ids.len(), 3);
        assert_eq!(list.requested, HashSet::from([ids[0]]));
        assert_eq!(list.released, HashSet::from([ids[0], ids[2]]));

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
        let again = release_claim_list(&mut conn, mine).await.unwrap();
        assert_eq!(again.ids, Vec::<u64>::new());
    }

    #[tokio::test]
    #[ignore = "needs a throwaway Redis at TEST_REDIS_URL"]
    async fn refund_handouts_gives_back_one_and_deletes_spent_counters() {
        let url = std::env::var("TEST_REDIS_URL").expect("TEST_REDIS_URL");
        let client = redis::Client::open(url).unwrap();
        let mut conn = client.get_connection_manager().await.unwrap();
        let base = u64::from(u32::MAX) + 2_000_000 + u64::from(rand_suffix());
        let key = |id: u64| format!("{HANDOUT_PREFIX}{id}");
        let _: () = redis::cmd("SET")
            .arg(key(base))
            .arg(3)
            .arg("EX")
            .arg(100)
            .query_async(&mut conn)
            .await
            .unwrap();
        let _: () = redis::cmd("SET")
            .arg(key(base + 1))
            .arg(1)
            .query_async(&mut conn)
            .await
            .unwrap();

        refund_handouts(&mut conn, &[base, base + 1, base + 2]).await;

        let counts: Vec<Option<u32>> = redis::cmd("MGET")
            .arg([key(base), key(base + 1), key(base + 2)].to_vec())
            .query_async(&mut conn)
            .await
            .unwrap();
        assert_eq!(counts, [Some(2), None, None]);
        let ttl: i64 = redis::cmd("TTL")
            .arg(key(base))
            .query_async(&mut conn)
            .await
            .unwrap();
        assert!(ttl > 0, "a refund keeps the counter's expiry");
    }

    fn report(attempts: &[(u64, AttemptResult)]) -> ReleaseReport {
        ReleaseReport {
            attempts: attempts
                .iter()
                .map(|&(match_id, result)| Attempt { match_id, result })
                .collect(),
        }
    }

    #[test]
    fn only_refusals_keep_their_handout() {
        let list = ClaimList {
            ids: vec![1, 2, 3, 4, 5, 6, 7],
            requested: HashSet::from([2, 3]),
            released: HashSet::from([1, 2, 3, 4, 5, 6]),
        };
        let outcome = report_outcome(
            &list,
            &report(&[
                (1, AttemptResult::Fetched),
                // Steam doesn't know a requested match: given up on.
                (2, AttemptResult::Invalid),
                // Refused: the handouts stay, the match isn't given up on.
                (3, AttemptResult::NoPermission),
                (4, AttemptResult::Invalid),
                (5, AttemptResult::InFlight),
                // 6 wasn't tried. 7's claim expired, so its handout may be another worker's.
                (7, AttemptResult::Failed),
                // Not on the list.
                (99, AttemptResult::Invalid),
            ]),
        );
        assert_eq!(
            outcome,
            ReportOutcome {
                refunds: vec![1, 5, 6],
                abandoned: vec![2],
            }
        );
    }

    #[test]
    fn unknown_attempt_results_read_as_failed() {
        let report: ReleaseReport = serde_json::from_str(
            r#"{"attempts": [
                {"match_id": 1, "result": "no_permission"},
                {"match_id": 2, "result": "in_flight"},
                {"match_id": 3, "result": "something_new"}
            ]}"#,
        )
        .unwrap();
        let results: Vec<AttemptResult> = report.attempts.iter().map(|a| a.result).collect();
        assert_eq!(
            results,
            [
                AttemptResult::NoPermission,
                AttemptResult::InFlight,
                AttemptResult::Failed
            ]
        );
        let empty: ReleaseReport = serde_json::from_str("{}").unwrap();
        assert_eq!(empty.attempts.len(), 0);
    }
}
