//! Caches of `ClickHouse` query results, keyed by the query string.
//!
//! Two tiers: a bounded in-memory cache per query function, and an optional disk tier shared by
//! all API instances ([`disk`]). A miss in memory reads the disk tier before it queries
//! `ClickHouse`, and every result fetched from `ClickHouse` is written to it in the background.
//! So a restarted instance (every deploy restarts both) answers from disk instead of re-running
//! every query, which used to push `ClickHouse` into timeouts for minutes after each deploy.
//!
//! Entries keep their original deadline across tiers and instances: an entry read from disk
//! expires when the query result it holds would have expired.
//!
//! Errors are not cached, except that a query which ran into the timeout fails fast with the same
//! error for [`TIMEOUT_COOLDOWN`] instead of running again. Clients retry timed-out queries, and
//! every retry burns the same CPU and times out again under the load it adds to.

pub(crate) mod disk;

use core::future::Future;
use core::time::Duration;
use std::sync::Arc;
use std::time::{Instant, SystemTime};

use moka::Expiry;
use serde::Serialize;
use serde::de::DeserializeOwned;

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

/// A cached query result and when it expires.
#[derive(Debug)]
struct Entry<T> {
    value: Arc<T>,
    expires_at: SystemTime,
}

impl<T> Clone for Entry<T> {
    fn clone(&self) -> Self {
        Self {
            value: Arc::clone(&self.value),
            expires_at: self.expires_at,
        }
    }
}

/// Expires each entry at its own deadline, which a disk-loaded entry inherits from the
/// instance that fetched it.
struct UntilDeadline;

impl<T> Expiry<u128, Entry<T>> for UntilDeadline {
    fn expire_after_create(&self, _: &u128, value: &Entry<T>, _: Instant) -> Option<Duration> {
        Some(
            value
                .expires_at
                .duration_since(SystemTime::now())
                .unwrap_or_default(),
        )
    }
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
    name: String,
    ttl: Duration,
    memory: moka::future::Cache<u128, Entry<T>>,
    /// The timeout errors of recently timed-out queries, see [`TIMEOUT_COOLDOWN`].
    timed_out: moka::future::Cache<u128, Arc<clickhouse::error::Error>>,
    disk: DiskSource,
}

impl<T> ChCache<T>
where
    T: Serialize + DeserializeOwned + Send + Sync + 'static,
{
    /// A cache keeping at most `max_entries` results in memory, each for `ttl`. `name` (a
    /// `module_path!()`-based path) must be unique per cache and stable across releases.
    pub(crate) fn new(name: &str, max_entries: u64, ttl: Duration) -> Self {
        Self::with_disk(name, max_entries, ttl, TIMEOUT_COOLDOWN, DiskSource::Global)
    }

    fn with_disk(
        name: &str,
        max_entries: u64,
        ttl: Duration,
        timeout_cooldown: Duration,
        disk: DiskSource,
    ) -> Self {
        Self {
            name: name.replace("::", "."),
            ttl,
            memory: moka::future::Cache::builder()
                .name(name)
                .max_capacity(max_entries)
                .expire_after(UntilDeadline)
                .build(),
            timed_out: moka::future::Cache::builder()
                .max_capacity(TIMEOUT_COOLDOWN_ENTRIES)
                .time_to_live(timeout_cooldown)
                .build(),
            disk,
        }
    }

    fn disk(&self) -> Option<&disk::DiskTier> {
        match &self.disk {
            DiskSource::Global => disk::global(),
            DiskSource::Fixed(tier) => tier.as_deref(),
        }
    }

    /// The cached result of `query_str`, else the disk tier's, else `fetch`'s. Concurrent misses
    /// of one query share a single lookup and fetch. Errors are not cached, but a query that
    /// timed out returns the same timeout error without running for [`TIMEOUT_COOLDOWN`].
    pub(crate) async fn get_or_fetch<F>(
        &self,
        query_str: &str,
        fetch: F,
    ) -> Result<Arc<T>, ChQueryError>
    where
        F: Future<Output = Result<T, ChQueryError>>,
    {
        let key = query_cache_key(query_str);
        if !self.memory.contains_key(&key)
            && let Some(e) = self.timed_out.get(&key).await
        {
            metrics::counter!("ch_cache_timeout_fail_fast").increment(1);
            return Err(ChQueryError::Clickhouse(e));
        }
        let result = self
            .memory
            .try_get_with(key, async {
                if let Some(tier) = self.disk()
                    && let Some((value, expires_at)) = tier.load::<T>(&self.name, key).await
                {
                    return Ok(Entry {
                        value: Arc::new(value),
                        expires_at,
                    });
                }
                let entry = Entry {
                    value: Arc::new(fetch.await?),
                    // A deadline past `SystemTime`'s range (absurd ttl) caches nothing.
                    expires_at: SystemTime::now()
                        .checked_add(self.ttl)
                        .unwrap_or_else(SystemTime::now),
                };
                if let Some(tier) = self.disk() {
                    tier.store(&self.name, key, entry.expires_at, Arc::clone(&entry.value));
                }
                Ok(entry)
            })
            .await
            .map(|entry| entry.value)
            .map_err(|e: Arc<ChQueryError>| (*e).clone());
        if let Err(ChQueryError::Clickhouse(e)) = &result
            && is_query_timeout(e)
        {
            self.timed_out.insert(key, Arc::clone(e)).await;
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use core::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::services::ch_admission::Busy;

    fn cache(disk: Option<Arc<disk::DiskTier>>, ttl: Duration) -> ChCache<Vec<u32>> {
        ChCache::with_disk(
            "test::cache",
            100,
            ttl,
            TIMEOUT_COOLDOWN,
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
        let cache = ChCache::with_disk(
            "test::cache",
            100,
            Duration::from_secs(60),
            Duration::from_millis(100),
            DiskSource::Fixed(None),
        );
        let calls = AtomicUsize::new(0);
        let first = cache
            .get_or_fetch("SELECT 1", async { Err(timeout()) })
            .await;
        assert!(matches!(first, Err(ChQueryError::Clickhouse(ref e)) if is_query_timeout(e)));

        // The same query fails with the same error without running; other queries still run.
        let again = cache
            .get_or_fetch("SELECT 1", fetch_counted(&calls, vec![1]))
            .await;
        assert!(matches!(again, Err(ChQueryError::Clickhouse(ref e)) if is_query_timeout(e)));
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
}
