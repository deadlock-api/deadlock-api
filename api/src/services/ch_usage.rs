//! What `ClickHouse` queries cost the server, CPU, memory and disk I/O combined into one number,
//! and charging that cost to the client whose request ran them.
//!
//! The HTTP interface reports neither CPU time nor disk I/O (`X-ClickHouse-Summary` has rows,
//! bytes, elapsed time and peak memory, see [`super::ch_cost`]); only `system.query_log` has them.
//! Queries tracked by [`super::ch_cost::TrackedQuery`] inside [`charge_to`] are noted by their
//! `query_id` (generated unless the caller sets one), and [`spawn_settler`] reads their
//! `query_log` rows every few seconds and records what they cost against the client's budget. Queries that failed or timed out are
//! logged with what they used, so they are charged too.
//!
//! [`Usage::core_ms`] is the cost, in milliseconds of one CPU core. Memory and disk count as their
//! share of the server's capacity, weighted so that saturating any one resource for a second costs
//! as much as all cores for a second: a query that holds 10% of the memory for 2 s costs as much
//! as 10% of the cores for 2 s. On the analytics queries of 2026-11-24 10:00 UTC, CPU was 81% of
//! the cost, disk reads 12% and memory 7% (writes, i.e. spills, ~0.1%); per endpoint the non-CPU
//! share ranged from 2% (item permutations) to 51% (kill/death stats).

use core::num::NonZeroU64;
use core::time::Duration;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex, PoisonError};
use std::time::Instant;

use clickhouse::Row;
use clickhouse::query::Query;
use serde::Deserialize;
use tracing::warn;
use uuid::Uuid;

use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{RateLimit, RateLimitClient};

/// CPU threads of the database host (AMD EPYC 7502P, 32 cores / 64 threads).
const CORES: u128 = 64;
/// `ClickHouse`'s `max_server_memory_usage` (80% of the host's 128 GB).
const MEMORY_BYTES: u128 = 77_000_000_000;
/// Sequential reads of the two Samsung PM983 SSDs in RAID 1 (~3.2 GB/s each).
const DISK_READ_BYTES_PER_SEC: u128 = 6_400_000_000;
/// Sequential writes of the RAID 1 pair: every write goes to both drives (~2 GB/s).
const DISK_WRITE_BYTES_PER_SEC: u128 = 2_000_000_000;

/// What one query used, from its `system.query_log` row.
#[derive(Debug, Clone, Default, PartialEq, Eq, Row, Deserialize)]
pub(crate) struct Usage {
    pub(crate) query_id: String,
    /// `ProfileEvents['OSCPUVirtualTimeMicroseconds']`.
    pub(crate) cpu_us: u64,
    /// Peak memory, `memory_usage`.
    pub(crate) memory_bytes: u64,
    /// `query_duration_ms`, how long the memory was held.
    pub(crate) duration_ms: u64,
    /// `ProfileEvents['OSReadBytes']`: read from the drives, not served from the page cache.
    pub(crate) disk_read_bytes: u64,
    /// `ProfileEvents['OSWriteBytes']`: mostly external sorts and aggregations spilling to disk.
    pub(crate) disk_write_bytes: u64,
}

impl Usage {
    /// The combined cost in core-milliseconds (see the [module docs](self)).
    pub(crate) fn core_ms(&self) -> u64 {
        let cpu = u128::from(self.cpu_us).checked_div(1_000).unwrap_or(0);
        // Share of the memory times the milliseconds it was held, times all cores.
        let memory = u128::from(self.memory_bytes)
            .saturating_mul(u128::from(self.duration_ms))
            .saturating_mul(CORES)
            .checked_div(MEMORY_BYTES)
            .unwrap_or(0);
        // Seconds of the drives' full bandwidth, times all cores, in milliseconds.
        let disk = |bytes: u64, per_sec: u128| {
            u128::from(bytes)
                .saturating_mul(CORES)
                .saturating_mul(1_000)
                .checked_div(per_sec)
                .unwrap_or(0)
        };
        let total = cpu
            .saturating_add(memory)
            .saturating_add(disk(self.disk_read_bytes, DISK_READ_BYTES_PER_SEC))
            .saturating_add(disk(self.disk_write_bytes, DISK_WRITE_BYTES_PER_SEC));
        u64::try_from(total).unwrap_or(u64::MAX)
    }
}

/// Who pays for the queries run inside [`charge_to`].
#[derive(Debug, Clone)]
struct Charge {
    client: RateLimitKey,
    limit: RateLimit<'static>,
}

tokio::task_local! {
    static CHARGE_TO: Charge;
}

/// Runs `future`, charging what its tracked queries cost to `client` under `limit` once
/// [`spawn_settler`]'s task has read them from `system.query_log`. Queries run from other tasks
/// (e.g. `tokio::spawn`) and cache hits are not charged.
pub(crate) async fn charge_to<F: Future>(
    client: RateLimitKey,
    limit: RateLimit<'static>,
    future: F,
) -> F::Output {
    CHARGE_TO.scope(Charge { client, limit }, future).await
}

/// How often the settler reads `system.query_log`. Its rows are flushed every 7.5 s
/// (`flush_interval_milliseconds`), so a query is charged within ~15 s of finishing.
const SETTLE_INTERVAL: Duration = Duration::from_secs(5);
/// A query not in `system.query_log` by then is dropped uncharged (e.g. it never started).
const MAX_PENDING_AGE: Duration = Duration::from_mins(10);
/// Queries waiting to be settled at most; past it, new queries go uncharged rather than letting
/// the map grow while `ClickHouse` is unreachable.
const MAX_PENDING: usize = 100_000;

/// Most queries settled in one pass; the rest wait for the next.
const MAX_SETTLE_BATCH: usize = 10_000;

/// The queries of this replica that wait to be charged, by `query_id`, and when they were tagged.
static PENDING: LazyLock<Mutex<HashMap<String, (Charge, Instant)>>> = LazyLock::new(Mutex::default);

/// Notes `query` to be charged when it runs inside [`charge_to`], under `query_id`, or a generated
/// one if `None`. Outside [`charge_to`] it only sets the given `query_id`. A setting, not SQL, so
/// query cache keys stay the same.
pub(crate) fn tag(query: Query, query_id: Option<&str>) -> Query {
    let charge = CHARGE_TO.try_with(Clone::clone).ok();
    let query_id = match (query_id, &charge) {
        (Some(query_id), _) => query_id.to_owned(),
        (None, Some(_)) => format!("cost-{}", Uuid::new_v4().simple()),
        (None, None) => return query,
    };
    if let Some(charge) = charge {
        let mut pending = PENDING.lock().unwrap_or_else(PoisonError::into_inner);
        if pending.len() < MAX_PENDING {
            pending.insert(query_id.clone(), (charge, Instant::now()));
        } else {
            drop(pending);
            metrics::counter!("api_ch_usage_untracked_queries").increment(1);
        }
    }
    query.with_setting("query_id", query_id)
}

const SETTLE_SQL: &str = "
SELECT
    query_id,
    ProfileEvents['OSCPUVirtualTimeMicroseconds'] AS cpu_us,
    toUInt64(greatest(memory_usage, 0)) AS memory_bytes,
    query_duration_ms AS duration_ms,
    ProfileEvents['OSReadBytes'] AS disk_read_bytes,
    ProfileEvents['OSWriteBytes'] AS disk_write_bytes
FROM system.query_log
WHERE event_date >= yesterday()
    AND event_time >= now() - toIntervalSecond(?)
    AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
    AND has(?, query_id)
SETTINGS log_comment = 'ch_usage_settle'";

/// Charges the queries tagged by [`tag`] every [`SETTLE_INTERVAL`].
pub(crate) fn spawn_settler(ch_client: clickhouse::Client, rate_limit_client: RateLimitClient) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(SETTLE_INTERVAL);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if let Err(e) = settle(&ch_client, &rate_limit_client).await {
                warn!("Failed to settle ClickHouse query costs: {e}");
            }
        }
    });
}

async fn settle(
    ch_client: &clickhouse::Client,
    rate_limit_client: &RateLimitClient,
) -> clickhouse::error::Result<()> {
    let Some((oldest, query_ids)) = expire_pending() else {
        return Ok(());
    };
    // Back to the oldest pending query, plus a minute for the clocks and query durations.
    let lookback_secs = oldest
        .elapsed()
        .min(MAX_PENDING_AGE)
        .as_secs()
        .saturating_add(60);
    let logged: Vec<Usage> = ch_client
        .query(SETTLE_SQL)
        .bind(lookback_secs)
        .bind(query_ids)
        .fetch_all()
        .await?;
    for (charge, cost) in owed(logged) {
        metrics::counter!("api_ch_usage_charged_core_ms", "bucket" => charge.limit.bucket)
            .increment(cost.get());
        rate_limit_client
            .record(&charge.client, charge.limit, cost)
            .await;
    }
    Ok(())
}

/// Drops the queries pending for longer than [`MAX_PENDING_AGE`] and returns when the oldest
/// remaining one was tagged with up to [`MAX_SETTLE_BATCH`] of their ids, `None` if none is left.
fn expire_pending() -> Option<(Instant, Vec<String>)> {
    let mut queries = PENDING.lock().unwrap_or_else(PoisonError::into_inner);
    let before = queries.len();
    queries.retain(|_, (_, tagged)| tagged.elapsed() < MAX_PENDING_AGE);
    let expired = before.saturating_sub(queries.len());
    let oldest = queries.values().map(|(_, tagged)| *tagged).min();
    let query_ids = queries.keys().take(MAX_SETTLE_BATCH).cloned().collect();
    drop(queries);
    if expired > 0 {
        metrics::counter!("api_ch_usage_expired_queries")
            .increment(u64::try_from(expired).unwrap_or(u64::MAX));
    }
    Some((oldest?, query_ids))
}

/// Takes the pending queries among `logged` and sums their cost per client and policy. Rows of
/// queries no longer pending (settled by a concurrent pass, or expired) are skipped.
fn owed(logged: Vec<Usage>) -> Vec<(Charge, NonZeroU64)> {
    let mut owed: HashMap<(String, &'static str), (Charge, u64)> = HashMap::new();
    let mut queries = PENDING.lock().unwrap_or_else(PoisonError::into_inner);
    for usage in logged {
        let Some((charge, _)) = queries.remove(&usage.query_id) else {
            continue;
        };
        let key = (charge.client.client_id(), charge.limit.bucket);
        let entry = owed.entry(key).or_insert_with(|| (charge, 0));
        entry.1 = entry.1.saturating_add(usage.core_ms());
    }
    drop(queries);
    owed.into_values()
        .filter_map(|(charge, cost)| Some((charge, NonZeroU64::new(cost)?)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usage() -> Usage {
        Usage::default()
    }

    #[test]
    fn cpu_counts_as_is() {
        let cost = Usage {
            cpu_us: 2_500_000,
            ..usage()
        };
        assert_eq!(cost.core_ms(), 2_500);
    }

    #[test]
    fn saturating_one_resource_for_a_second_costs_all_cores_for_a_second() {
        let all_cores = 64_000;
        let memory = Usage {
            memory_bytes: 77_000_000_000,
            duration_ms: 1_000,
            ..usage()
        };
        let reads = Usage {
            disk_read_bytes: 6_400_000_000,
            ..usage()
        };
        let writes = Usage {
            disk_write_bytes: 2_000_000_000,
            ..usage()
        };
        assert_eq!(memory.core_ms(), all_cores);
        assert_eq!(reads.core_ms(), all_cores);
        assert_eq!(writes.core_ms(), all_cores);
    }

    #[test]
    fn components_add_up() {
        let cost = Usage {
            cpu_us: 1_000_000,
            // 1 GB for 2 s: 64 * 1e9 * 2000 / 77e9 = 1662 core-ms.
            memory_bytes: 1_000_000_000,
            duration_ms: 2_000,
            // 100 MB from disk: 10 core-ms per MB.
            disk_read_bytes: 100_000_000,
            ..usage()
        };
        assert_eq!(cost.core_ms(), 1_000 + 1_662 + 1_000);
    }

    #[test]
    fn extreme_values_saturate() {
        let cost = Usage {
            cpu_us: u64::MAX,
            memory_bytes: u64::MAX,
            duration_ms: u64::MAX,
            disk_read_bytes: u64::MAX,
            disk_write_bytes: u64::MAX,
            ..usage()
        };
        assert_eq!(cost.core_ms(), u64::MAX);
    }

    #[tokio::test]
    async fn tags_only_queries_run_for_a_client() {
        const LIMIT: RateLimit = RateLimit::new("test", &[]);
        let client = clickhouse::Client::default();
        let before = PENDING.lock().unwrap().len();
        drop(tag(client.query("SELECT 1"), None));
        drop(tag(client.query("SELECT 1"), Some("not-charged")));
        assert_eq!(PENDING.lock().unwrap().len(), before);

        let key = RateLimitKey::from_ip(core::net::Ipv4Addr::new(192, 0, 2, 1));
        charge_to(key.clone(), LIMIT, async {
            drop(tag(client.query("SELECT 1"), None));
            drop(tag(client.query("SELECT 2"), Some("caller-chosen-id")));
        })
        .await;
        let pending: Vec<String> = PENDING
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, (charge, _))| charge.limit.bucket == "test")
            .map(|(id, _)| id.clone())
            .collect();
        assert_eq!(pending.len(), 2);
        assert!(pending.iter().any(|id| id == "caller-chosen-id"));
        assert!(pending.iter().any(|id| id.starts_with("cost-")));

        // Settling sums both into one charge and forgets them; a second pass charges nothing.
        let logged = || {
            pending
                .iter()
                .map(|id| Usage {
                    query_id: id.clone(),
                    cpu_us: 3_000,
                    ..usage()
                })
                .collect::<Vec<_>>()
        };
        let charges = owed(logged());
        assert_eq!(charges.len(), 1);
        assert_eq!(charges[0].1.get(), 6);
        assert_eq!(charges[0].0.client.client_id(), key.client_id());
        assert!(owed(logged()).is_empty());
    }
}
