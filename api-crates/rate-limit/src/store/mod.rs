use core::error::Error;
use core::num::NonZeroU64;
use core::time::Duration;
use std::time::SystemTime;

mod memory;
#[cfg(feature = "redis")]
mod redis_store;

pub use memory::MemoryStore;
#[cfg(feature = "redis")]
pub use redis_store::RedisStore;

/// A key a request is recorded under, kept for `retention`, the longest window read from it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Log<'a> {
    pub key: &'a str,
    pub retention: Duration,
}

/// At most `limit` cost under `key` within `period` of now: a request exactly `period` old has
/// left the window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Window<'a> {
    pub key: &'a str,
    pub period: Duration,
    pub limit: u64,
}

/// One request to charge.
///
/// The request is recorded in `always` first, so a client that keeps retrying stays locked out.
/// It is admitted if, without it, every window has room for `cost` more, and only then is it
/// recorded in `if_admitted`, so a rejected request does not use up a shared budget.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Charge<'a> {
    pub cost: NonZeroU64,
    pub now: SystemTime,
    pub always: &'a [Log<'a>],
    pub windows: &'a [Window<'a>],
    pub if_admitted: &'a [Log<'a>],
}

/// What a [`Window`] held before the request.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Usage {
    /// The summed cost of the other requests in the window.
    pub used: u64,
    /// The oldest request in the window, `None` when it is empty.
    pub oldest: Option<SystemTime>,
}

impl Usage {
    /// Whether `cost` more fits in `window`.
    #[must_use]
    pub const fn fits(&self, window: &Window<'_>, cost: NonZeroU64) -> bool {
        self.used.saturating_add(cost.get()) <= window.limit
    }
}

/// Where requests are recorded and counted.
pub trait Store: Send + Sync {
    type Error: Error + Send + Sync + 'static;

    /// Records and admits `charge` as one atomic step where the backend allows. Returns one
    /// [`Usage`] per window.
    fn charge(
        &self,
        charge: Charge<'_>,
    ) -> impl Future<Output = Result<Vec<Usage>, Self::Error>> + Send;
}

/// Behaviour every [`Store`] must share, run against each implementation.
#[cfg(test)]
pub(crate) mod conformance {
    use core::num::NonZeroU64;
    use core::time::Duration;
    use std::time::SystemTime;

    use super::{Charge, Log, Store, Usage, Window};

    const RETENTION: Duration = Duration::from_mins(2);

    fn at(secs: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000 + secs)
    }

    fn log(key: &str) -> Log<'_> {
        Log {
            key,
            retention: RETENTION,
        }
    }

    fn window(key: &str, secs: u64, limit: u64) -> Window<'_> {
        Window {
            key,
            period: Duration::from_secs(secs),
            limit,
        }
    }

    async fn charge<S: Store>(
        store: &S,
        cost: u64,
        secs: u64,
        always: &[Log<'_>],
        windows: &[Window<'_>],
        if_admitted: &[Log<'_>],
    ) -> Vec<Usage> {
        store
            .charge(Charge {
                cost: NonZeroU64::new(cost).unwrap(),
                now: at(secs),
                always,
                windows,
                if_admitted,
            })
            .await
            .unwrap()
    }

    /// Runs the checks on keys starting with `prefix`, which must not exist yet.
    pub(crate) async fn check<S: Store>(store: &S, prefix: &str) {
        let own = format!("{prefix}:own");
        let shared = format!("{prefix}:shared");
        let (own, shared) = (own.as_str(), shared.as_str());
        let open = u64::MAX;

        // The request itself is not counted in its own windows.
        let usages = charge(store, 3, 0, &[log(own)], &[window(own, 60, open)], &[]).await;
        assert_eq!(usages, [Usage::default()]);

        charge(store, 4, 30, &[log(own)], &[], &[]).await;
        let usages = charge(
            store,
            5,
            50,
            &[log(own)],
            &[
                window(own, 60, open),
                window(own, 30, open),
                window(shared, 60, open),
            ],
            &[],
        )
        .await;
        assert_eq!(usages[0].used, 7);
        assert_eq!(usages[0].oldest, Some(at(0)));
        // The window starts 20 s in: the request at 30 s.
        assert_eq!(usages[1].used, 4);
        assert_eq!(usages[1].oldest, Some(at(30)));
        assert_eq!(usages[2], Usage::default());

        // Requests at the same time are all kept.
        charge(store, 1, 50, &[log(own)], &[], &[]).await;
        let usages = charge(store, 1, 50, &[log(own)], &[window(own, 10, open)], &[]).await;
        assert_eq!(usages[0].used, 6);

        // A request that fits is recorded in the shared log, one that does not fit is not.
        let fits = [window(own, 60, open), window(shared, 60, 2)];
        charge(store, 2, 51, &[log(own)], &fits, &[log(shared)]).await;
        let usages = charge(store, 1, 52, &[log(own)], &fits, &[log(shared)]).await;
        assert_eq!(usages[1].used, 2);
        let usages = charge(store, 1, 53, &[], &[window(shared, 60, open)], &[]).await;
        assert_eq!(usages[0].used, 2);

        // Past the retention of two minutes, only the requests at 30 s and later remain.
        let usages = charge(store, 1, 140, &[log(own)], &[window(own, 120, open)], &[]).await;
        assert_eq!(usages[0].used, 4 + 5 + 1 + 1 + 2 + 1);
        assert_eq!(usages[0].oldest, Some(at(30)));
    }
}
