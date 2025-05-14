use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::types::RateLimitQuotaType;
use crate::services::rate_limiter::{RateLimitQuota, RateLimitStatus};
use cached::TimedCache;
use cached::proc_macro::cached;
use chrono::{DateTime, Utc};
use derive_more::Constructor;
use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, RedisResult};
use sqlx::{Pool, Postgres};
use std::time::Duration;
use tracing::error;
use uuid::Uuid;

const MAX_TTL_SECONDS: isize = 60 * 60;

#[derive(Constructor, Clone)]
pub struct RateLimitClient {
    redis_client: MultiplexedConnection,
    pg_client: Pool<Postgres>,
    emergency_mode: bool,
}

impl RateLimitClient {
    pub async fn apply_limits(
        &self,
        rate_limit_key: &RateLimitKey,
        key: &str,
        quotas: &[RateLimitQuota],
    ) -> APIResult<Option<RateLimitStatus>> {
        if quotas.is_empty() {
            return Ok(None);
        }

        // Validate the API key if it is present
        let api_key = match rate_limit_key.api_key {
            Some(key) => is_api_key_valid(&self.pg_client, key).await.then_some(key),
            None => None,
        };

        // If no api key, and there are no IP quotas, but there are key quotas, return an error
        if api_key.is_none()
            && !quotas.iter().any(|q| q.rate_limit_quota_type.is_ip())
            && quotas.iter().any(|q| q.rate_limit_quota_type.is_key())
        {
            return Err(APIError::StatusMsg {
                status: axum::http::StatusCode::FORBIDDEN,
                message: "API key is required for this endpoint".to_string(),
            });
        }

        // If the service is in emergency mode, only requests with an API key are allowed
        if self.emergency_mode && api_key.is_none() {
            return Err(APIError::StatusMsg {
                status: axum::http::StatusCode::SERVICE_UNAVAILABLE,
                message: "Service is in emergency mode".to_string(),
            });
        }

        let prefix = api_key
            .map(|k| k.to_string())
            .unwrap_or_else(|| rate_limit_key.ip.to_string());
        let increment_result = self.increment_key(&prefix, key).await;
        if let Err(e) = increment_result {
            error!("Failed to increment rate limit key: {e}, will not apply limits");
            return Ok(None);
        }

        // Check for custom quotas
        let quotas = match api_key {
            None => quotas.to_vec(),
            Some(api_key) => {
                let custom_quotas = get_custom_quotas(&self.pg_client, api_key, key).await;
                if custom_quotas.is_empty() {
                    let has_api_key_limits =
                        quotas.iter().any(|q| q.rate_limit_quota_type.is_key());
                    // Remove IP quotas if there are key quotas and api_key is present
                    quotas
                        .iter()
                        .filter(|q| !has_api_key_limits || !q.rate_limit_quota_type.is_ip())
                        .copied()
                        .collect()
                } else {
                    custom_quotas
                }
            }
        };
        let mut all_statuses = Vec::new();
        for quota in quotas {
            let prefixed_key = if quota.rate_limit_quota_type.is_global() {
                key
            } else {
                &format!("{prefix}:{key}")
            };
            let Ok((requests, oldest_request)) =
                self.check_requests(prefixed_key, quota.period).await
            else {
                error!("Failed to check rate limit key: {prefixed_key}, will not apply limits");
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
        &self,
        key: &str,
        period: Duration,
    ) -> RedisResult<(u32, DateTime<Utc>)> {
        let current_time = Utc::now().timestamp() as isize;
        let mut redis_conn = self.redis_client.clone();
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

    async fn increment_key(&self, prefix: &str, key: &str) -> RedisResult<()> {
        //! Increments the rate limit key in Redis.
        let current_time = Utc::now().timestamp() as isize;
        let prefixed_key = format!("{prefix}:{key}");
        let mut redis_conn = self.redis_client.clone();
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
}

// Helper functions outside the impl block since cached macros cannot be used directly on methods
#[cached(
    ty = "TimedCache<Uuid, bool>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    convert = "{ api_key }",
    sync_writes = "by_key",
    key = "Uuid"
)]
pub async fn is_api_key_valid(state: &Pool<Postgres>, api_key: Uuid) -> bool {
    sqlx::query!(
        "SELECT COUNT(*) FROM api_keys WHERE key = $1 AND disabled IS false",
        api_key
    )
    .fetch_one(state)
    .await
    .ok()
    .and_then(|row| row.count.map(|c| c > 0))
    .unwrap_or(false)
}

#[cached(
    ty = "TimedCache<String, Vec<RateLimitQuota>>",
    create = "{ TimedCache::with_lifespan(10 * 60) }",
    convert = r#"{ format!("{api_key}-{path}") }"#,
    sync_writes = "by_key",
    key = "String"
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
