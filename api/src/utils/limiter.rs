use crate::error::APIError;
use crate::state::AppState;
use axum::http::{HeaderMap, StatusCode};
use cached::TimedCache;
use cached::proc_macro::cached;
use chrono::{DateTime, Utc};
use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, RedisResult};
use sqlx::{Pool, Postgres};
use std::time::Duration;
use uuid::Uuid;

const MAX_TTL_SECONDS: isize = 3600;

#[derive(Debug, Clone, Eq, PartialEq)]
enum RateLimitQuotaType {
    IP,
    Key,
    Global,
}

#[derive(Debug, Clone)]
pub struct RateLimitQuota {
    pub limit: u32,
    pub period: Duration,
    rate_limit_quota_type: RateLimitQuotaType,
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
        // If the quota is not exceeded then there is no need to wait
        if !self.is_exceeded() {
            return Duration::from_millis(0);
        }

        // How long it takes until oldest request is outside the quota period?
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

    pub fn raise_if_exceeded(&self) -> Result<(), APIError> {
        if self.is_exceeded() {
            return Err(APIError::RateLimitExceeded {
                status: self.clone(),
            });
        }
        Ok(())
    }
}

pub async fn apply_limits(
    headers: &HeaderMap,
    state: &AppState,
    key: &str,
    quotas: &[RateLimitQuota],
) -> Result<Option<RateLimitStatus>, APIError> {
    if quotas.is_empty() {
        return Ok(None);
    }

    let ip = extract_ip(headers);
    let api_key = extract_api_key(headers);

    // Validate the API key if it is present
    let api_key = match api_key {
        Some(key) => is_api_key_valid(&state.pg_client, key).await.then_some(key),
        None => None,
    };

    // If the service is in emergency mode, only requests with an API key are allowed
    if state.config.emergency_mode && api_key.is_none() {
        return Err(APIError::StatusMsg {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: "Service is in emergency mode".to_string(),
        });
    }

    let prefix = api_key.map(|k| k.to_string()).unwrap_or(ip.to_string());
    increment_key(state.redis_client.clone(), &prefix, key)
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to increment key: {e}"),
        })?;

    // Check for custom quotas
    let quotas = match api_key {
        None => quotas.to_vec(),
        Some(api_key) => {
            let custom_quotas = get_custom_quotas(&state.pg_client, api_key, key).await;
            if custom_quotas.is_empty() {
                let has_api_key_limits = quotas
                    .iter()
                    .any(|q| q.rate_limit_quota_type == RateLimitQuotaType::Key);
                // Remove IP quotas if there are key quotas and api_key is present
                quotas
                    .iter()
                    .filter(|q| {
                        !has_api_key_limits || q.rate_limit_quota_type != RateLimitQuotaType::IP
                    })
                    .cloned()
                    .collect()
            } else {
                custom_quotas
            }
        }
    };
    let mut all_statuses = Vec::new();
    for quota in quotas {
        let prefixed_key = if quota.rate_limit_quota_type == RateLimitQuotaType::Global {
            key
        } else {
            &format!("{prefix}:{key}")
        };
        let Ok((requests, oldest_request)) =
            check_requests(&mut state.redis_client.clone(), &prefixed_key, quota.period).await
        else {
            continue;
        };
        let status = RateLimitStatus {
            quota,
            requests,
            oldest_request,
        };
        status.raise_if_exceeded()?;
        all_statuses.push(status);
    }

    Ok(all_statuses.into_iter().min_by_key(|s| s.remaining()))
}

async fn check_requests(
    redis_conn: &mut MultiplexedConnection,
    key: &&str,
    period: Duration,
) -> RedisResult<(u32, DateTime<Utc>)> {
    let current_time = Utc::now().timestamp() as isize;
    let result: Vec<isize> = redis_conn
        .zrangebyscore(key, current_time - period.as_secs() as isize, current_time)
        .await?;
    let oldest_request = result
        .iter()
        .min()
        .and_then(|t| DateTime::from_timestamp(*t as i64, 0))
        .unwrap_or_else(|| Utc::now() - Duration::from_secs(MAX_TTL_SECONDS as u64));
    Ok((result.len() as u32 - 1, oldest_request))
}

async fn increment_key(
    mut redis_conn: MultiplexedConnection,
    prefix: &str,
    key: &str,
) -> RedisResult<()> {
    //! Increments the rate limit key in Redis.
    let current_time = Utc::now().timestamp() as isize;
    let prefixed_key = format!("{prefix}:{key}");
    redis::pipe()
        .zrembyscore(&prefixed_key, 0, current_time - MAX_TTL_SECONDS) // Remove old entries
        .zadd(&prefixed_key, current_time, current_time) // Add current timestamp
        .expire(&prefixed_key, MAX_TTL_SECONDS as i64) // Set expiration time
        .zrembyscore(key, 0, current_time - MAX_TTL_SECONDS) // Remove old entries for the key
        .zadd(key, current_time, current_time) // Add current timestamp for the key
        .expire(key, MAX_TTL_SECONDS as i64) // Set expiration time for the key
        .exec_async(&mut redis_conn) // Execute the pipeline
        .await
}

#[cached(
    ty = "TimedCache<Uuid, bool>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    convert = "{ api_key }",
    sync_writes = "by_key",
    key = "Uuid"
)]
pub async fn is_api_key_valid(state: &Pool<Postgres>, api_key: Uuid) -> bool {
    sqlx::query!("SELECT COUNT(*) FROM api_keys WHERE key = $1", api_key)
        .fetch_one(state)
        .await
        .ok()
        .and_then(|row| row.count.map(|c| c > 0))
        .unwrap_or(false)
}

#[cached(
    ty = "TimedCache<String, Vec<RateLimitQuota>>",
    create = "{ TimedCache::with_lifespan(10 * 60) }",
    convert = r#"{ format!("{api_key}-{path}") }"#
)]
pub async fn get_custom_quotas(
    pg_client: &Pool<Postgres>,
    api_key: Uuid,
    path: &str,
) -> Vec<RateLimitQuota> {
    sqlx::query!(
        "SELECT rate_limit, rate_period FROM api_key_limits WHERE key = $1 AND path = $2",
        api_key,
        path
    )
    .fetch_all(pg_client)
    .await
    .ok()
    .map(|rows| {
        rows.iter()
            .map(|row| RateLimitQuota {
                limit: row.rate_limit as u32,
                period: Duration::from_micros(row.rate_period.microseconds as u64),
                rate_limit_quota_type: RateLimitQuotaType::Key,
            })
            .collect()
    })
    .unwrap_or_default()
}

fn extract_ip(headers: &HeaderMap) -> &str {
    headers
        .get("CF-Connecting-IP")
        .or(headers.get("X-Real-IP"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("0.0.0.0")
}

fn extract_api_key(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get("X-API-Key")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .and_then(|s| Uuid::parse_str(s.strip_prefix("HEXE-").unwrap_or(&s)).ok())
}

#[cfg(test)]
mod tests {
    use axum::http::{HeaderMap, HeaderName, HeaderValue};
    use std::str::FromStr;

    #[test]
    fn test_extract_ip() {
        let mut headers: HeaderMap = HeaderMap::default();
        headers.append::<HeaderName>(
            HeaderName::from_str("CF-Connecting-IP").unwrap(),
            HeaderValue::from_str("144.155.166.177").unwrap(),
        );
        assert_eq!(super::extract_ip(&headers), "144.155.166.177");
    }

    #[test]
    fn test_extract_api_key() {
        let mut headers: HeaderMap = HeaderMap::default();
        headers.append::<HeaderName>(
            HeaderName::from_str("X-API-Key").unwrap(),
            HeaderValue::from_str("HEXE-f1da7396-03aa-4ac0-975d-39c222b25088").unwrap(),
        );
        assert_eq!(
            super::extract_api_key(&headers).unwrap().to_string(),
            "f1da7396-03aa-4ac0-975d-39c222b25088"
        );
    }
}
