use core::num::NonZeroU64;
use core::time::Duration;
use std::time::SystemTime;

use crate::{Quota, Usage};

/// Where a client stands against one quota with a request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Status<S> {
    pub quota: Quota<S>,
    /// The cost of the other requests in the window.
    pub used: u64,
    /// The cost of this request.
    pub cost: NonZeroU64,
    /// When the oldest counted request leaves the window. With costs above 1 that may not free
    /// enough of the quota for the next request.
    pub reset_at: SystemTime,
}

impl<S> Status<S> {
    pub(crate) fn new(quota: Quota<S>, usage: Usage, cost: NonZeroU64, now: SystemTime) -> Self {
        let reset_at = usage
            .oldest
            .filter(|_| usage.used > 0)
            .and_then(|oldest| oldest.checked_add(quota.period))
            .unwrap_or(now);
        Self {
            quota,
            used: usage.used,
            cost,
            reset_at,
        }
    }

    /// What is left of the quota before this request.
    #[must_use]
    pub const fn remaining(&self) -> u64 {
        self.quota.limit.saturating_sub(self.used)
    }

    /// Whether this request does not fit in the quota.
    #[must_use]
    pub const fn is_exceeded(&self) -> bool {
        self.cost.get() > self.remaining()
    }

    /// How long until the next request is allowed: zero while requests are left.
    #[must_use]
    pub fn retry_after(&self) -> Duration {
        if !self.is_exceeded() {
            return Duration::ZERO;
        }
        self.reset_at
            .duration_since(SystemTime::now())
            .unwrap_or_default()
    }

    /// [`Self::retry_after`] in whole seconds: 0 while requests are left, else rounded up to at
    /// least 1, so a client that waits this long is not rejected again.
    #[must_use]
    pub fn retry_after_secs(&self) -> u64 {
        if !self.is_exceeded() {
            return 0;
        }
        let wait = self.retry_after();
        let secs = if wait.subsec_nanos() > 0 {
            wait.as_secs().saturating_add(1)
        } else {
            wait.as_secs()
        };
        secs.max(1)
    }
}

/// A request rejected because it would exceed a quota.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("rate limit exceeded: {} per {}s", .0.quota.limit, .0.quota.period.as_secs())]
pub struct Exceeded<S>(pub Status<S>);

#[cfg(test)]
mod tests {
    use super::*;

    fn status(used: u64, oldest_ago: Duration) -> Status<()> {
        let now = SystemTime::now();
        Status::new(
            Quota::new((), 10, Duration::from_mins(1)),
            Usage {
                used,
                oldest: now.checked_sub(oldest_ago),
            },
            NonZeroU64::MIN,
            now,
        )
    }

    #[test]
    fn retry_after_rounds_up_the_wait() {
        assert_eq!(
            status(10, Duration::from_millis(59_500)).retry_after_secs(),
            1
        );
    }

    #[test]
    fn retry_after_is_at_least_a_second_once_the_window_passed() {
        assert_eq!(status(10, Duration::from_mins(2)).retry_after_secs(), 1);
    }

    #[test]
    fn no_retry_after_while_requests_are_left() {
        let status = status(3, Duration::ZERO);
        assert_eq!(status.retry_after_secs(), 0);
        assert_eq!(status.remaining(), 7);
    }
}
