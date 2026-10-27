use core::time::Duration;

use axum::http::HeaderMap;
use chrono::{DateTime, Utc};
use strum::{EnumIs, IntoStaticStr};

use crate::error::{APIError, APIResult, retry_after_secs};

#[derive(Debug, Clone, Copy, Eq, PartialEq, EnumIs, IntoStaticStr)]
pub(super) enum QuotaType {
    IP,
    Key,
    Global,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Quota {
    pub(crate) limit: usize,
    pub(crate) period: Duration,
    pub(super) r#type: QuotaType,
}

impl Quota {
    pub(crate) const fn ip_limit(limit: usize, period: Duration) -> Self {
        Self {
            limit,
            period,
            r#type: QuotaType::IP,
        }
    }

    pub(crate) const fn key_limit(limit: usize, period: Duration) -> Self {
        Self {
            limit,
            period,
            r#type: QuotaType::Key,
        }
    }

    pub(crate) const fn global_limit(limit: usize, period: Duration) -> Self {
        Self {
            limit,
            period,
            r#type: QuotaType::Global,
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct Status {
    pub(crate) quota: Quota,
    pub(crate) requests: usize,
    pub(crate) oldest_request: DateTime<Utc>,
}

impl Status {
    pub(crate) const fn remaining(&self) -> usize {
        self.quota.limit.saturating_sub(self.requests)
    }

    pub(crate) fn limit_type(&self) -> &'static str {
        self.quota.r#type.into()
    }

    const fn is_exceeded(&self) -> bool {
        self.remaining() == 0
    }

    fn next_request_in(&self) -> Duration {
        // If the quota is not exceeded, then there is no need to wait
        if !self.is_exceeded() {
            return Duration::from_millis(0);
        }

        // How long it takes until the oldest request is outside the quota period?
        chrono::TimeDelta::from_std(self.quota.period)
            .ok()
            .and_then(|period| self.oldest_request.checked_add_signed(period))
            .and_then(|end| end.signed_duration_since(Utc::now()).to_std().ok())
            .unwrap_or_default()
    }

    /// Whole seconds until the next request is allowed: 0 while the quota has requests left,
    /// else rounded up to at least 1, so a client waiting this long is not rejected again.
    pub(crate) fn retry_after_secs(&self) -> u64 {
        if self.is_exceeded() {
            retry_after_secs(self.next_request_in())
        } else {
            0
        }
    }

    pub(crate) fn response_headers(&self) -> HeaderMap {
        // Computed once so `RateLimit-Reset` and `Retry-After` always agree.
        let retry_after = self.retry_after_secs();
        let mut headers = HeaderMap::with_capacity(5);
        headers.append("RateLimit-Limit", self.quota.limit.into());
        headers.append("RateLimit-Period", self.quota.period.as_secs().into());
        headers.append("RateLimit-Remaining", self.remaining().into());
        headers.append("RateLimit-Reset", retry_after.into());
        // Only on rejections: these headers are on every rate-limited response.
        if self.is_exceeded() {
            headers.append("Retry-After", retry_after.into());
        }
        headers
    }

    pub(super) fn raise_if_exceeded(&self) -> APIResult<()> {
        if self.is_exceeded() {
            return Err(APIError::RateLimitExceeded {
                status: self.clone(),
            });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(requests: usize, oldest_request: DateTime<Utc>) -> Status {
        Status {
            quota: Quota::ip_limit(10, Duration::from_mins(1)),
            requests,
            oldest_request,
        }
    }

    #[test]
    fn retry_after_rounds_up_the_wait() {
        let oldest = Utc::now() - chrono::TimeDelta::milliseconds(59_500);
        let headers = status(10, oldest).response_headers();
        assert_eq!(headers["Retry-After"], "1");
        assert_eq!(headers["RateLimit-Reset"], "1");
    }

    #[test]
    fn retry_after_is_at_least_a_second_once_the_window_passed() {
        let oldest = Utc::now() - chrono::TimeDelta::minutes(2);
        assert_eq!(status(10, oldest).response_headers()["Retry-After"], "1");
    }

    #[test]
    fn no_retry_after_while_requests_are_left() {
        let headers = status(3, Utc::now()).response_headers();
        assert!(headers.get("Retry-After").is_none());
        assert_eq!(headers["RateLimit-Reset"], "0");
        assert_eq!(headers["RateLimit-Remaining"], "7");
    }
}
