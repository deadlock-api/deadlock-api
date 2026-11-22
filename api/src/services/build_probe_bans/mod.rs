//! Bans clients that crawl the Deadlock Game Coordinator through the live build endpoints.
//!
//! A live lookup the database can't answer borrows a Steam bot for its whole soft cooldown. A
//! single-build lookup that finds a build neither there nor in the database is a *miss*: a
//! `(hero, build)` the database never saw (sequential or random id guesses, or a real id under
//! the wrong hero), with or without `force_refetch`. Refetching a build the database has is not a
//! miss, even when the Game Coordinator no longer returns it. A lookup answered from a
//! remembered miss (see [`crate::services::build_misses`]) of a build nobody knows counts too. Empty author lookups don't count:
//! most are real players without builds (profile pages), which look the same as guesses.
//!
//! A client (API key, else Cloudflare Worker, else IP) with [`THRESHOLD`] distinct misses
//! within [`WINDOW`] is banned from Game Coordinator lookups for [`BAN`]: every lookup gets a
//! 403 with `Retry-After`, on the by-author endpoint too. Builds the database has are still
//! served. Backtested on 14 days of request logs (2026-11-08..22): this banned exactly the five
//! clients guessing build ids and none of the clients refreshing known builds.
//!
//! State lives in Redis, shared by the replicas: the misses of a client are a sorted set
//! `build-probe:v1:misses:<client>` and a ban is the key `build-probe:v1:ban:<client>` with a
//! TTL. Lift a ban early with `DEL build-probe:v1:ban:<client>`. When Redis is unreachable
//! nobody is banned.

use core::time::Duration;
use std::sync::LazyLock;
use std::time::SystemTime;

use axum::http::StatusCode;
use axum::http::header::RETRY_AFTER;
use axum::response::{IntoResponse as _, Response};
use redis::aio::ConnectionManager;
use redis::{RedisError, Script};
use serde_json::json;
use tracing::{info, warn};

use crate::error::{APIError, retry_after_secs};

/// How far back misses count.
pub(crate) const WINDOW: Duration = Duration::from_hours(1);

/// Distinct misses within [`WINDOW`] that ban a client.
pub(crate) const THRESHOLD: u32 = 10;

/// How long a ban lasts.
pub(crate) const BAN: Duration = Duration::from_hours(24);

/// Namespaces the keys by their format; bump it when `record_miss.lua` changes it.
const KEY_PREFIX: &str = "build-probe:v1:";

/// Hashed once; invoking it sends the hash and only falls back to the source after a restart.
static SCRIPT: LazyLock<Script> = LazyLock::new(|| Script::new(include_str!("record_miss.lua")));

/// The miss's member in the client's sorted set; each build counts once.
fn member(hero_id: u32, build_id: u32) -> String {
    format!("{hero_id}/{build_id}")
}

fn ban_key(client: &str) -> String {
    format!("{KEY_PREFIX}ban:{client}")
}

fn misses_key(client: &str) -> String {
    format!("{KEY_PREFIX}misses:{client}")
}

fn millis(duration: Duration) -> i64 {
    i64::try_from(duration.as_millis()).unwrap_or(i64::MAX)
}

/// The rest of `client`'s ban, if it is banned.
pub(crate) async fn ban_remaining(redis: &ConnectionManager, client: &str) -> Option<Duration> {
    let ttl_ms: Result<i64, RedisError> = redis::cmd("PTTL")
        .arg(ban_key(client))
        .query_async(&mut redis.clone())
        .await;
    match ttl_ms {
        // -2: no ban; -1 can't happen (bans are only set with a TTL).
        Ok(ms) => u64::try_from(ms)
            .ok()
            .filter(|&ms| ms > 0)
            .map(Duration::from_millis),
        Err(e) => {
            warn!("Failed to check the build probe ban of {client}, letting it pass: {e}");
            None
        }
    }
}

/// Records that `client` asked for a build nobody knows, and bans it once it has [`THRESHOLD`]
/// distinct ones in [`WINDOW`].
pub(crate) async fn record_miss(
    redis: &ConnectionManager,
    client: &str,
    hero_id: u32,
    build_id: u32,
) {
    metrics::counter!("api_build_probe_misses").increment(1);
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let reply: Result<Vec<i64>, RedisError> = SCRIPT
        .key(misses_key(client))
        .key(ban_key(client))
        .arg(millis(now))
        .arg(millis(WINDOW))
        .arg(THRESHOLD)
        .arg(millis(BAN))
        .arg(member(hero_id, build_id))
        .invoke_async(&mut redis.clone())
        .await;
    match reply.as_deref() {
        Ok(&[misses, banned]) => {
            if banned == 1 {
                metrics::counter!("api_build_probe_bans").increment(1);
                info!(
                    "Banning {client} from Game Coordinator build lookups for {}h: {misses} \
                     distinct misses within {} min, the last build {hero_id}/{build_id}",
                    BAN.as_secs() / 3600,
                    WINDOW.as_secs() / 60,
                );
            }
        }
        Ok(other) => warn!("Build probe script returned an unexpected reply: {other:?}"),
        Err(e) => warn!("Failed to record a build probe miss of {client}: {e}"),
    }
}

/// The answer to a Game Coordinator lookup of a banned client.
pub(crate) fn banned_response(remaining: Duration) -> Response {
    metrics::counter!("api_build_probe_refused").increment(1);
    let retry_after = retry_after_secs(remaining);
    let message = format!(
        "This client is banned from Game Coordinator build lookups because it asked for {THRESHOLD} \
         or more builds that don't exist within {} minutes, which looks like crawling. \
         Build ids can't be guessed: search the builds we have with /v1/builds (e.g. \
         /v1/builds?hero_id=1 or /v1/builds?build_id=123), which this ban does not affect. Builds \
         already in our database are still served here. The ban lifts after Retry-After seconds.",
        WINDOW.as_secs() / 60,
    );
    let body = APIError::StatusMsgJson {
        status: StatusCode::FORBIDDEN,
        message: json!({
            "type": "build_probe_ban",
            "message": message,
            "banned_for": retry_after,
        }),
    };
    ([(RETRY_AFTER, retry_after)], body).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn members_tell_builds_apart() {
        assert_eq!(member(2, 4), "2/4");
        assert_ne!(member(1, 2), member(2, 1));
    }

    #[test]
    fn keys_are_per_client() {
        assert_eq!(ban_key("1.2.3.4"), "build-probe:v1:ban:1.2.3.4");
        assert_eq!(
            misses_key("worker:example.com"),
            "build-probe:v1:misses:worker:example.com"
        );
    }

    #[test]
    fn banned_response_is_403_with_retry_after() {
        let response = banned_response(Duration::from_millis(3_600_500));
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(response.headers()[RETRY_AFTER], "3601");
    }
}
