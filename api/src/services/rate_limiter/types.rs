use crate::error::{APIError, APIResult};
use axum::http::HeaderMap;
use chrono::{DateTime, Utc};

use std::time::Duration;
use strum_macros::EnumIs;
use tracing::error;

#[derive(Debug, Clone, Copy, Eq, PartialEq, EnumIs)]
pub(super) enum QuotaType {
    IP,
    Key,
    Global,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Quota {
    pub(crate) limit: u32,
    pub(crate) period: Duration,
    pub(super) quota_type: QuotaType,
}

impl Quota {
    #[allow(dead_code)]
    pub(crate) fn ip_limit(limit: u32, period: Duration) -> Self {
        Self {
            limit,
            period,
            quota_type: QuotaType::IP,
        }
    }

    #[allow(dead_code)]
    pub(crate) fn key_limit(limit: u32, period: Duration) -> Self {
        Self {
            limit,
            period,
            quota_type: QuotaType::Key,
        }
    }

    #[allow(dead_code)]
    pub(crate) fn global_limit(limit: u32, period: Duration) -> Self {
        Self {
            limit,
            period,
            quota_type: QuotaType::Global,
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct Status {
    pub(crate) quota: Quota,
    pub(crate) requests: u32,
    pub(crate) oldest_request: DateTime<Utc>,
}

impl Status {
    pub(crate) fn remaining(&self) -> u32 {
        self.quota.limit.saturating_sub(self.requests)
    }

    fn is_exceeded(&self) -> bool {
        self.remaining() == 0
    }

    fn next_request_in(&self) -> Duration {
        // If the quota is not exceeded, then there is no need to wait
        if !self.is_exceeded() {
            return Duration::from_millis(0);
        }

        // How long it takes until the oldest request is outside the quota period?
        (self.oldest_request + self.quota.period - Utc::now())
            .to_std()
            .unwrap_or_default()
    }

    pub(crate) fn response_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.append("RateLimit-Limit", self.quota.limit.into());
        headers.append("RateLimit-Period", self.quota.period.as_secs().into());
        headers.append("RateLimit-Remaining", self.remaining().into());
        headers.append("RateLimit-Reset", self.next_request_in().as_secs().into());
        headers.append("Retry-After", self.next_request_in().as_secs().into());
        headers
    }

    pub(super) fn raise_if_exceeded(&self) -> APIResult<()> {
        if self.is_exceeded() {
            error!("Rate limit exceeded: {:?}", self);
            return Err(APIError::RateLimitExceeded {
                status: self.clone(),
            });
        }
        Ok(())
    }
}
