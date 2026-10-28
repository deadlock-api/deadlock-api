use core::convert::Infallible;

use axum::http::header::RETRY_AFTER;
use axum::http::{HeaderMap, HeaderName};
use axum::response::{IntoResponseParts, ResponseParts};

use crate::services::rate_limiter::Status;

/// The `RateLimit-*` headers for a quota, plus `Retry-After` once it is exceeded.
pub(crate) struct RateLimitHeaders(pub(crate) Status);

const LIMIT: HeaderName = HeaderName::from_static("ratelimit-limit");
const PERIOD: HeaderName = HeaderName::from_static("ratelimit-period");
const REMAINING: HeaderName = HeaderName::from_static("ratelimit-remaining");
const RESET: HeaderName = HeaderName::from_static("ratelimit-reset");

impl RateLimitHeaders {
    fn write(&self, headers: &mut HeaderMap) {
        let Self(status) = self;
        // Computed once so `RateLimit-Reset` and `Retry-After` always agree.
        let retry_after = status.retry_after_secs();
        headers.insert(LIMIT, status.quota.limit.into());
        headers.insert(PERIOD, status.quota.period.as_secs().into());
        headers.insert(REMAINING, status.remaining().into());
        headers.insert(RESET, retry_after.into());
        if status.is_exceeded() {
            headers.insert(RETRY_AFTER, retry_after.into());
        }
    }
}

impl IntoResponseParts for RateLimitHeaders {
    type Error = Infallible;

    fn into_response_parts(self, mut res: ResponseParts) -> Result<ResponseParts, Infallible> {
        self.write(res.headers_mut());
        Ok(res)
    }
}

#[cfg(test)]
mod tests {
    use core::num::NonZeroU64;
    use core::time::Duration;
    use std::time::SystemTime;

    use super::*;
    use crate::services::rate_limiter::{Quota, Scope};

    fn headers(used: u64, reset_in: Duration) -> HeaderMap {
        let mut headers = HeaderMap::new();
        RateLimitHeaders(Status {
            quota: Quota::new(Scope::Ip, 10, Duration::from_mins(1)),
            used,
            cost: NonZeroU64::MIN,
            reset_at: SystemTime::now() + reset_in,
        })
        .write(&mut headers);
        headers
    }

    #[test]
    fn retry_after_rounds_up_the_wait() {
        let headers = headers(10, Duration::from_millis(500));
        assert_eq!(headers["Retry-After"], "1");
        assert_eq!(headers["RateLimit-Reset"], "1");
    }

    #[test]
    fn no_retry_after_while_requests_are_left() {
        let headers = headers(3, Duration::ZERO);
        assert!(headers.get("Retry-After").is_none());
        assert_eq!(headers["RateLimit-Reset"], "0");
        assert_eq!(headers["RateLimit-Remaining"], "7");
        assert_eq!(headers["RateLimit-Period"], "60");
    }
}
