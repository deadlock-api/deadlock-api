use core::any::{Any, TypeId};
use core::time::Duration;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Instant, SystemTime};

use moka::Expiry;

/// How often [`MemoryTier::spawn_metrics`] exports the tier's size.
const METRICS_INTERVAL: Duration = Duration::from_mins(1);

/// A cached query result of some cache, and when it expires.
#[derive(Clone)]
pub(super) struct Entry {
    pub(super) value: Arc<dyn Any + Send + Sync>,
    pub(super) expires_at: SystemTime,
    /// The result's size as named `MessagePack` (the disk tier's format), the memory tier's unit:
    /// a proxy for its heap size that costs no extra pass, as the disk tier encodes it anyway.
    pub(super) weight: u32,
    /// The cache the entry belongs to, for the metrics.
    pub(super) cache: Arc<str>,
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
pub(super) type Key = (TypeId, u128, u128);

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

/// The in-memory results of all caches sharing it.
///
/// Bounded by their total encoded size rather than a count per cache: results range from bytes
/// to megabytes, and URL sweeps fill a count-bounded cache with large single-use results.
#[derive(Debug)]
pub struct MemoryTier {
    pub(super) entries: moka::future::Cache<Key, Entry>,
}

impl Default for MemoryTier {
    fn default() -> Self {
        Self::new(Self::DEFAULT_BUDGET_BYTES)
    }
}

impl MemoryTier {
    /// 2 GiB of encoded results. An hour of results of the API's busy production instance took
    /// ~3.3 GiB as named `MessagePack` (2026-10-28), most of it single-use results of URL sweeps;
    /// the disk tier answers what no longer fits.
    pub const DEFAULT_BUDGET_BYTES: u64 = 2 << 30;

    /// A tier holding up to `budget_bytes` of results encoded as named `MessagePack`.
    #[must_use]
    pub fn new(budget_bytes: u64) -> Self {
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
    pub(super) async fn usage(&self) -> HashMap<Arc<str>, (u64, u64)> {
        self.entries.run_pending_tasks().await;
        let mut usage: HashMap<Arc<str>, (u64, u64)> = HashMap::new();
        for (_, entry) in &self.entries {
            let (entries, bytes) = usage.entry(entry.cache).or_default();
            *entries = entries.saturating_add(1);
            *bytes = bytes.saturating_add(u64::from(entry.weight));
        }
        usage
    }

    /// Exports the tier's entries and bytes per cache (`ch_cache_memory_entries`,
    /// `ch_cache_memory_bytes`) and its budget (`ch_cache_memory_budget_bytes`) every minute.
    pub fn spawn_metrics(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(METRICS_INTERVAL);
            // Caches seen before, so one whose entries all expired drops to zero instead of
            // keeping its last value.
            let mut seen: Vec<Arc<str>> = Vec::new();
            loop {
                interval.tick().await;
                let usage = self.usage().await;
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
                if let Some(budget) = self.entries.policy().max_capacity() {
                    metrics::gauge!("ch_cache_memory_budget_bytes").set(budget as f64);
                }
            }
        });
    }
}
