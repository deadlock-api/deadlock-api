//! Retry utilities using tryhard for resilient operations.

use core::fmt::Display;
use core::future::Future;
use core::time::Duration;

/// How [`retry_with_backoff`] spaces its attempts: the delay starts at `initial_delay` and
/// doubles after every failure, up to `max_delay`.
#[derive(Debug, Clone, Copy)]
pub struct Backoff {
    pub retries: u32,
    pub initial_delay: Duration,
    pub max_delay: Duration,
}

impl Backoff {
    /// For short blips (inserts, object moves): 5 retries, 100ms..1.6s, ~3s in total.
    pub const SHORT: Self = Self {
        retries: 5,
        initial_delay: Duration::from_millis(100),
        max_delay: Duration::from_millis(1600),
    };

    /// For longer outages: `retries` retries, 1s, 2s, 4s, 8s, 16s, then 30s each.
    #[must_use]
    pub const fn long(retries: u32) -> Self {
        Self {
            retries,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
        }
    }
}

/// Retries an async operation with exponential backoff, logging each retry with `label`.
/// Returns the last error once the retries are used up.
pub async fn retry_with_backoff<F, Fut, T, E>(
    label: &str,
    backoff: Backoff,
    operation: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: Display,
{
    tryhard::retry_fn(operation)
        .retries(backoff.retries)
        .exponential_backoff(backoff.initial_delay)
        .max_delay(backoff.max_delay)
        .on_retry(|attempt, next_delay, error: &E| {
            tracing::warn!(
                attempt,
                max_retries = backoff.retries,
                next_delay_ms = next_delay.map_or(0, |d| d.as_millis()),
                "{label} failed, retrying: {error:#}"
            );
            core::future::ready(())
        })
        .await
}
