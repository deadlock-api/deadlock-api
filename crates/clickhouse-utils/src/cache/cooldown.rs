use core::time::Duration;
use std::sync::Arc;
use std::time::Instant;

/// At most this many timed-out queries are remembered per cooldown.
const ENTRIES: u64 = 10_000;

/// Queries that recently ran into the timeout and fail fast for a cooldown.
///
/// A query in its cooldown gets the same error instead of running again. Clients retry timed-out
/// queries, and every retry burns the same CPU and times out again under the load it adds to.
/// [`super::QueryCache`] keeps one per cache. Query paths that do not cache their results (e.g.
/// streamed responses) can keep their own, keyed by [`super::query_key`].
pub struct TimeoutCooldown {
    cooldown: Duration,
    /// The timeout errors of recently timed-out queries and when their cooldown ends.
    entries: moka::future::Cache<u128, (Arc<clickhouse::error::Error>, Instant)>,
}

impl core::fmt::Debug for TimeoutCooldown {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("TimeoutCooldown")
            .field("cooldown", &self.cooldown)
            .finish_non_exhaustive()
    }
}

impl Default for TimeoutCooldown {
    fn default() -> Self {
        Self::new(Self::DEFAULT)
    }
}

impl TimeoutCooldown {
    /// Replayed on 24 h of the API's production queries (2026-10-26): 10 minutes answers 42% of
    /// the timeouts at once instead of after 20 s and saves 5% of `ClickHouse` CPU; 724 of the
    /// 3,447 fail-fast answers (21%) would have succeeded on the rerun.
    pub const DEFAULT: Duration = Duration::from_mins(10);

    #[must_use]
    pub fn new(cooldown: Duration) -> Self {
        Self {
            cooldown,
            entries: moka::future::Cache::builder()
                .max_capacity(ENTRIES)
                .time_to_live(cooldown)
                .build(),
        }
    }

    #[must_use]
    pub const fn cooldown(&self) -> Duration {
        self.cooldown
    }

    /// The timeout error of the query with key `key` and the time left until it may run again,
    /// if it is cooling down. Counts the fail-fast answer in `ch_cache_timeout_fail_fast`.
    pub async fn check(&self, key: u128) -> Option<(Arc<clickhouse::error::Error>, Duration)> {
        let (error, until) = self.entries.get(&key).await?;
        metrics::counter!("ch_cache_timeout_fail_fast").increment(1);
        Some((error, until.saturating_duration_since(Instant::now())))
    }

    /// Starts the cooldown of the query with key `key`, which ran into the timeout with `error`.
    /// Returns the cooldown, the time until the query may run again.
    pub async fn start(&self, key: u128, error: Arc<clickhouse::error::Error>) -> Duration {
        // A cooldown past `Instant`'s range (absurd) ends right away, like the moka TTL.
        let until = Instant::now()
            .checked_add(self.cooldown)
            .unwrap_or_else(Instant::now);
        self.entries.insert(key, (error, until)).await;
        self.cooldown
    }
}
