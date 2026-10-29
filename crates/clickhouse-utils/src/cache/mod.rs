//! Caches of `ClickHouse` query results, keyed by the query string.
//!
//! Two [`Tiers`]: an in-memory tier shared by all caches, bounded by the size of the results it
//! holds ([`MemoryTier`]), and an optional disk tier that several processes may share
//! ([`DiskTier`]). A miss in memory reads the disk tier before it queries `ClickHouse`, and every
//! result fetched from `ClickHouse` is written to it in the background. So a restarted process
//! answers from disk instead of re-running every query, which in the API used to push
//! `ClickHouse` into timeouts for minutes after each deploy, and a result evicted from memory
//! comes back from disk instead of `ClickHouse`.
//!
//! Entries keep their original deadline across tiers and processes: an entry read from disk
//! expires when the query result it holds would have expired.
//!
//! Errors are not cached, except that a query which ran into the timeout fails fast with the same
//! error for a cooldown ([`QueryCache::DEFAULT_TIMEOUT_COOLDOWN`]) instead of running again.
//! Clients retry timed-out queries, and every retry burns the same CPU and times out again under
//! the load it adds to. Both the timeout and the fail-fast answers carry the time left until the
//! query runs again ([`QueryError::TimedOut`]).

mod disk;
mod memory;

use core::any::TypeId;
use core::future::Future;
use core::marker::PhantomData;
use core::time::Duration;
use std::sync::{Arc, OnceLock};
use std::time::{Instant, SystemTime};

pub use disk::DiskTier;
use memory::Entry;
pub use memory::MemoryTier;
use serde::Serialize;
use serde::de::DeserializeOwned;
use tracing::warn;

use crate::admission::QueryError;
use crate::is_query_timeout;

/// At most this many timed-out queries are remembered per cache.
const TIMEOUT_COOLDOWN_ENTRIES: u64 = 10_000;

/// The process-wide tiers, see [`Tiers::install`].
static GLOBAL: OnceLock<Tiers> = OnceLock::new();

/// Where caches keep their results.
#[derive(Debug, Clone, Default)]
pub struct Tiers {
    pub memory: Arc<MemoryTier>,
    pub disk: Option<Arc<DiskTier>>,
}

impl Tiers {
    /// Makes these the tiers of caches built with [`QueryCache::new`]. Call once at startup,
    /// before the first query; fails with `self` if the process-wide tiers were installed or
    /// used already.
    pub fn install(self) -> Result<(), Self> {
        GLOBAL.set(self)
    }

    /// The process-wide tiers: the installed ones, else a memory tier of
    /// [`MemoryTier::DEFAULT_BUDGET_BYTES`] without disk.
    pub fn global() -> &'static Self {
        GLOBAL.get_or_init(Self::default)
    }
}

/// A cache of one query function's results (see the module docs).
pub struct QueryCache<T> {
    /// Stable across releases: it names the cache's directory in the disk tier.
    name: Arc<str>,
    /// `name`'s hash, the cache's part of the memory tier's keys.
    id: u128,
    ttl: Duration,
    /// `None` for the process-wide tiers, looked up on each query so a cache built before
    /// [`Tiers::install`] still uses them.
    tiers: Option<Tiers>,
    timeout_cooldown: Duration,
    /// The timeout errors of recently timed-out queries and when their cooldown ends.
    timed_out: moka::future::Cache<u128, (Arc<clickhouse::error::Error>, Instant)>,
    row: PhantomData<fn() -> T>,
}

impl<T> core::fmt::Debug for QueryCache<T> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("QueryCache")
            .field("name", &self.name)
            .field("ttl", &self.ttl)
            .field("timeout_cooldown", &self.timeout_cooldown)
            .finish_non_exhaustive()
    }
}

impl<T> QueryCache<T>
where
    T: Serialize + DeserializeOwned + Send + Sync + 'static,
{
    /// How long a query that ran into the timeout fails fast instead of running again. Replayed
    /// on 24 h of the API's production queries (2026-10-26): 10 minutes answers 42% of the
    /// timeouts at once instead of after 20 s and saves 5% of `ClickHouse` CPU; 724 of the 3,447
    /// fail-fast answers (21%) would have succeeded on the rerun.
    pub const DEFAULT_TIMEOUT_COOLDOWN: Duration = Duration::from_mins(10);

    /// A cache keeping results for `ttl` in the process-wide [`Tiers`]. `name` (a path like
    /// `module_path!()`) must be unique per cache and stable across releases: it names the
    /// cache's entries on disk, with `::` turned into `.`.
    #[must_use]
    pub fn new(name: &str, ttl: Duration) -> Self {
        let name: Arc<str> = name.replace("::", ".").into();
        Self {
            id: query_key(&name),
            name,
            ttl,
            tiers: None,
            timeout_cooldown: Self::DEFAULT_TIMEOUT_COOLDOWN,
            timed_out: timed_out_cache(Self::DEFAULT_TIMEOUT_COOLDOWN),
            row: PhantomData,
        }
    }

    /// Keeps the results in `tiers` instead of the process-wide ones.
    #[must_use]
    pub fn with_tiers(mut self, tiers: Tiers) -> Self {
        self.tiers = Some(tiers);
        self
    }

    /// Fails timed-out queries fast for `cooldown` instead of
    /// [`Self::DEFAULT_TIMEOUT_COOLDOWN`].
    #[must_use]
    pub fn with_timeout_cooldown(mut self, cooldown: Duration) -> Self {
        self.timeout_cooldown = cooldown;
        self.timed_out = timed_out_cache(cooldown);
        self
    }

    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    fn tiers(&self) -> &Tiers {
        self.tiers.as_ref().unwrap_or_else(|| Tiers::global())
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

    /// The cached result of `query`, else the disk tier's, else `fetch`'s. Concurrent misses of
    /// one query share a single lookup and fetch. Errors are not cached, but a query that timed
    /// out returns [`QueryError::TimedOut`] without running until its cooldown ends.
    pub async fn get_or_fetch<F>(&self, query: &str, fetch: F) -> Result<Arc<T>, QueryError>
    where
        F: Future<Output = Result<T, QueryError>>,
    {
        let tiers = self.tiers();
        let query_key = query_key(query);
        let key = (TypeId::of::<T>(), self.id, query_key);
        if !tiers.memory.entries.contains_key(&key)
            && let Some((error, until)) = self.timed_out.get(&query_key).await
        {
            metrics::counter!("ch_cache_timeout_fail_fast").increment(1);
            return Err(QueryError::TimedOut {
                error,
                retry_after: until.saturating_duration_since(Instant::now()),
            });
        }
        let disk = tiers.disk.as_deref();
        let result = tiers
            .memory
            .entries
            .try_get_with(key, async {
                if let Some(disk) = disk
                    && let Some((value, expires_at, encoded_len)) =
                        disk.load::<T>(&self.name, query_key).await
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
                if let Some(disk) = disk
                    && let Some(encoded) = encoded
                {
                    disk.store(&self.name, query_key, expires_at, encoded);
                }
                Ok(self.entry(value, expires_at, encoded_len))
            })
            .await
            .map_err(|e: Arc<QueryError>| (*e).clone())
            .and_then(|entry| {
                entry.value.downcast::<T>().map_err(|other| {
                    // Unreachable: the row type is part of the key.
                    QueryError::Clickhouse(Arc::new(clickhouse::error::Error::Custom(format!(
                        "query cache {} holds an entry of type {:?}",
                        self.name,
                        (*other).type_id()
                    ))))
                })
            });
        match result {
            Err(QueryError::Clickhouse(error)) if is_query_timeout(&error) => {
                // A cooldown past `Instant`'s range (absurd) ends right away, like the moka TTL.
                let until = Instant::now()
                    .checked_add(self.timeout_cooldown)
                    .unwrap_or_else(Instant::now);
                self.timed_out
                    .insert(query_key, (Arc::clone(&error), until))
                    .await;
                Err(QueryError::TimedOut {
                    error,
                    retry_after: self.timeout_cooldown,
                })
            }
            result => result,
        }
    }
}

fn timed_out_cache(
    cooldown: Duration,
) -> moka::future::Cache<u128, (Arc<clickhouse::error::Error>, Instant)> {
    moka::future::Cache::builder()
        .max_capacity(TIMEOUT_COOLDOWN_ENTRIES)
        .time_to_live(cooldown)
        .build()
}

/// Cache key of a query string: its 128-bit xxh3 hash.
///
/// Keeping the hash instead of the string bounds a cache entry's key at 16 bytes whatever the
/// query length; a collision between two distinct queries at 128 bits is not a practical concern.
#[must_use]
pub fn query_key(query: &str) -> u128 {
    xxhash_rust::xxh3::xxh3_128(query.as_bytes())
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
    use crate::admission::Busy;

    fn tiers(disk: Option<Arc<DiskTier>>) -> Tiers {
        Tiers {
            memory: Arc::new(MemoryTier::new(1 << 20)),
            disk,
        }
    }

    fn cache(disk: Option<Arc<DiskTier>>, ttl: Duration) -> QueryCache<Vec<u32>> {
        QueryCache::new("test::cache", ttl).with_tiers(tiers(disk))
    }

    fn timeout() -> QueryError {
        clickhouse::error::Error::BadResponse(
            "Code: 159. DB::Exception: Timeout exceeded: elapsed 20.0 seconds. (TIMEOUT_EXCEEDED)"
                .to_owned(),
        )
        .into()
    }

    async fn fetch_counted(calls: &AtomicUsize, rows: Vec<u32>) -> Result<Vec<u32>, QueryError> {
        calls.fetch_add(1, Ordering::Relaxed);
        tokio::time::sleep(Duration::from_millis(20)).await;
        Ok(rows)
    }

    #[test]
    fn query_keys_tell_queries_apart() {
        assert_eq!(query_key("SELECT 1"), query_key("SELECT 1"));
        assert_ne!(query_key("SELECT 1"), query_key("SELECT 2"));
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
        assert!(matches!(busy, Err(QueryError::Busy(Busy::Timeout))));
        let ok = cache
            .get_or_fetch("SELECT 1", async { Ok(vec![7]) })
            .await
            .unwrap();
        assert_eq!(*ok, vec![7]);
    }

    #[tokio::test]
    async fn timed_out_queries_fail_fast_until_the_cooldown_ends() {
        let cache =
            cache(None, Duration::from_secs(60)).with_timeout_cooldown(Duration::from_millis(100));
        let calls = AtomicUsize::new(0);
        let first = cache
            .get_or_fetch("SELECT 1", async { Err(timeout()) })
            .await;
        assert!(matches!(
            first,
            Err(QueryError::TimedOut { ref error, retry_after })
                if is_query_timeout(error) && retry_after == Duration::from_millis(100)
        ));

        // The same query fails with the same error without running; other queries still run.
        let again = cache
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![1]))
            .await;
        assert!(matches!(
            again,
            Err(QueryError::TimedOut { ref error, retry_after })
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
    async fn another_process_reads_the_disk_tier() {
        let dir = tempfile::tempdir().unwrap();
        let disk = Arc::new(DiskTier::open(dir.path()).unwrap());
        let calls = AtomicUsize::new(0);

        let first = cache(Some(Arc::clone(&disk)), Duration::from_secs(60));
        first
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![1, 2, 3]))
            .await
            .unwrap();
        disk.flush().await;

        // A fresh cache of the same name and empty memory, as after a restart or in another
        // process.
        let second = cache(Some(disk), Duration::from_secs(60));
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
        let cache: QueryCache<Vec<u32>> = QueryCache::new("test::cache", Duration::from_secs(60))
            .with_tiers(Tiers {
                memory: Arc::clone(&memory),
                disk: None,
            });
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
        let tiers = tiers(None);
        let ttl = Duration::from_secs(60);
        let numbers: QueryCache<Vec<u32>> =
            QueryCache::new("test::numbers", ttl).with_tiers(tiers.clone());
        let other_numbers: QueryCache<Vec<u32>> =
            QueryCache::new("test::other_numbers", ttl).with_tiers(tiers.clone());
        let words: QueryCache<Vec<String>> =
            QueryCache::new("test::numbers", ttl).with_tiers(tiers.clone());
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

        let usage = tiers.memory.usage().await;
        assert_eq!(usage.len(), 2);
        let (entries, bytes) = usage[&Arc::<str>::from("test.numbers")];
        assert_eq!(entries, 2);
        assert!(bytes > 0);
        assert_eq!(usage[&Arc::<str>::from("test.other_numbers")].0, 1);
    }
}
