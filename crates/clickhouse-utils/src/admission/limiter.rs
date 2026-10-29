use core::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use core::time::Duration;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use thiserror::Error;
use tokio::sync::Notify;
use tokio::time::Instant;

use crate::{is_memory_limit_exceeded, is_query_timeout};

/// The default slots of a fresh limiter, and the floor the default controller never goes below.
///
/// The defaults come from replaying a week of the API's production traffic (2026-10-06..13: every
/// guarded query and request, `PSI_CPU_some` per second, real timeouts) through this limiter, with
/// all traffic on one instance. With them no query outside the abusive bursts would have been
/// rejected. Top-of-hour polling bursts legitimately reach ~90 concurrent queries, and single
/// clients ~85 concurrent requests, so a lower floor or a smaller client share rejects legitimate
/// traffic.
pub(super) const DEFAULT_LIMIT: usize = 128;

/// How an [`Admission`] hands out slots.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AdmissionConfig {
    /// Slots of the fresh limiter; a controller adjusts them later.
    pub limit: usize,
    /// How long a query waits for a slot before it gives up with [`Busy::Timeout`].
    pub queue_timeout: Duration,
    /// At most this many waiters per slot; further queries are rejected right away.
    pub max_waiters_per_slot: usize,
    /// A capped [`Caller`] may hold at most `1 / max_client_share` of the slots.
    pub max_client_share: usize,
}

impl Default for AdmissionConfig {
    fn default() -> Self {
        Self {
            limit: DEFAULT_LIMIT,
            queue_timeout: Duration::from_secs(3),
            max_waiters_per_slot: 4,
            max_client_share: 2,
        }
    }
}

/// No query slot became free in time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum Busy {
    #[error("ClickHouse is busy: query queue is full")]
    QueueFull,
    #[error("ClickHouse is busy: no query slot became free in time")]
    Timeout,
}

impl Busy {
    const fn reason(self) -> &'static str {
        match self {
            Self::QueueFull => "queue_full",
            Self::Timeout => "timeout",
        }
    }
}

/// Who a query runs for: the per-caller slot count is keyed by `id`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Caller {
    pub id: Arc<str>,
    /// Whether the caller's share of the slots is capped
    /// ([`AdmissionConfig::max_client_share`]). Exempt callers are identified and limited
    /// elsewhere, such as API keys with their own rate limits.
    pub capped: bool,
}

impl Caller {
    pub fn new(id: impl Into<Arc<str>>, capped: bool) -> Self {
        Self {
            id: id.into(),
            capped,
        }
    }
}

/// Queries running and queued at one moment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Load {
    pub in_flight: usize,
    pub waiting: usize,
}

#[derive(Debug)]
struct State {
    limit: usize,
    load: Load,
    per_caller: HashMap<Arc<str>, usize>,
}

impl State {
    fn caller_cap(&self, max_client_share: usize) -> usize {
        self.limit.div_ceil(max_client_share.max(1)).max(1)
    }

    fn try_take(&mut self, caller: &Caller, max_client_share: usize) -> bool {
        let held = self.per_caller.get(&caller.id).copied().unwrap_or_default();
        if self.load.in_flight >= self.limit
            || (caller.capped && held >= self.caller_cap(max_client_share))
        {
            return false;
        }
        self.load.in_flight = self.load.in_flight.saturating_add(1);
        let held = self.per_caller.entry(Arc::clone(&caller.id)).or_default();
        *held = held.saturating_add(1);
        true
    }
}

/// Limits concurrent queries to an adjustable number of slots, at most a share of them per
/// capped caller, with a bounded queue of waiters.
#[derive(Debug)]
pub struct Admission {
    config: AdmissionConfig,
    state: Mutex<State>,
    notify: Notify,
    /// Some query had to wait or was rejected since the controller last looked.
    saturated: AtomicBool,
    /// Queries that hit a timeout or memory limit since the controller last looked.
    congestion_events: AtomicU64,
}

impl Default for Admission {
    fn default() -> Self {
        Self::new(AdmissionConfig::default())
    }
}

impl Admission {
    #[must_use]
    pub fn new(config: AdmissionConfig) -> Self {
        Self {
            config,
            state: Mutex::new(State {
                limit: config.limit,
                load: Load::default(),
                per_caller: HashMap::new(),
            }),
            notify: Notify::new(),
            saturated: AtomicBool::new(false),
            congestion_events: AtomicU64::new(0),
        }
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The current number of slots.
    pub fn limit(&self) -> usize {
        self.state().limit
    }

    /// Changes the number of slots. Queries above a lowered limit finish normally; new ones
    /// wait until enough of them did.
    pub fn set_limit(&self, limit: usize) {
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

    pub fn load(&self) -> Load {
        self.state().load
    }

    /// Whether some query had to wait or was rejected since the last call.
    pub(super) fn take_saturated(&self) -> bool {
        self.saturated.swap(false, Ordering::Relaxed)
    }

    /// Timeouts and memory-limit errors since the last call.
    pub(super) fn take_congestion_events(&self) -> u64 {
        self.congestion_events.swap(0, Ordering::Relaxed)
    }

    /// Takes a slot for `caller`, queueing up to [`AdmissionConfig::queue_timeout`] when none is
    /// free.
    pub async fn acquire(&self, caller: Caller) -> Result<Permit<'_>, Busy> {
        match self.acquire_inner(&caller).await {
            Ok(()) => Ok(Permit {
                admission: self,
                caller: caller.id,
            }),
            Err(busy) => {
                metrics::counter!("ch_admission_rejected", "reason" => busy.reason()).increment(1);
                Err(busy)
            }
        }
    }

    async fn acquire_inner(&self, caller: &Caller) -> Result<(), Busy> {
        let share = self.config.max_client_share;
        {
            let mut state = self.state();
            if state.try_take(caller, share) {
                return Ok(());
            }
            self.saturated.store(true, Ordering::Relaxed);
            let max_waiting = state.limit.saturating_mul(self.config.max_waiters_per_slot);
            if state.load.waiting >= max_waiting {
                return Err(Busy::QueueFull);
            }
            state.load.waiting = state.load.waiting.saturating_add(1);
        }
        let _waiting = WaitingGuard(self);
        let start = Instant::now();
        // Unrepresentable only far in the future; timing out at once then is the safe side.
        let deadline = start
            .checked_add(self.config.queue_timeout)
            .unwrap_or(start);
        loop {
            // Register for the wake-up before checking, so a release between the check and
            // the await is not missed.
            let notified = self.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self.state().try_take(caller, share) {
                metrics::histogram!("ch_admission_wait_seconds")
                    .record(start.elapsed().as_secs_f64());
                return Ok(());
            }
            if tokio::time::timeout_at(deadline, notified).await.is_err() {
                return Err(Busy::Timeout);
            }
        }
    }

    fn release(&self, caller: &Arc<str>) {
        {
            let mut state = self.state();
            state.load.in_flight = state.load.in_flight.saturating_sub(1);
            if let Some(held) = state.per_caller.get_mut(caller) {
                *held = held.saturating_sub(1);
                if *held == 0 {
                    state.per_caller.remove(caller);
                }
            }
        }
        // Wake every waiter: the one next in line may be capped by its caller's share.
        self.notify.notify_waiters();
    }
}

/// Counts a queued query out of the queue, also when it is dropped while waiting.
struct WaitingGuard<'a>(&'a Admission);

impl Drop for WaitingGuard<'_> {
    fn drop(&mut self) {
        let mut state = self.0.state();
        state.load.waiting = state.load.waiting.saturating_sub(1);
    }
}

/// A query slot, released when dropped.
#[derive(Debug)]
pub struct Permit<'a> {
    admission: &'a Admission,
    caller: Arc<str>,
}

impl Permit<'_> {
    /// Feeds a failed query's error back: timeouts and memory-limit errors mean `ClickHouse` is
    /// overloaded, so the controller lowers the limit on its next tick.
    pub fn observe(&self, error: &clickhouse::error::Error) {
        if is_query_timeout(error) || is_memory_limit_exceeded(error) {
            self.admission
                .congestion_events
                .fetch_add(1, Ordering::Relaxed);
        }
    }
}

impl Drop for Permit<'_> {
    fn drop(&mut self) {
        self.admission.release(&self.caller);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn admission(limit: usize) -> Admission {
        Admission::new(AdmissionConfig {
            limit,
            ..AdmissionConfig::default()
        })
    }

    fn caller(name: &str) -> Caller {
        Caller::new(name, true)
    }

    const fn load(in_flight: usize, waiting: usize) -> Load {
        Load { in_flight, waiting }
    }

    #[tokio::test(start_paused = true)]
    async fn waiter_gets_the_slot_on_release() {
        let admission = Arc::new(admission(1));
        let permit = admission.acquire(caller("a")).await.unwrap();
        let waiter = {
            let admission = Arc::clone(&admission);
            tokio::spawn(async move { admission.acquire(caller("b")).await.map(drop) })
        };
        tokio::time::sleep(Duration::from_secs(1)).await;
        assert_eq!(admission.load(), load(1, 1));
        drop(permit);
        assert_eq!(waiter.await.unwrap(), Ok(()));
        assert_eq!(admission.load(), load(0, 0));
        assert!(admission.take_saturated());
    }

    #[tokio::test(start_paused = true)]
    async fn waiter_times_out() {
        let admission = admission(1);
        let _permit = admission.acquire(caller("a")).await.unwrap();
        let start = Instant::now();
        assert_eq!(
            admission.acquire(caller("b")).await.unwrap_err(),
            Busy::Timeout
        );
        assert_eq!(start.elapsed(), AdmissionConfig::default().queue_timeout);
        assert_eq!(admission.load(), load(1, 0));
    }

    #[tokio::test(start_paused = true)]
    async fn full_queue_rejects_immediately() {
        let admission = Arc::new(admission(1));
        let max_waiters = AdmissionConfig::default().max_waiters_per_slot;
        let _permit = admission.acquire(caller("a")).await.unwrap();
        let waiters: Vec<_> = (0..max_waiters)
            .map(|i| {
                let admission = Arc::clone(&admission);
                tokio::spawn(
                    async move { admission.acquire(caller(&format!("w{i}"))).await.map(drop) },
                )
            })
            .collect();
        tokio::task::yield_now().await;
        assert_eq!(admission.load(), load(1, max_waiters));
        let start = Instant::now();
        assert_eq!(
            admission.acquire(caller("late")).await.unwrap_err(),
            Busy::QueueFull
        );
        assert_eq!(start.elapsed(), Duration::ZERO);
        for waiter in waiters {
            assert_eq!(waiter.await.unwrap(), Err(Busy::Timeout));
        }
    }

    #[tokio::test(start_paused = true)]
    async fn caller_share_is_capped() {
        // 4 slots: one caller may hold 2, others still get theirs.
        let admission = admission(4);
        let a1 = admission.acquire(caller("a")).await.unwrap();
        let _a2 = admission.acquire(caller("a")).await.unwrap();
        assert_eq!(
            admission.acquire(caller("a")).await.unwrap_err(),
            Busy::Timeout
        );
        let _b = admission.acquire(caller("b")).await.unwrap();
        drop(a1);
        let _a3 = admission.acquire(caller("a")).await.unwrap();
        assert_eq!(admission.load(), load(3, 0));
    }

    #[tokio::test(start_paused = true)]
    async fn uncapped_callers_may_take_every_slot() {
        let admission = admission(4);
        let key = Caller::new("key", false);
        let _permits = [
            admission.acquire(key.clone()).await.unwrap(),
            admission.acquire(key.clone()).await.unwrap(),
            admission.acquire(key.clone()).await.unwrap(),
            admission.acquire(key).await.unwrap(),
        ];
        assert_eq!(admission.load(), load(4, 0));
    }

    #[tokio::test(start_paused = true)]
    async fn raising_the_limit_wakes_waiters() {
        let admission = Arc::new(admission(1));
        let _permit = admission.acquire(caller("a")).await.unwrap();
        let waiter = {
            let admission = Arc::clone(&admission);
            tokio::spawn(async move { admission.acquire(caller("b")).await.map(drop) })
        };
        tokio::task::yield_now().await;
        admission.set_limit(2);
        assert_eq!(waiter.await.unwrap(), Ok(()));
    }

    #[tokio::test(start_paused = true)]
    async fn timeouts_count_as_congestion() {
        let admission = admission(1);
        let permit = admission.acquire(caller("a")).await.unwrap();
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
