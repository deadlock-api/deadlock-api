//! Caches of `ClickHouse` query results, keyed by the query string.
//!
//! Two tiers: an in-memory tier shared by all query functions, bounded by the size of the results
//! it holds ([`MemoryTier`]), and an optional disk tier shared by all API instances ([`disk`]). A
//! miss in memory reads the disk tier before it queries `ClickHouse`, and every result fetched
//! from `ClickHouse` is written to it in the background. So a restarted instance (every deploy
//! restarts both) answers from disk instead of re-running every query, which used to push
//! `ClickHouse` into timeouts for minutes after each deploy, and a result evicted from memory
//! comes back from disk instead of `ClickHouse`.
//!
//! Entries keep their original deadline across tiers and instances: an entry read from disk
//! expires when the query result it holds would have expired.
//!
//! Errors are not cached, except that a query which ran into the timeout fails fast with the same
//! error for [`TIMEOUT_COOLDOWN`] instead of running again. Clients retry timed-out queries, and
//! every retry burns the same CPU and times out again under the load it adds to. Both the timeout
//! and the fail-fast answers carry the time left until the query runs again
//! ([`ChQueryError::TimedOut`]), which the API sends as `Retry-After`.

pub(crate) mod disk;

use core::any::{Any, TypeId};
use core::future::Future;
use core::marker::PhantomData;
use core::time::Duration;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};
use std::time::{Instant, SystemTime};

use moka::Expiry;
use serde::Serialize;
use serde::de::DeserializeOwned;
use tracing::warn;

use crate::error::is_query_timeout;
use crate::services::ch_admission::ChQueryError;
use crate::utils::sql::query_cache_key;

/// How long a query that ran into the timeout fails fast instead of running again. Replayed on 24 h
/// of production queries (2026-10-26): 10 minutes answers 42% of the timeouts at once instead of
/// after 20 s and saves 5% of `ClickHouse` CPU; 724 of the 3,447 fail-fast answers (21%) would
/// have succeeded on the rerun.
const TIMEOUT_COOLDOWN: Duration = Duration::from_mins(10);

/// At most this many timed-out queries are remembered per cache.
const TIMEOUT_COOLDOWN_ENTRIES: u64 = 10_000;

/// The memory tier's default budget in MiB of encoded results, overridden by
/// `CH_CACHE_MEMORY_MB`. An hour of results of the busy production instance took ~3.3 GiB as named
/// `MessagePack` (2026-10-28), most of it single-use results of URL sweeps; the disk tier answers
/// what no longer fits.
const DEFAULT_MEMORY_MB: u64 = 2048;

/// How often [`spawn_memory_metrics`] exports the memory tier's size.
const METRICS_INTERVAL: Duration = Duration::from_mins(1);

/// The process-wide memory tier, sized by `CH_CACHE_MEMORY_MB`.
static MEMORY: LazyLock<Arc<MemoryTier>> = LazyLock::new(|| {
    let mb = std::env::var("CH_CACHE_MEMORY_MB").map_or(DEFAULT_MEMORY_MB, |value| {
        value.parse().unwrap_or_else(|e| {
            warn!("Invalid CH_CACHE_MEMORY_MB {value:?} ({e}), using {DEFAULT_MEMORY_MB}");
            DEFAULT_MEMORY_MB
        })
    });
    Arc::new(MemoryTier::new(mb.saturating_mul(1024 * 1024)))
});

/// A cached query result of some cache, and when it expires.
#[derive(Clone)]
struct Entry {
    value: Arc<dyn Any + Send + Sync>,
    expires_at: SystemTime,
    /// The result's size as named `MessagePack` (the disk tier's format), the memory tier's unit:
    /// a proxy for its heap size that costs no extra pass, as the disk tier encodes it anyway.
    weight: u32,
    /// The cache the entry belongs to, for the metrics.
    cache: Arc<str>,
}

impl core::fmt::Debug for Entry {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Entry")
            .field("expires_at", &self.expires_at)
            .field("weight", &self.weight)
            .field("cache", &self.cache)
            .finish_non_exhaustive()
    }
}

/// The row type, the cache and the query. With the row type in the key an entry's value always
/// has its cache's type, and caches never see each other's entries.
type Key = (TypeId, u128, u128);

/// Expires each entry at its own deadline, which a disk-loaded entry inherits from the
/// instance that fetched it.
struct UntilDeadline;

impl Expiry<Key, Entry> for UntilDeadline {
    fn expire_after_create(&self, _: &Key, value: &Entry, _: Instant) -> Option<Duration> {
        Some(
            value
                .expires_at
                .duration_since(SystemTime::now())
                .unwrap_or_default(),
        )
    }
}

/// The in-memory results of all caches, bounded by their total encoded size rather than a count
/// per cache: results range from bytes to megabytes, and URL sweeps fill a count-bounded cache
/// with large single-use results.
pub(crate) struct MemoryTier {
    entries: moka::future::Cache<Key, Entry>,
}

impl MemoryTier {
    fn new(budget_bytes: u64) -> Self {
        Self {
            entries: moka::future::Cache::builder()
                .name("ch_cache")
                .max_capacity(budget_bytes)
                .weigher(|_, entry: &Entry| entry.weight)
                .expire_after(UntilDeadline)
                .build(),
        }
    }

    /// The number of entries and their total weight per cache.
    async fn usage(&self) -> HashMap<Arc<str>, (u64, u64)> {
        self.entries.run_pending_tasks().await;
        let mut usage: HashMap<Arc<str>, (u64, u64)> = HashMap::new();
        for (_, entry) in &self.entries {
            let (entries, bytes) = usage.entry(entry.cache).or_default();
            *entries = entries.saturating_add(1);
            *bytes = bytes.saturating_add(u64::from(entry.weight));
        }
        usage
    }
}

/// Exports the memory tier's entries and bytes per cache (`ch_cache_memory_entries`,
/// `ch_cache_memory_bytes`) and its budget every [`METRICS_INTERVAL`].
pub(crate) fn spawn_memory_metrics() {
    tokio::spawn(async {
        let mut interval = tokio::time::interval(METRICS_INTERVAL);
        // Caches seen before, so one whose entries all expired drops to zero instead of keeping
        // its last value.
        let mut seen: Vec<Arc<str>> = Vec::new();
        loop {
            interval.tick().await;
            let usage = MEMORY.usage().await;
            for cache in usage.keys() {
                if !seen.contains(cache) {
                    seen.push(Arc::clone(cache));
                }
            }
            #[expect(clippy::cast_precision_loss, reason = "gauges take f64")]
            for cache in &seen {
                let (entries, bytes) = usage.get(cache).copied().unwrap_or_default();
                let label = cache.to_string();
                metrics::gauge!("ch_cache_memory_entries", "cache" => label.clone())
                    .set(entries as f64);
                metrics::gauge!("ch_cache_memory_bytes", "cache" => label).set(bytes as f64);
            }
            #[expect(clippy::cast_precision_loss, reason = "gauges take f64")]
            if let Some(budget) = MEMORY.entries.policy().max_capacity() {
                metrics::gauge!("ch_cache_memory_budget_bytes").set(budget as f64);
            }
        }
    });
}

/// Where a cache finds its disk tier.
enum DiskSource {
    /// The process-wide tier configured at startup ([`disk::init`]), if any.
    Global,
    /// A fixed tier, for tests.
    #[cfg_attr(not(test), expect(dead_code, reason = "only tests build fixed tiers"))]
    Fixed(Option<Arc<disk::DiskTier>>),
}

/// A cache of one query function's results (see the module docs).
pub(crate) struct ChCache<T> {
    /// Stable across releases: it names the cache's directory in the disk tier.
    name: Arc<str>,
    /// `name`'s hash, the cache's part of the memory tier's keys.
    id: u128,
    ttl: Duration,
    memory: Arc<MemoryTier>,
    timeout_cooldown: Duration,
    /// The timeout errors of recently timed-out queries and when their cooldown ends, see
    /// [`TIMEOUT_COOLDOWN`].
    timed_out: moka::future::Cache<u128, (Arc<clickhouse::error::Error>, Instant)>,
    disk: DiskSource,
    row: PhantomData<fn() -> T>,
}

impl<T> ChCache<T>
where
    T: Serialize + DeserializeOwned + Send + Sync + 'static,
{
    /// A cache keeping results for `ttl` in the process-wide memory tier. `name` (a
    /// `module_path!()`-based path) must be unique per cache and stable across releases.
    pub(crate) fn new(name: &str, ttl: Duration) -> Self {
        Self::with_tiers(
            name,
            ttl,
            TIMEOUT_COOLDOWN,
            Arc::clone(&MEMORY),
            DiskSource::Global,
        )
    }

    fn with_tiers(
        name: &str,
        ttl: Duration,
        timeout_cooldown: Duration,
        memory: Arc<MemoryTier>,
        disk: DiskSource,
    ) -> Self {
        let name: Arc<str> = name.replace("::", ".").into();
        Self {
            id: query_cache_key(&name),
            name,
            ttl,
            memory,
            timeout_cooldown,
            timed_out: moka::future::Cache::builder()
                .max_capacity(TIMEOUT_COOLDOWN_ENTRIES)
                .time_to_live(timeout_cooldown)
                .build(),
            disk,
            row: PhantomData,
        }
    }

    fn disk(&self) -> Option<&disk::DiskTier> {
        match &self.disk {
            DiskSource::Global => disk::global(),
            DiskSource::Fixed(tier) => tier.as_deref(),
        }
    }

    fn entry(&self, value: Arc<T>, expires_at: SystemTime, encoded_len: Option<usize>) -> Entry {
        Entry {
            value,
            expires_at,
            // A result that does not encode weighs more than any budget, so it is not kept.
            weight: encoded_len.map_or(u32::MAX, |len| u32::try_from(len).unwrap_or(u32::MAX)),
            cache: Arc::clone(&self.name),
        }
    }

    /// The cached result of `query_str`, else the disk tier's, else `fetch`'s. Concurrent misses
    /// of one query share a single lookup and fetch. Errors are not cached, but a query that
    /// timed out returns [`ChQueryError::TimedOut`] without running for [`TIMEOUT_COOLDOWN`].
    pub(crate) async fn get_or_fetch<F>(
        &self,
        query_str: &str,
        fetch: F,
    ) -> Result<Arc<T>, ChQueryError>
    where
        F: Future<Output = Result<T, ChQueryError>>,
    {
        let query_key = query_cache_key(query_str);
        let key = (TypeId::of::<T>(), self.id, query_key);
        if !self.memory.entries.contains_key(&key)
            && let Some((error, until)) = self.timed_out.get(&query_key).await
        {
            metrics::counter!("ch_cache_timeout_fail_fast").increment(1);
            return Err(ChQueryError::TimedOut {
                error,
                retry_after: until.saturating_duration_since(Instant::now()),
            });
        }
        let result = self
            .memory
            .entries
            .try_get_with(key, async {
                if let Some(tier) = self.disk()
                    && let Some((value, expires_at, encoded_len)) =
                        tier.load::<T>(&self.name, query_key).await
                {
                    return Ok(self.entry(Arc::new(value), expires_at, Some(encoded_len)));
                }
                let value = Arc::new(fetch.await?);
                // A deadline past `SystemTime`'s range (absurd ttl) caches nothing.
                let expires_at = SystemTime::now()
                    .checked_add(self.ttl)
                    .unwrap_or_else(SystemTime::now);
                let encoded = encode(Arc::clone(&value)).await;
                let encoded_len = encoded.as_ref().map(Vec::len);
                if let Some(tier) = self.disk()
                    && let Some(encoded) = encoded
                {
                    tier.store(&self.name, query_key, expires_at, encoded);
                }
                Ok(self.entry(value, expires_at, encoded_len))
            })
            .await
            .map_err(|e: Arc<ChQueryError>| (*e).clone())
            .and_then(|entry| {
                entry.value.downcast::<T>().map_err(|other| {
                    // Unreachable: the row type is part of the key.
                    ChQueryError::Clickhouse(Arc::new(clickhouse::error::Error::Custom(format!(
                        "query cache {} holds an entry of type {:?}",
                        self.name,
                        (*other).type_id()
                    ))))
                })
            });
        match result {
            Err(ChQueryError::Clickhouse(error)) if is_query_timeout(&error) => {
                // A cooldown past `Instant`'s range (absurd) ends right away, like the moka TTL.
                let until = Instant::now()
                    .checked_add(self.timeout_cooldown)
                    .unwrap_or_else(Instant::now);
                self.timed_out
                    .insert(query_key, (Arc::clone(&error), until))
                    .await;
                Err(ChQueryError::TimedOut {
                    error,
                    retry_after: self.timeout_cooldown,
                })
            }
            result => result,
        }
    }
}

/// `value` as named `MessagePack`, encoded off the async workers; `None` if it does not encode.
async fn encode<T>(value: Arc<T>) -> Option<Vec<u8>>
where
    T: Serialize + Send + Sync + 'static,
{
    match tokio::task::spawn_blocking(move || rmp_serde::to_vec_named(&*value)).await {
        Ok(Ok(encoded)) => Some(encoded),
        Ok(Err(e)) => {
            warn!("Failed to encode a query result: {e}");
            None
        }
        Err(e) => {
            warn!("Query result encode task failed: {e}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use core::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::services::ch_admission::Busy;

    fn memory() -> Arc<MemoryTier> {
        Arc::new(MemoryTier::new(1 << 20))
    }

    fn cache(disk: Option<Arc<disk::DiskTier>>, ttl: Duration) -> ChCache<Vec<u32>> {
        ChCache::with_tiers(
            "test::cache",
            ttl,
            TIMEOUT_COOLDOWN,
            memory(),
            DiskSource::Fixed(disk),
        )
    }

    fn timeout() -> ChQueryError {
        clickhouse::error::Error::BadResponse(
            "Code: 159. DB::Exception: Timeout exceeded: elapsed 20.0 seconds. (TIMEOUT_EXCEEDED)"
                .to_owned(),
        )
        .into()
    }

    async fn fetch_counted(calls: &AtomicUsize, rows: Vec<u32>) -> Result<Vec<u32>, ChQueryError> {
        calls.fetch_add(1, Ordering::Relaxed);
        tokio::time::sleep(Duration::from_millis(20)).await;
        Ok(rows)
    }

    #[tokio::test]
    async fn concurrent_misses_share_one_fetch() {
        let cache = cache(None, Duration::from_secs(60));
        let calls = AtomicUsize::new(0);
        let (a, b) = tokio::join!(
            cache.get_or_fetch("SELECT 1", fetch_counted(&calls, vec![1])),
            cache.get_or_fetch("SELECT 1", fetch_counted(&calls, vec![2])),
        );
        assert_eq!(*a.unwrap(), *b.unwrap());
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        let hit = cache
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![3]))
            .await
            .unwrap();
        assert_eq!(*hit, vec![1]);
        assert_eq!(calls.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn errors_are_not_cached() {
        let cache = cache(None, Duration::from_secs(60));
        let busy = cache
            .get_or_fetch("SELECT 1", async { Err(Busy::Timeout.into()) })
            .await;
        assert!(matches!(busy, Err(ChQueryError::Busy(Busy::Timeout))));
        let ok = cache
            .get_or_fetch("SELECT 1", async { Ok(vec![7]) })
            .await
            .unwrap();
        assert_eq!(*ok, vec![7]);
    }

    #[tokio::test]
    async fn timed_out_queries_fail_fast_until_the_cooldown_ends() {
        let cache = ChCache::with_tiers(
            "test::cache",
            Duration::from_secs(60),
            Duration::from_millis(100),
            memory(),
            DiskSource::Fixed(None),
        );
        let calls = AtomicUsize::new(0);
        let first = cache
            .get_or_fetch("SELECT 1", async { Err(timeout()) })
            .await;
        assert!(matches!(
            first,
            Err(ChQueryError::TimedOut { ref error, retry_after })
                if is_query_timeout(error) && retry_after == Duration::from_millis(100)
        ));

        // The same query fails with the same error without running; other queries still run.
        let again = cache
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![1]))
            .await;
        assert!(matches!(
            again,
            Err(ChQueryError::TimedOut { ref error, retry_after })
                if is_query_timeout(error) && retry_after <= Duration::from_millis(100)
        ));
        assert_eq!(calls.load(Ordering::Relaxed), 0);
        let other = cache
            .get_or_fetch("SELECT 2", fetch_counted(&calls, vec![2]))
            .await
            .unwrap();
        assert_eq!(*other, vec![2]);

        tokio::time::sleep(Duration::from_millis(150)).await;
        let after = cache
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![3]))
            .await
            .unwrap();
        assert_eq!(*after, vec![3]);
        assert_eq!(calls.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn other_errors_do_not_start_a_cooldown() {
        let cache = cache(None, Duration::from_secs(60));
        let error = cache
            .get_or_fetch("SELECT 1", async {
                Err(
                    clickhouse::error::Error::BadResponse("Code: 60. UNKNOWN_TABLE".to_owned())
                        .into(),
                )
            })
            .await;
        error.unwrap_err();
        let ok = cache
            .get_or_fetch("SELECT 1", async { Ok(vec![7]) })
            .await
            .unwrap();
        assert_eq!(*ok, vec![7]);
    }

    #[tokio::test]
    async fn entries_expire_after_ttl() {
        let cache = cache(None, Duration::from_millis(50));
        let calls = AtomicUsize::new(0);
        cache
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![1]))
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        let refetched = cache
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![2]))
            .await
            .unwrap();
        assert_eq!(*refetched, vec![2]);
        assert_eq!(calls.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn another_instance_reads_the_disk_tier() {
        let dir = tempfile::tempdir().unwrap();
        let tier = Arc::new(disk::DiskTier::new(dir.path().to_owned()));
        let calls = AtomicUsize::new(0);

        let first = cache(Some(Arc::clone(&tier)), Duration::from_secs(60));
        first
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![1, 2, 3]))
            .await
            .unwrap();
        tier.flush().await;

        // A fresh cache of the same name, as after a restart or on the other instance.
        let second = cache(Some(tier), Duration::from_secs(60));
        let from_disk = second
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![9]))
            .await
            .unwrap();
        assert_eq!(*from_disk, vec![1, 2, 3]);
        assert_eq!(calls.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn the_memory_tier_stays_within_its_budget() {
        // 100 rows of 5-byte integers encode to ~500 bytes, so the budget holds one or two.
        let memory = Arc::new(MemoryTier::new(1_000));
        let cache: ChCache<Vec<u32>> = ChCache::with_tiers(
            "test::cache",
            Duration::from_secs(60),
            TIMEOUT_COOLDOWN,
            Arc::clone(&memory),
            DiskSource::Fixed(None),
        );
        for i in 0..20 {
            let rows = vec![1_000_000 + i; 100];
            let result = cache
                .get_or_fetch(&format!("SELECT {i}"), async { Ok(rows.clone()) })
                .await
                .unwrap();
            assert_eq!(*result, rows);
        }
        memory.entries.run_pending_tasks().await;
        assert!(memory.entries.weighted_size() <= 1_000);
        assert!(memory.entries.entry_count() >= 1);
    }

    #[tokio::test]
    async fn caches_sharing_the_memory_tier_keep_their_own_results() {
        let memory = memory();
        let numbers: ChCache<Vec<u32>> = ChCache::with_tiers(
            "test::numbers",
            Duration::from_secs(60),
            TIMEOUT_COOLDOWN,
            Arc::clone(&memory),
            DiskSource::Fixed(None),
        );
        let other_numbers: ChCache<Vec<u32>> = ChCache::with_tiers(
            "test::other_numbers",
            Duration::from_secs(60),
            TIMEOUT_COOLDOWN,
            Arc::clone(&memory),
            DiskSource::Fixed(None),
        );
        let words: ChCache<Vec<String>> = ChCache::with_tiers(
            "test::numbers",
            Duration::from_secs(60),
            TIMEOUT_COOLDOWN,
            Arc::clone(&memory),
            DiskSource::Fixed(None),
        );
        let a = numbers
            .get_or_fetch("SELECT 1", async { Ok(vec![1]) })
            .await
            .unwrap();
        let b = other_numbers
            .get_or_fetch("SELECT 1", async { Ok(vec![2]) })
            .await
            .unwrap();
        let c = words
            .get_or_fetch("SELECT 1", async { Ok(vec!["one".to_owned()]) })
            .await
            .unwrap();
        assert_eq!(*a, vec![1]);
        assert_eq!(*b, vec![2]);
        assert_eq!(*c, vec!["one".to_owned()]);

        let usage = memory.usage().await;
        assert_eq!(usage.len(), 2);
        let (entries, bytes) = usage[&Arc::<str>::from("test.numbers")];
        assert_eq!(entries, 2);
        assert!(bytes > 0);
        assert_eq!(usage[&Arc::<str>::from("test.other_numbers")].0, 1);
    }
}
