use core::num::NonZeroU64;
use core::time::Duration;
use std::borrow::Cow;

use axum::http::StatusCode;
use cached::macros::cached;
use rate_limit::{RateLimiter, RedisStore};
use redis::aio::ConnectionManager;
use sqlx::postgres::types::PgInterval;
use sqlx::{Pool, Postgres};
use tracing::warn;
use uuid::Uuid;

use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Quota, RateLimit, Scope, Status};

/// Applies [`RateLimit`] policies to API clients, shared across replicas through Redis.
#[derive(Clone)]
pub(crate) struct RateLimitClient {
    limiter: RateLimiter<RedisStore>,
    pg_client: Pool<Postgres>,
    emergency_mode: bool,
}

impl RateLimitClient {
    pub(crate) const fn new(
        redis_client: ConnectionManager,
        pg_client: Pool<Postgres>,
        emergency_mode: bool,
    ) -> Self {
        Self {
            limiter: RateLimiter::new(RedisStore::new(redis_client)),
            pg_client,
            emergency_mode,
        }
    }

    /// Counts a request by `client` against `limit`: [`Self::charge`] with a cost of 1.
    pub(crate) async fn check(
        &self,
        client: &RateLimitKey,
        limit: RateLimit<'_>,
    ) -> APIResult<Option<Status>> {
        self.charge(client, limit, NonZeroU64::MIN).await
    }

    /// Charges a request by `client` costing `cost` against `limit`.
    ///
    /// An API key must be valid, and its custom quotas for the bucket (`api_key_limits`) replace
    /// the policy's. Clients without a key are turned away from key-only policies and while the
    /// service is in emergency mode.
    ///
    /// Returns the status of the tightest quota, `None` when no limits were applied.
    pub(crate) async fn charge(
        &self,
        client: &RateLimitKey,
        limit: RateLimit<'_>,
        cost: NonZeroU64,
    ) -> APIResult<Option<Status>> {
        let quotas: Cow<'_, [Quota]> = match client.api_key {
            Some(api_key) => {
                self.validate_api_key(api_key).await?;
                let custom = self
                    .get_custom_quotas(api_key, limit.bucket)
                    .await
                    .unwrap_or_else(|e| {
                        warn!("Failed to fetch custom quotas due to DB error: {e}, using defaults");
                        Vec::new()
                    });
                if custom.is_empty() {
                    keyed_client_quotas(limit.quotas).collect()
                } else {
                    custom.into()
                }
            }
            None if requires_key(limit.quotas) => {
                count_denial("key_required");
                return Err(APIError::status_msg(
                    StatusCode::FORBIDDEN,
                    "API key is required for this endpoint",
                ));
            }
            None if self.emergency_mode => {
                count_denial("emergency_mode");
                return Err(APIError::status_msg(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Service is in emergency mode",
                ));
            }
            None => limit.quotas.into(),
        };

        let limit = RateLimit::new(limit.bucket, &quotas);
        Ok(self.limiter.charge(client, limit, cost).await?)
    }

    async fn validate_api_key(&self, api_key: Uuid) -> APIResult<()> {
        match self.is_api_key_valid(api_key).await {
            Ok(true) => Ok(()),
            Ok(false) => {
                count_denial("invalid_key");
                Err(APIError::status_msg(
                    StatusCode::FORBIDDEN,
                    "Invalid API key",
                ))
            }
            Err(e) => {
                warn!("Failed to validate API key due to DB error: {e}, failing open");
                Ok(())
            }
        }
    }

    #[cached(
        max_size = 10_000,
        ttl_secs = 3600,
        convert = "{ api_key }",
        key = "Uuid",
        in_impl = true
    )]
    pub(crate) async fn is_api_key_valid(&self, api_key: Uuid) -> Result<bool, sqlx::Error> {
        let row = sqlx::query!(
            "SELECT COUNT(*) FROM api_keys WHERE key = $1 AND disabled IS false",
            api_key
        )
        .fetch_one(&self.pg_client)
        .await?;
        Ok(row.count.is_some_and(|c| c > 0))
    }

    #[cached(
        max_size = 10_000,
        ttl_secs = 600,
        convert = r#"{ format!("{api_key}-{bucket}") }"#,
        key = "String",
        in_impl = true
    )]
    async fn get_custom_quotas(
        &self,
        api_key: Uuid,
        bucket: &str,
    ) -> Result<Vec<Quota>, sqlx::Error> {
        let rows = sqlx::query!(
            "SELECT rate_limit, rate_period FROM api_key_limits WHERE key = $1 AND path = $2",
            api_key,
            bucket
        )
        .fetch_all(&self.pg_client)
        .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let limit = u64::try_from(row.rate_limit).ok()?;
                Some(Quota::new(
                    Scope::Key,
                    limit,
                    interval_duration(&row.rate_period)?,
                ))
            })
            .collect())
    }
}

/// Counts a request turned away before any quota was checked.
fn count_denial(reason: &'static str) {
    metrics::counter!("rate_limit_denied", "reason" => reason).increment(1);
}

fn has(quotas: &[Quota], scope: Scope) -> bool {
    quotas.iter().any(|q| q.scope == scope)
}

/// Whether only clients with an API key are admitted: key quotas but no IP quotas.
fn requires_key(quotas: &[Quota]) -> bool {
    has(quotas, Scope::Key) && !has(quotas, Scope::Ip)
}

/// The quotas a client with an API key is held to: key quotas replace IP quotas if there are any.
fn keyed_client_quotas(quotas: &[Quota]) -> impl Iterator<Item = Quota> {
    let skip_ip = has(quotas, Scope::Key);
    quotas
        .iter()
        .filter(move |q| !(skip_ip && q.scope == Scope::Ip))
        .copied()
}

/// A Postgres interval as a duration, counting days as 24 hours. `None` for negative intervals
/// and intervals with months, which have no fixed length.
fn interval_duration(interval: &PgInterval) -> Option<Duration> {
    if interval.months != 0 {
        return None;
    }
    let days = u64::try_from(interval.days).ok()?;
    let micros = u64::try_from(interval.microseconds).ok()?;
    Duration::from_secs(days.checked_mul(86_400)?).checked_add(Duration::from_micros(micros))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: Duration = Duration::from_mins(1);

    fn scopes(quotas: impl Iterator<Item = Quota>) -> Vec<Scope> {
        quotas.map(|q| q.scope).collect()
    }

    #[test]
    fn key_quotas_replace_ip_quotas_for_keyed_clients() {
        let quotas = [
            Quota::new(Scope::Ip, 1, MIN),
            Quota::new(Scope::Key, 2, MIN),
            Quota::new(Scope::Global, 3, MIN),
        ];
        assert_eq!(
            scopes(keyed_client_quotas(&quotas)),
            [Scope::Key, Scope::Global]
        );
        assert!(!requires_key(&quotas));

        let quotas = [
            Quota::new(Scope::Ip, 1, MIN),
            Quota::new(Scope::Global, 3, MIN),
        ];
        assert_eq!(
            scopes(keyed_client_quotas(&quotas)),
            [Scope::Ip, Scope::Global]
        );
    }

    #[test]
    fn key_only_policies_require_a_key() {
        assert!(requires_key(&[
            Quota::new(Scope::Key, 2, MIN),
            Quota::new(Scope::Global, 3, MIN)
        ]));
        assert!(!requires_key(&[Quota::new(Scope::Global, 3, MIN)]));
    }

    #[test]
    fn interval_durations() {
        let interval = |months, days, microseconds| PgInterval {
            months,
            days,
            microseconds,
        };
        assert_eq!(
            interval_duration(&interval(0, 0, 60_000_000)),
            Some(Duration::from_mins(1))
        );
        assert_eq!(
            interval_duration(&interval(0, 1, 3_600_000_000)),
            Some(Duration::from_hours(25))
        );
        assert_eq!(interval_duration(&interval(1, 0, 0)), None);
        assert_eq!(interval_duration(&interval(0, 0, -1)), None);
    }
}
