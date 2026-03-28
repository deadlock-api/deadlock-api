//! Retry utilities using tryhard for resilient operations.

use core::fmt::Display;
use core::future::Future;
use core::time::Duration;

pub use tryhard::RetryFutureConfig;

/// Retries an async operation with exponential backoff.
///
/// Retry delays: 1s, 2s, 4s, 8s, 16s (5 retries total).
/// Logs each retry attempt and final failure.
///
/// # Example
///
/// ```ignore
/// let result = retry_with_backoff(|| async {
///     fetch_data().await
/// }).await;
/// ```
pub async fn retry_with_backoff<F, Fut, T, E>(operation: F) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: Display,
{
    retry_with_backoff_configurable(5, operation).await
}

/// Retries an async operation with exponential backoff and configurable max retries.
///
/// Retry delays follow exponential pattern: 1s, 2s, 4s, 8s, 16s, etc.
/// Logs each retry attempt and final failure.
pub async fn retry_with_backoff_configurable<F, Fut, T, E>(
    max_retries: u32,
    operation: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: Display,
{
    tryhard::retry_fn(operation)
        .retries(max_retries)
        .exponential_backoff(Duration::from_secs(1))
        .on_retry(|attempt, _, error: &E| {
            let next_delay_secs = 1u64 << attempt;
            tracing::warn!(
                attempt = attempt,
                max_retries = max_retries,
                next_delay_secs = next_delay_secs,
                error = %error,
                "Operation failed, retrying after backoff"
            );
            core::future::ready(())
        })
        .await
        .inspect_err(|e| {
            tracing::error!(
                max_retries = max_retries,
                error = %e,
                "Operation failed after all retry attempts"
            );
        })
}
