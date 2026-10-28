use core::num::NonZeroU64;
use std::time::SystemTime;

use tracing::warn;

use crate::{Charge, Exceeded, Log, RateLimit, Scope, Status, Store, Window};

/// Counts requests against [`RateLimit`] policies in a [`Store`].
///
/// A subject's requests are kept under `{subject}:{bucket}`, shared counts under `{bucket}`. The
/// limiter fails open: when the store errors, the request is let through without limits.
#[derive(Debug, Clone, Default)]
pub struct RateLimiter<T> {
    store: T,
}

impl<T: Store> RateLimiter<T> {
    #[must_use]
    pub const fn new(store: T) -> Self {
        Self { store }
    }

    /// Counts a request by `client` against every quota of `limit`: [`Self::charge`] with a
    /// cost of 1.
    pub async fn check<S: Scope>(
        &self,
        client: &S::Client,
        limit: RateLimit<'_, S>,
    ) -> Result<Option<Status<S>>, Exceeded<S>> {
        self.charge(client, limit, NonZeroU64::MIN).await
    }

    /// Charges a request by `client` costing `cost` against every quota of `limit`, admitting it
    /// if it fits in all of them.
    ///
    /// The request counts against the client's subjects even when it is rejected, so a client
    /// that keeps retrying stays locked out; it only counts against shared quotas once it is
    /// admitted, so one client cannot use up everyone's budget.
    ///
    /// Returns the status of the quota with the least left, or `None` if `limit` has no quotas
    /// or the store failed.
    pub async fn charge<S: Scope>(
        &self,
        client: &S::Client,
        limit: RateLimit<'_, S>,
        cost: NonZeroU64,
    ) -> Result<Option<Status<S>>, Exceeded<S>> {
        self.charge_at(client, limit, cost, SystemTime::now()).await
    }

    /// [`Self::charge`] as of `now`.
    async fn charge_at<S: Scope>(
        &self,
        client: &S::Client,
        limit: RateLimit<'_, S>,
        cost: NonZeroU64,
        now: SystemTime,
    ) -> Result<Option<Status<S>>, Exceeded<S>> {
        if limit.quotas.is_empty() {
            return Ok(None);
        }

        // The key each quota counts in: its subject's, or the bucket's for shared quotas.
        let keys: Vec<Option<String>> = limit
            .quotas
            .iter()
            .map(|quota| {
                let subject = quota.scope.subject(client)?;
                Some(format!("{subject}:{}", limit.bucket))
            })
            .collect();

        // One log per subject and one shared by everyone, each kept as long as its longest window.
        let mut always: Vec<Log<'_>> = Vec::new();
        let mut shared: Vec<Log<'_>> = Vec::new();
        let mut windows = Vec::with_capacity(limit.quotas.len());
        for (quota, key) in limit.quotas.iter().zip(&keys) {
            let (logs, key) = key
                .as_deref()
                .map_or((&mut shared, limit.bucket), |key| (&mut always, key));
            match logs.iter_mut().find(|log| log.key == key) {
                Some(log) => log.retention = log.retention.max(quota.period),
                None => logs.push(Log {
                    key,
                    retention: quota.period,
                }),
            }
            windows.push(Window {
                key,
                period: quota.period,
                limit: quota.limit,
            });
        }

        let charge = Charge {
            cost,
            now,
            always: &always,
            windows: &windows,
            if_admitted: &shared,
        };
        let usages = match self.store.charge(charge).await {
            Ok(usages) => usages,
            Err(e) => {
                warn!(
                    bucket = limit.bucket,
                    "Failed to check rate limits, not applying them: {e}"
                );
                return Ok(None);
            }
        };

        let mut statuses = Vec::with_capacity(usages.len());
        for (&quota, usage) in limit.quotas.iter().zip(usages) {
            let status = Status::new(quota, usage, cost, now);
            if status.is_exceeded() {
                return Err(Exceeded(status));
            }
            statuses.push(status);
        }
        Ok(statuses.into_iter().min_by_key(Status::remaining))
    }
}
#[cfg(test)]
mod tests {
    use core::time::Duration;
    use std::borrow::Cow;

    use super::*;
    use crate::{MemoryStore, Quota, Usage};

    const MIN: Duration = Duration::from_mins(1);
    const ONE: NonZeroU64 = NonZeroU64::MIN;

    fn cost(cost: u64) -> NonZeroU64 {
        NonZeroU64::new(cost).unwrap()
    }

    /// Clients are `(address, account)` pairs.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum By {
        Address,
        Account,
        Everyone,
    }

    impl Scope for By {
        type Client = (&'static str, &'static str);

        fn subject<'c>(&self, &(address, account): &'c Self::Client) -> Option<Cow<'c, str>> {
            match self {
                Self::Address => Some(address.into()),
                Self::Account => Some(account.into()),
                Self::Everyone => None,
            }
        }
    }

    fn at(secs: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000 + secs)
    }

    #[tokio::test]
    async fn admits_exactly_the_limit_per_subject() {
        let limiter = RateLimiter::new(MemoryStore::new());
        let quotas = [Quota::new(By::Address, 2, MIN)];
        let limit = RateLimit::new("b", &quotas);
        let check = |client, secs| limiter.charge_at(client, limit, ONE, at(secs));
        assert_eq!(check(&("a", "x"), 0).await.unwrap().unwrap().remaining(), 2);
        assert_eq!(check(&("a", "y"), 1).await.unwrap().unwrap().remaining(), 1);
        let Exceeded(status) = check(&("a", "x"), 2).await.unwrap_err();
        assert_eq!(status.reset_at, at(60));
        // Other subjects have their own count, and the window slides.
        check(&("b", "x"), 2).await.unwrap();
        check(&("a", "x"), 61).await.unwrap();
    }

    #[tokio::test]
    async fn counts_each_scope_under_its_own_subject() {
        let limiter = RateLimiter::new(MemoryStore::new());
        let quotas = [
            Quota::new(By::Address, 2, MIN),
            Quota::new(By::Account, 1, MIN),
        ];
        let limit = RateLimit::new("b", &quotas);
        limiter
            .charge_at(&("a", "x"), limit, ONE, at(0))
            .await
            .unwrap();
        // Same account from another address: the account quota is used up.
        let Exceeded(status) = limiter
            .charge_at(&("b", "x"), limit, ONE, at(1))
            .await
            .unwrap_err();
        assert_eq!(status.quota.scope, By::Account);
        // Same address with another account: one address request is left.
        limiter
            .charge_at(&("a", "y"), limit, ONE, at(2))
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn rejected_requests_still_count_against_the_subject() {
        let limiter = RateLimiter::new(MemoryStore::new());
        let quotas = [Quota::new(By::Address, 1, MIN)];
        let limit = RateLimit::new("b", &quotas);
        limiter
            .charge_at(&("a", "x"), limit, ONE, at(0))
            .await
            .unwrap();
        limiter
            .charge_at(&("a", "x"), limit, ONE, at(30))
            .await
            .unwrap_err();
        // The first request left the window, the rejected one has not.
        limiter
            .charge_at(&("a", "x"), limit, ONE, at(61))
            .await
            .unwrap_err();
    }

    #[tokio::test]
    async fn charges_costs() {
        let limiter = RateLimiter::new(MemoryStore::new());
        let quotas = [
            Quota::new(By::Address, 10, MIN),
            Quota::new(By::Everyone, 25, MIN),
        ];
        let limit = RateLimit::new("b", &quotas);
        let charge = |client, n, secs| limiter.charge_at(client, limit, cost(n), at(secs));
        let status = charge(&("a", "x"), 6, 0).await.unwrap().unwrap();
        assert_eq!(status.quota.scope, By::Address);
        assert_eq!(status.remaining(), 10);
        // 6 + 5 does not fit in 10; the rejected request still counts against the address.
        let Exceeded(status) = charge(&("a", "x"), 5, 1).await.unwrap_err();
        assert_eq!((status.used, status.remaining()), (6, 4));
        charge(&("a", "x"), 1, 2).await.unwrap_err();
        // Only admitted costs count globally: 6 + 10 + 9 = 25 fits, 1 more does not.
        charge(&("b", "y"), 10, 3).await.unwrap();
        charge(&("c", "z"), 9, 4).await.unwrap();
        let Exceeded(status) = charge(&("d", "w"), 1, 5).await.unwrap_err();
        assert_eq!(status.quota.scope, By::Everyone);
    }

    #[tokio::test]
    async fn admits_exactly_the_shared_limit() {
        let limiter = RateLimiter::new(MemoryStore::new());
        let quotas = [Quota::new(By::Everyone, 2, MIN)];
        let limit = RateLimit::new("b", &quotas);
        limiter
            .charge_at(&("a", "x"), limit, ONE, at(0))
            .await
            .unwrap();
        limiter
            .charge_at(&("b", "y"), limit, ONE, at(1))
            .await
            .unwrap();
        limiter
            .charge_at(&("c", "z"), limit, ONE, at(2))
            .await
            .unwrap_err();
    }

    #[tokio::test]
    async fn rejected_requests_do_not_count_against_shared_quotas() {
        let limiter = RateLimiter::new(MemoryStore::new());
        let quotas = [
            Quota::new(By::Address, 1, MIN),
            Quota::new(By::Everyone, 2, MIN),
        ];
        let limit = RateLimit::new("b", &quotas);
        limiter
            .charge_at(&("a", "x"), limit, ONE, at(0))
            .await
            .unwrap();
        for secs in 1..10 {
            limiter
                .charge_at(&("a", "x"), limit, ONE, at(secs))
                .await
                .unwrap_err();
        }
        limiter
            .charge_at(&("b", "y"), limit, ONE, at(10))
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn returns_the_tightest_quota() {
        let limiter = RateLimiter::new(MemoryStore::new());
        let quotas = [
            Quota::new(By::Address, 5, MIN),
            Quota::new(By::Everyone, 3, MIN),
        ];
        let limit = RateLimit::new("b", &quotas);
        let status = limiter
            .charge_at(&("a", "x"), limit, ONE, at(0))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(status.quota, Quota::new(By::Everyone, 3, MIN));
    }

    #[tokio::test]
    async fn buckets_are_independent() {
        let limiter = RateLimiter::new(MemoryStore::new());
        let quotas = [Quota::new(By::Address, 1, MIN)];
        let limit = RateLimit::new("b", &quotas);
        limiter
            .charge_at(&("a", "x"), limit, ONE, at(0))
            .await
            .unwrap();
        limiter
            .charge_at(&("a", "x"), limit.with_bucket("c"), ONE, at(0))
            .await
            .unwrap();
    }

    struct Broken;

    #[derive(Debug, thiserror::Error)]
    #[error("broken")]
    struct BrokenError;

    impl Store for Broken {
        type Error = BrokenError;

        fn charge(
            &self,
            _: Charge<'_>,
        ) -> impl Future<Output = Result<Vec<Usage>, BrokenError>> + Send {
            core::future::ready(Err(BrokenError))
        }
    }

    #[tokio::test]
    async fn fails_open() {
        let limiter = RateLimiter::new(Broken);
        let quotas = [Quota::new(By::Address, 0, MIN)];
        let limit = RateLimit::new("b", &quotas);
        assert_eq!(limiter.check(&("a", "x"), limit).await, Ok(None));
    }
}
