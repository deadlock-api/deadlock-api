use core::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use core::time::Duration;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use thiserror::Error;
use tokio::sync::Notify;
use tokio::time::Instant;

// The limits come from replaying a week of production traffic (2026-10-06..13: every guarded
// query and request, PSI_CPU_some per second, real timeouts) through this limiter. Caddy sends
// all traffic to one instance (`lb_policy first`), so one instance must carry it all. With
// these values no query outside the abusive bursts would have been rejected. Top-of-hour
// polling bursts legitimately reach ~90 concurrent queries, and single clients ~85 concurrent
// requests, so a lower floor or a smaller client share rejects legitimate traffic.

/// Slots of a fresh limiter, and the floor the controller never goes below.
pub(super) const MIN_LIMIT: usize = 128;
/// How long a query waits for a slot before it gives up with [`Busy::Timeout`].
const QUEUE_TIMEOUT: Duration = Duration::from_secs(3);
/// At most this many waiters per slot; further queries are rejected right away.
const MAX_WAITERS_PER_SLOT: usize = 4;
/// A client without a valid API key may hold at most `1 / MAX_CLIENT_SHARE` of the slots. API keys
/// are exempt: they are identified and have their own rate limits.
const MAX_CLIENT_SHARE: usize = 2;

/// No query slot became free in time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub(crate) enum Busy {
    #[error("ClickHouse is busy: query queue is full")]
    QueueFull,
    #[error("ClickHouse is busy: no query slot became free in time")]
    Timeout,
}

impl Busy {
    fn reason(self) -> &'static str {
        match self {
            Self::QueueFull => "queue_full",
            Self::Timeout => "timeout",
        }
    }
}

#[derive(Debug)]
struct State {
    limit: usize,
    in_flight: usize,
    waiting: usize,
    per_client: HashMap<Arc<str>, usize>,
}

impl State {
    fn client_cap(&self) -> usize {
        self.limit.div_ceil(MAX_CLIENT_SHARE).max(1)
    }

    fn try_take(&mut self, client: &ChClient) -> bool {
        let held = self.per_client.get(&client.id).copied().unwrap_or_default();
        if self.in_flight >= self.limit || (client.capped && held >= self.client_cap()) {
            return false;
        }
        self.in_flight += 1;
        *self.per_client.entry(Arc::clone(&client.id)).or_default() += 1;
        true
    }
}

/// Limits concurrent queries to an adjustable number of slots, at most a share of them per
/// client, with a bounded queue of waiters.
#[derive(Debug)]
pub(crate) struct ChAdmission {
    state: Mutex<State>,
    notify: Notify,
    /// Some query had to wait or was rejected since the controller last looked.
    saturated: AtomicBool,
    /// Queries that hit a timeout or memory limit since the controller last looked.
    congestion_events: AtomicU64,
}

impl Default for ChAdmission {
    fn default() -> Self {
        Self::new(MIN_LIMIT)
    }
}

/// Who a query runs for: the per-client slot count is keyed by `id`.
#[derive(Debug, Clone)]
pub(crate) struct ChClient {
    pub(crate) id: Arc<str>,
    /// Whether the client's share of the slots is capped (it is unless it has a valid API key).
    pub(crate) capped: bool,
}

impl ChAdmission {
    pub(super) fn new(limit: usize) -> Self {
        Self {
            state: Mutex::new(State {
                limit,
                in_flight: 0,
                waiting: 0,
                per_client: HashMap::new(),
            }),
            notify: Notify::new(),
            saturated: AtomicBool::new(false),
            congestion_events: AtomicU64::new(0),
        }
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub(super) fn limit(&self) -> usize {
        self.state().limit
    }

    /// Changes the number of slots. Queries above a lowered limit finish normally; new ones
    /// wait until enough of them did.
    pub(super) fn set_limit(&self, limit: usize) {
        let raised = {
            let mut state = self.state();
            let raised = limit > state.limit;
            state.limit = limit;
            raised
        };
        if raised {
            self.notify.notify_waiters();
        }
    }

    /// `(in_flight, waiting)`, for metrics.
    pub(super) fn load(&self) -> (usize, usize) {
        let state = self.state();
        (state.in_flight, state.waiting)
    }

    /// Whether some query had to wait or was rejected since the last call.
    pub(super) fn take_saturated(&self) -> bool {
        self.saturated.swap(false, Ordering::Relaxed)
    }

    /// Timeouts and memory-limit errors since the last call.
    pub(super) fn take_congestion_events(&self) -> u64 {
        self.congestion_events.swap(0, Ordering::Relaxed)
    }

    /// Takes a slot for `client`, queueing up to [`QUEUE_TIMEOUT`] when none is free.
    pub(crate) async fn acquire(&self, client: ChClient) -> Result<ChPermit<'_>, Busy> {
        let result = self.acquire_inner(&client).await;
        match result {
            Ok(()) => Ok(ChPermit {
                admission: self,
                client: client.id,
            }),
            Err(busy) => {
                metrics::counter!("ch_admission_rejected", "reason" => busy.reason()).increment(1);
                Err(busy)
            }
        }
    }

    async fn acquire_inner(&self, client: &ChClient) -> Result<(), Busy> {
        {
            let mut state = self.state();
            if state.try_take(client) {
                return Ok(());
            }
            self.saturated.store(true, Ordering::Relaxed);
            if state.waiting >= state.limit * MAX_WAITERS_PER_SLOT {
                return Err(Busy::QueueFull);
            }
            state.waiting += 1;
        }
        let _waiting = WaitingGuard(self);
        let start = Instant::now();
        let deadline = start + QUEUE_TIMEOUT;
        loop {
            // Register for the wake-up before checking, so a release between the check and
            // the await is not missed.
            let notified = self.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self.state().try_take(client) {
                metrics::histogram!("ch_admission_wait_seconds")
                    .record(start.elapsed().as_secs_f64());
                return Ok(());
            }
            if tokio::time::timeout_at(deadline, notified).await.is_err() {
                return Err(Busy::Timeout);
            }
        }
    }

    fn release(&self, client: &Arc<str>) {
        {
            let mut state = self.state();
            state.in_flight = state.in_flight.saturating_sub(1);
            if let Some(held) = state.per_client.get_mut(client) {
                *held -= 1;
                if *held == 0 {
                    state.per_client.remove(client);
                }
            }
        }
        // Wake every waiter: the one next in line may be capped by its client share.
        self.notify.notify_waiters();
    }
}

/// Counts a queued query out of the queue, also when its request is dropped while waiting.
struct WaitingGuard<'a>(&'a ChAdmission);

impl Drop for WaitingGuard<'_> {
    fn drop(&mut self) {
        let mut state = self.0.state();
        state.waiting = state.waiting.saturating_sub(1);
    }
}

/// A query slot, released when dropped.
#[derive(Debug)]
pub(crate) struct ChPermit<'a> {
    admission: &'a ChAdmission,
    client: Arc<str>,
}

impl ChPermit<'_> {
    /// Feeds a failed query's error back: timeouts and memory-limit errors mean `ClickHouse` is
    /// overloaded, so the controller lowers the limit on its next tick.
    pub(crate) fn observe(&self, error: &clickhouse::error::Error) {
        let congested = crate::error::is_query_timeout(error)
            || matches!(error, clickhouse::error::Error::BadResponse(msg) if msg.contains("MEMORY_LIMIT_EXCEEDED"));
        if congested {
            self.admission
                .congestion_events
                .fetch_add(1, Ordering::Relaxed);
        }
    }
}

impl Drop for ChPermit<'_> {
    fn drop(&mut self) {
        self.admission.release(&self.client);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client(name: &str) -> ChClient {
        ChClient {
            id: Arc::from(name),
            capped: true,
        }
    }

    #[tokio::test(start_paused = true)]
    async fn waiter_gets_the_slot_on_release() {
        let admission = Arc::new(ChAdmission::new(1));
        let permit = admission.acquire(client("a")).await.unwrap();
        let waiter = {
            let admission = Arc::clone(&admission);
            tokio::spawn(async move { admission.acquire(client("b")).await.map(drop) })
        };
        tokio::time::sleep(Duration::from_secs(1)).await;
        assert_eq!(admission.load(), (1, 1));
        drop(permit);
        assert_eq!(waiter.await.unwrap(), Ok(()));
        assert_eq!(admission.load(), (0, 0));
        assert!(admission.take_saturated());
    }

    #[tokio::test(start_paused = true)]
    async fn waiter_times_out() {
        let admission = ChAdmission::new(1);
        let _permit = admission.acquire(client("a")).await.unwrap();
        let start = Instant::now();
        assert_eq!(
            admission.acquire(client("b")).await.unwrap_err(),
            Busy::Timeout
        );
        assert_eq!(start.elapsed(), QUEUE_TIMEOUT);
        assert_eq!(admission.load(), (1, 0));
    }

    #[tokio::test(start_paused = true)]
    async fn full_queue_rejects_immediately() {
        let admission = Arc::new(ChAdmission::new(1));
        let _permit = admission.acquire(client("a")).await.unwrap();
        let waiters: Vec<_> = (0..MAX_WAITERS_PER_SLOT)
            .map(|i| {
                let admission = Arc::clone(&admission);
                tokio::spawn(
                    async move { admission.acquire(client(&format!("w{i}"))).await.map(drop) },
                )
            })
            .collect();
        tokio::task::yield_now().await;
        assert_eq!(admission.load(), (1, MAX_WAITERS_PER_SLOT));
        let start = Instant::now();
        assert_eq!(
            admission.acquire(client("late")).await.unwrap_err(),
            Busy::QueueFull
        );
        assert_eq!(start.elapsed(), Duration::ZERO);
        for waiter in waiters {
            assert_eq!(waiter.await.unwrap(), Err(Busy::Timeout));
        }
    }

    #[tokio::test(start_paused = true)]
    async fn client_share_is_capped() {
        // 4 slots: one client may hold 2, others still get theirs.
        let admission = ChAdmission::new(4);
        let a1 = admission.acquire(client("a")).await.unwrap();
        let _a2 = admission.acquire(client("a")).await.unwrap();
        assert_eq!(
            admission.acquire(client("a")).await.unwrap_err(),
            Busy::Timeout
        );
        let _b = admission.acquire(client("b")).await.unwrap();
        drop(a1);
        let _a3 = admission.acquire(client("a")).await.unwrap();
        assert_eq!(admission.load(), (3, 0));
    }

    #[tokio::test(start_paused = true)]
    async fn api_keys_are_not_capped() {
        let admission = ChAdmission::new(4);
        let key = ChClient {
            id: Arc::from("key"),
            capped: false,
        };
        let _permits = [
            admission.acquire(key.clone()).await.unwrap(),
            admission.acquire(key.clone()).await.unwrap(),
            admission.acquire(key.clone()).await.unwrap(),
            admission.acquire(key).await.unwrap(),
        ];
        assert_eq!(admission.load(), (4, 0));
    }

    #[tokio::test(start_paused = true)]
    async fn raising_the_limit_wakes_waiters() {
        let admission = Arc::new(ChAdmission::new(1));
        let _permit = admission.acquire(client("a")).await.unwrap();
        let waiter = {
            let admission = Arc::clone(&admission);
            tokio::spawn(async move { admission.acquire(client("b")).await.map(drop) })
        };
        tokio::task::yield_now().await;
        admission.set_limit(2);
        assert_eq!(waiter.await.unwrap(), Ok(()));
    }

    #[tokio::test(start_paused = true)]
    async fn timeouts_count_as_congestion() {
        let admission = ChAdmission::new(1);
        let permit = admission.acquire(client("a")).await.unwrap();
        permit.observe(&clickhouse::error::Error::BadResponse(
            "Code: 159. DB::Exception: Timeout exceeded (TIMEOUT_EXCEEDED)".to_owned(),
        ));
        permit.observe(&clickhouse::error::Error::BadResponse(
            "Code: 47. DB::Exception: Unknown identifier".to_owned(),
        ));
        assert_eq!(admission.take_congestion_events(), 1);
        assert_eq!(admission.take_congestion_events(), 0);
    }
}
