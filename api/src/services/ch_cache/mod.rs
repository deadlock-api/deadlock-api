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

pub(crate) mod disk;

use core::future::Future;
use core::time::Duration;
use std::sync::Arc;
use std::time::{Instant, SystemTime};

use moka::Expiry;
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::services::ch_admission::ChQueryError;
use crate::utils::sql::query_cache_key;

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
    fn expire_after_create(&self, _: &u128, entry: &Entry<T>, _: Instant) -> Option<Duration> {
        Some(
            entry
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
    #[cfg_attr(not(test), expect(dead_code))]
    Fixed(Option<Arc<disk::DiskTier>>),
}

/// A cache of one query function's results (see the module docs).
pub(crate) struct ChCache<T> {
    /// Stable across releases: it names the cache's directory in the disk tier.
    name: String,
    ttl: Duration,
    memory: moka::future::Cache<u128, Entry<T>>,
    disk: DiskSource,
}

impl<T> ChCache<T>
where
    T: Serialize + DeserializeOwned + Send + Sync + 'static,
{
    /// A cache keeping at most `max_entries` results in memory, each for `ttl`. `name` (a
    /// `module_path!()`-based path) must be unique per cache and stable across releases.
    pub(crate) fn new(name: &str, max_entries: u64, ttl: Duration) -> Self {
        Self::with_disk(name, max_entries, ttl, DiskSource::Global)
    }

    fn with_disk(name: &str, max_entries: u64, ttl: Duration, disk: DiskSource) -> Self {
        Self {
            name: name.replace("::", "."),
            ttl,
            memory: moka::future::Cache::builder()
                .name(name)
                .max_capacity(max_entries)
                .expire_after(UntilDeadline)
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
    /// of one query share a single lookup and fetch. Errors are not cached.
    pub(crate) async fn get_or_fetch<F>(
        &self,
        query_str: &str,
        fetch: F,
    ) -> Result<Arc<T>, ChQueryError>
    where
        F: Future<Output = Result<T, ChQueryError>>,
    {
        let key = query_cache_key(query_str);
        self.memory
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
                    expires_at: SystemTime::now() + self.ttl,
                };
                if let Some(tier) = self.disk() {
                    tier.store(&self.name, key, entry.expires_at, Arc::clone(&entry.value));
                }
                Ok(entry)
            })
            .await
            .map(|entry| entry.value)
            .map_err(|e: Arc<ChQueryError>| (*e).clone())
    }
}

#[cfg(test)]
mod tests {
    use core::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::services::ch_admission::Busy;

    fn cache(disk: Option<Arc<disk::DiskTier>>, ttl: Duration) -> ChCache<Vec<u32>> {
        ChCache::with_disk("test::cache", 100, ttl, DiskSource::Fixed(disk))
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
