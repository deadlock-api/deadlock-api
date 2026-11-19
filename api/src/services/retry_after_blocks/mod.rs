//! Blocks clients that keep retrying before their `Retry-After`, until they show they honor it.
//!
//! Blocks are rows of the Postgres `retry_after_blocks` table, by API key or by network. Every
//! replica re-reads the active ones every [`REFRESH_INTERVAL`], so requests of clients that are
//! not blocked never leave the process. A blocked client's progress lives in Redis, shared by the
//! replicas: each of its requests gets a 429 with `Retry-After`, and once it sent
//! `required_rounds` requests in a row that waited for it (see `check.lua`), the block lifts
//! itself and its row gets `released_at`.
//!
//! When Postgres is unreachable the last snapshot stays in effect; when Redis is, blocked clients
//! pass.

use core::net::IpAddr;
use core::time::Duration;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};
use std::time::SystemTime;

use arc_swap::ArcSwap;
use ipnet::IpNet;
use redis::aio::ConnectionManager;
use redis::{RedisError, Script};
use sqlx::{Pool, Postgres};
use strum::IntoStaticStr;
use tokio::time::MissedTickBehavior;
use tracing::{info, warn};
use uuid::Uuid;

const REFRESH_INTERVAL: Duration = Duration::from_secs(15);

/// How early a request may come and still count as having waited, for clients that time their
/// wait from sending the request rather than from receiving the response.
const EARLY_TOLERANCE: Duration = Duration::from_secs(1);

/// How long after the request that opened a round its parallel requests may follow.
const ROUND_GRACE: Duration = Duration::from_secs(2);

/// Keeps a block's progress this long after the client's last request. A client that comes back
/// later starts its rounds over.
const STATE_TTL: Duration = Duration::from_hours(30 * 24);

/// Namespaces the state hashes by their format; bump it when `check.lua` changes it.
const KEY_PREFIX: &str = "retry-after-block:v1:";

/// Hashed once; invoking it sends the hash and only falls back to the source after a restart.
static SCRIPT: LazyLock<Script> = LazyLock::new(|| Script::new(include_str!("check.lua")));

/// An active block.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Block {
    pub(crate) id: i64,
    /// The `Retry-After` every refused request is sent.
    pub(crate) wait: Duration,
    /// How many requests in a row must wait before the block lifts.
    pub(crate) required_rounds: u32,
    /// The API key or network, for logs.
    subject: String,
}

/// What happened to a blocked client's request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, IntoStaticStr)]
#[strum(serialize_all = "snake_case")]
pub(crate) enum Outcome {
    /// The client's first request since it was blocked.
    First,
    /// The request waited for its `Retry-After` and counts a round.
    Waited,
    /// Sent with the request that opened the round, by a parallel worker.
    Parallel,
    /// Sent before its `Retry-After`: the rounds start over.
    Early,
    /// The request completed the rounds and lifted the block.
    Lifted,
    /// The block was lifted by an earlier request.
    Released,
}

impl Outcome {
    pub(crate) fn as_str(self) -> &'static str {
        self.into()
    }

    const fn from_code(code: i64) -> Option<Self> {
        Some(match code {
            0 => Self::First,
            1 => Self::Waited,
            2 => Self::Parallel,
            3 => Self::Early,
            4 => Self::Lifted,
            5 => Self::Released,
            _ => return None,
        })
    }

    /// Whether the request is answered normally.
    pub(crate) const fn passes(self) -> bool {
        matches!(self, Self::Lifted | Self::Released)
    }
}

/// The verdict on one request of a blocked client.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Verdict {
    pub(crate) outcome: Outcome,
    /// Until the client may send its next request.
    pub(crate) retry_after: Duration,
    /// Requests in a row that waited so far.
    pub(crate) rounds: u32,
}

/// The active blocks, indexed for the per-request lookup.
#[derive(Debug, Default)]
struct Snapshot {
    by_key: HashMap<Uuid, Block>,
    /// Few entries, so a scan beats a prefix trie.
    by_network: Vec<(IpNet, Block)>,
}

impl Snapshot {
    fn ids(&self) -> impl Iterator<Item = (i64, &str)> {
        self.by_key
            .values()
            .chain(self.by_network.iter().map(|(_, block)| block))
            .map(|block| (block.id, block.subject.as_str()))
    }

    /// The block of a request with `api_key` from `ip`: its key's, else its network's.
    fn find(&self, api_key: Option<Uuid>, ip: Option<IpAddr>) -> Option<&Block> {
        api_key.and_then(|key| self.by_key.get(&key)).or_else(|| {
            let ip = ip?;
            self.by_network
                .iter()
                .find(|(network, _)| network.contains(&ip))
                .map(|(_, block)| block)
        })
    }
}

type Row = (i64, Option<Uuid>, Option<String>, i32, i32);

fn snapshot_from_rows(rows: Vec<Row>) -> Snapshot {
    let mut snapshot = Snapshot::default();
    for (id, api_key, network, wait_secs, required_rounds) in rows {
        let (Ok(wait_secs), Ok(required_rounds)) =
            (u64::try_from(wait_secs), u32::try_from(required_rounds))
        else {
            warn!("Retry-After block {id} has a negative wait or round count, skipping it");
            continue;
        };
        let block = |subject: String| Block {
            id,
            wait: Duration::from_secs(wait_secs.max(1)),
            required_rounds: required_rounds.max(1),
            subject,
        };
        match (api_key, network) {
            (Some(key), _) => {
                snapshot.by_key.insert(key, block(key.to_string()));
            }
            (None, Some(network)) => match network.parse::<IpNet>() {
                Ok(net) => snapshot.by_network.push((net, block(network))),
                Err(e) => warn!("Retry-After block {id} has an invalid network {network}: {e}"),
            },
            (None, None) => warn!("Retry-After block {id} has neither an API key nor a network"),
        }
    }
    snapshot
}

fn millis(duration: Duration) -> i64 {
    i64::try_from(duration.as_millis()).unwrap_or(i64::MAX)
}

/// Cheap to clone handle on the active blocks.
#[derive(Clone)]
pub(crate) struct RetryAfterBlocks(Arc<Inner>);

struct Inner {
    pg: Pool<Postgres>,
    redis: ConnectionManager,
    snapshot: ArcSwap<Snapshot>,
}

impl RetryAfterBlocks {
    /// Loads the active blocks and keeps them fresh in the background.
    pub(crate) async fn load(pg: Pool<Postgres>, redis: ConnectionManager) -> Self {
        let blocks = Self(Arc::new(Inner {
            pg,
            redis,
            snapshot: ArcSwap::default(),
        }));
        blocks.refresh().await;
        blocks.spawn_refresh_loop();
        blocks
    }

    /// The active block of a request with `api_key` from `ip`, if any.
    pub(crate) fn find(&self, api_key: Option<Uuid>, ip: Option<IpAddr>) -> Option<Block> {
        let snapshot = self.0.snapshot.load();
        if snapshot.by_key.is_empty() && snapshot.by_network.is_empty() {
            return None;
        }
        snapshot.find(api_key, ip).cloned()
    }

    /// Records a request of a client under `block` and decides whether it passes. The request
    /// that lifts the block also releases it in Postgres, in the background.
    pub(crate) async fn check(&self, block: &Block) -> Result<Verdict, RedisError> {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default();
        let reply: Vec<i64> = SCRIPT
            .key(format!("{KEY_PREFIX}{}", block.id))
            .arg(millis(now))
            .arg(millis(block.wait))
            .arg(block.required_rounds)
            .arg(millis(EARLY_TOLERANCE))
            .arg(millis(ROUND_GRACE))
            .arg(millis(STATE_TTL))
            .invoke_async(&mut self.0.redis.clone())
            .await?;
        let &[code, wait_ms, rounds, early] = reply.as_slice() else {
            return Err(unexpected_reply());
        };
        let outcome = Outcome::from_code(code).ok_or_else(unexpected_reply)?;
        if outcome == Outcome::Lifted {
            info!(
                "Lifting Retry-After block {} of {}: {rounds} requests in a row waited, after \
                 {early} early ones",
                block.id, block.subject
            );
            let blocks = self.clone();
            let id = block.id;
            tokio::spawn(async move { blocks.release(id).await });
        }
        Ok(Verdict {
            outcome,
            retry_after: Duration::from_millis(u64::try_from(wait_ms).unwrap_or(0)),
            rounds: u32::try_from(rounds).unwrap_or(0),
        })
    }

    /// Marks block `id` released and drops it from the snapshot.
    async fn release(&self, id: i64) {
        let result = sqlx::query(
            "UPDATE retry_after_blocks SET released_at = now() WHERE id = $1 AND released_at IS \
             NULL",
        )
        .bind(id)
        .execute(&self.0.pg)
        .await;
        if let Err(e) = result {
            // Redis remembers the release for `STATE_TTL`, so the client passes meanwhile.
            warn!("Failed to release Retry-After block {id}: {e}");
        }
        self.refresh().await;
    }

    /// Replaces the snapshot with the table's active blocks, logging every change.
    async fn refresh(&self) {
        let rows: Vec<Row> = match sqlx::query_as(
            "SELECT id, api_key, network::text, wait_secs, required_rounds FROM \
             retry_after_blocks WHERE released_at IS NULL",
        )
        .fetch_all(&self.0.pg)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                warn!("Failed to load Retry-After blocks, keeping the previous ones: {e}");
                return;
            }
        };
        let snapshot = snapshot_from_rows(rows);
        let previous = self.0.snapshot.load();
        let before: HashMap<i64, &str> = previous.ids().collect();
        let after: HashMap<i64, &str> = snapshot.ids().collect();
        for (id, subject) in &after {
            if !before.contains_key(id) {
                info!("Retry-After block {id} of {subject} is active");
            }
        }
        for (id, subject) in &before {
            if !after.contains_key(id) {
                info!("Retry-After block {id} of {subject} is no longer active");
            }
        }
        self.0.snapshot.store(Arc::new(snapshot));
    }

    fn spawn_refresh_loop(&self) {
        let blocks = self.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(REFRESH_INTERVAL);
            tick.set_missed_tick_behavior(MissedTickBehavior::Delay);
            // The first tick fires immediately; `load` just refreshed.
            tick.tick().await;
            loop {
                tokio::select! {
                    _ = tick.tick() => blocks.refresh().await,
                    () = crate::SHUTDOWN_TOKEN.cancelled() => break,
                }
            }
        });
    }
}

fn unexpected_reply() -> RedisError {
    RedisError::from((
        redis::ErrorKind::Client,
        "Retry-After block script returned an unexpected reply",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: Uuid = Uuid::from_u128(0xd887_508b_036e_42b5_89f3_0754_6170_36bb);

    fn snapshot() -> Snapshot {
        snapshot_from_rows(vec![
            (1, Some(KEY), None, 60, 3),
            (2, None, Some("159.69.117.5/32".to_owned()), 60, 3),
            (3, None, Some("2600:1700:f240:d10::/64".to_owned()), 120, 5),
            (4, None, Some("not a network".to_owned()), 60, 3),
            (5, None, None, 60, 3),
            (6, None, Some("10.0.0.0/8".to_owned()), -1, 3),
        ])
    }

    fn find(api_key: Option<Uuid>, ip: &str) -> Option<i64> {
        snapshot()
            .find(api_key, ip.parse().ok())
            .map(|block| block.id)
    }

    #[test]
    fn skips_invalid_rows() {
        let ids: Vec<i64> = snapshot().ids().map(|(id, _)| id).collect();
        assert_eq!(ids.len(), 3);
        assert!(!ids.contains(&4) && !ids.contains(&5) && !ids.contains(&6));
    }

    #[test]
    fn matches_api_keys_and_networks() {
        assert_eq!(find(Some(KEY), "1.2.3.4"), Some(1));
        assert_eq!(find(None, "159.69.117.5"), Some(2));
        assert_eq!(find(None, "159.69.117.6"), None);
        assert_eq!(find(None, "2600:1700:f240:d10:abcd::1"), Some(3));
        assert_eq!(find(None, "2600:1700:f240:d11::1"), None);
        assert_eq!(find(None, "10.1.2.3"), None);
        assert_eq!(find(None, "garbage"), None);
    }

    #[test]
    fn network_blocks_hold_clients_with_any_key() {
        assert_eq!(find(Some(Uuid::nil()), "159.69.117.5"), Some(2));
        // The key's own block wins.
        assert_eq!(find(Some(KEY), "159.69.117.5"), Some(1));
    }

    #[test]
    fn outcome_codes_round_trip() {
        for (code, outcome) in [
            (0, Outcome::First),
            (1, Outcome::Waited),
            (2, Outcome::Parallel),
            (3, Outcome::Early),
            (4, Outcome::Lifted),
            (5, Outcome::Released),
        ] {
            assert_eq!(Outcome::from_code(code), Some(outcome));
        }
        assert_eq!(Outcome::from_code(6), None);
    }
}
