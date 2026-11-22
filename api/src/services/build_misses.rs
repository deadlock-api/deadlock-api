//! Remembers Game Coordinator build lookups that found nothing, shared by the replicas, so
//! clients polling deleted or nonexistent builds don't borrow a Steam bot every time.
//!
//! A miss on a build the database has (deleted or hidden in the game) is remembered for
//! [`KNOWN_TTL`]: such builds rarely come back, and clients refreshing them polled every 5 minutes
//! to 2 hours. A miss on a build nobody knows is remembered for only [`UNKNOWN_TTL`], since a build
//! published just now could be looked up before the Game Coordinator has it everywhere. On 14
//! days of request logs (2026-11-08..22) this answers 82% of the build lookups that found nothing
//! without asking the Game Coordinator; the busiest poller drops from 54k lookups to ~850.
//!
//! Each miss is the Redis key `build-miss:v1:<hero>/<build>` with a TTL; delete it to make the
//! next lookup ask the Game Coordinator again. When Redis is unreachable every lookup asks.

use core::time::Duration;

use redis::AsyncCommands as _;
use redis::aio::ConnectionManager;
use tracing::warn;

/// How long a miss on a build the database has is remembered.
pub(crate) const KNOWN_TTL: Duration = Duration::from_hours(6);

/// How long a miss on a build the database doesn't have is remembered.
pub(crate) const UNKNOWN_TTL: Duration = Duration::from_mins(10);

/// Namespaces the keys by their format; bump it when the stored value changes.
const KEY_PREFIX: &str = "build-miss:v1:";

/// A remembered lookup that found nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Miss {
    /// The database has the build: the game dropped it.
    Known,
    /// Nobody knows the build.
    Unknown,
}

impl Miss {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Known => "known",
            Self::Unknown => "unknown",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "known" => Some(Self::Known),
            "unknown" => Some(Self::Unknown),
            _ => None,
        }
    }

    const fn ttl(self) -> Duration {
        match self {
            Self::Known => KNOWN_TTL,
            Self::Unknown => UNKNOWN_TTL,
        }
    }
}

fn key(hero_id: u32, build_id: u32) -> String {
    format!("{KEY_PREFIX}{hero_id}/{build_id}")
}

/// The remembered miss of a build, if a lookup found nothing recently.
pub(crate) async fn get(redis: &ConnectionManager, hero_id: u32, build_id: u32) -> Option<Miss> {
    let value: Result<Option<String>, _> = redis.clone().get(key(hero_id, build_id)).await;
    match value {
        Ok(value) => {
            let miss = value.as_deref().and_then(Miss::parse)?;
            metrics::counter!("api_build_miss_cache_hits", "miss" => miss.as_str()).increment(1);
            Some(miss)
        }
        Err(e) => {
            warn!("Failed to read the remembered miss of build {hero_id}/{build_id}: {e}");
            None
        }
    }
}

/// Remembers that a lookup of a build found nothing.
pub(crate) async fn remember(redis: &ConnectionManager, hero_id: u32, build_id: u32, miss: Miss) {
    let ttl_ms = u64::try_from(miss.ttl().as_millis()).unwrap_or(u64::MAX);
    let result: Result<(), _> = redis
        .clone()
        .pset_ex(key(hero_id, build_id), miss.as_str(), ttl_ms)
        .await;
    if let Err(e) = result {
        warn!("Failed to remember the miss of build {hero_id}/{build_id}: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn misses_round_trip() {
        for miss in [Miss::Known, Miss::Unknown] {
            assert_eq!(Miss::parse(miss.as_str()), Some(miss));
        }
        assert_eq!(Miss::parse("garbage"), None);
    }

    #[test]
    fn known_builds_are_remembered_longer() {
        assert!(Miss::Known.ttl() > Miss::Unknown.ttl());
        assert_eq!(key(2, 4), "build-miss:v1:2/4");
    }
}
