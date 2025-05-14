use crate::error::{APIError, APIResult};
use axum::http::HeaderMap;
use chrono::{DateTime, Utc};

use derive_more::IsVariant;
use std::time::Duration;
use tracing::error;

#[derive(Debug, Clone, Copy, Eq, PartialEq, IsVariant)]
pub enum RateLimitQuotaType {
    IP,
    Key,
    Global,
}

#[derive(Debug, Clone, Copy)]
pub struct RateLimitQuota {
    pub limit: u32,
    pub period: Duration,
    pub rate_limit_quota_type: RateLimitQuotaType,
}

impl RateLimitQuota {
    #[allow(dead_code)]
    pub fn ip_limit(limit: u32, period: Duration) -> Self {
        Self {
            limit,
            period,
            rate_limit_quota_type: RateLimitQuotaType::IP,
        }
    }

    #[allow(dead_code)]
    pub fn key_limit(limit: u32, period: Duration) -> Self {
        Self {
            limit,
            period,
            rate_limit_quota_type: RateLimitQuotaType::Key,
        }
    }

    #[allow(dead_code)]
    pub fn global_limit(limit: u32, period: Duration) -> Self {
        Self {
            limit,
            period,
            rate_limit_quota_type: RateLimitQuotaType::Global,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RateLimitStatus {
    pub quota: RateLimitQuota,
    pub requests: u32,
    pub oldest_request: DateTime<Utc>,
}

impl RateLimitStatus {
    pub fn remaining(&self) -> u32 {
        self.quota.limit.saturating_sub(self.requests)
    }

    pub fn is_exceeded(&self) -> bool {
        self.remaining() == 0
    }

    pub fn next_request_in(&self) -> Duration {
        // If the quota is not exceeded, then there is no need to wait
        if !self.is_exceeded() {
            return Duration::from_millis(0);
        }

        // How long it takes until the oldest request is outside the quota period?
        (self.oldest_request + self.quota.period - Utc::now())
            .to_std()
            .unwrap_or_default()
    }

    pub fn response_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.append("RateLimit-Limit", self.quota.limit.into());
        headers.append("RateLimit-Period", self.quota.period.as_secs().into());
        headers.append("RateLimit-Remaining", self.remaining().into());
        headers.append("RateLimit-Reset", self.next_request_in().as_secs().into());
        headers.append("Retry-After", self.next_request_in().as_secs().into());
        headers
    }

    pub fn raise_if_exceeded(&self) -> APIResult<()> {
        if self.is_exceeded() {
            error!("Rate limit exceeded: {:?}", self);
            return Err(APIError::RateLimitExceeded {
                status: self.clone(),
            });
        }
        Ok(())
    }
}
