//! Batched key lookups: concurrent callers' keys are collected into one `IN (...)` query.

use core::fmt;
use core::hash::Hash;
use core::marker::PhantomData;
use core::sync::atomic::{AtomicU64, Ordering};
use core::time::Duration;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use clickhouse::query::Query;
use clickhouse::{QuerySummary, RowOwned, RowRead};
use metrics::{counter, gauge, histogram};
use tokio::sync::{Semaphore, mpsc, oneshot};
use tracing::{debug, warn};

/// Render a comma-separated list of keys for use inside a SQL `IN (...)` clause.
pub fn in_clause<K: fmt::Display>(keys: &[K]) -> String {
    let mut out = String::new();
    for (i, key) in keys.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        _ = fmt::Write::write_fmt(&mut out, format_args!("{key}"));
    }
    out
}

/// Why a batched lookup failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum BatchError {
    /// The batcher's task is gone.
    #[error("Batcher unavailable")]
    Unavailable,
    /// The batch query failed; it is logged once for the whole batch.
    #[error("Batch query failed")]
    QueryFailed,
    /// [`ClickhouseBatcher::load`] found no row for the key.
    #[error("Not found")]
    NotFound,
}

type BatchResult<T> = Result<T, BatchError>;

/// What a batch query cost `ClickHouse`, or the share of it one lookup is charged.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct BatchCost {
    /// The batch queries the lookups ran in.
    pub queries: u64,
    pub elapsed_ns: u64,
    pub read_rows: u64,
    pub read_bytes: u64,
    /// The highest peak memory of the batch queries, unsplit: it can't be divided among the
    /// lookups a query served.
    pub peak_memory_bytes: u64,
}

impl BatchCost {
    fn from_summary(summary: Option<&QuerySummary>) -> Self {
        let value = |get: fn(&QuerySummary) -> Option<u64>| summary.and_then(get).unwrap_or(0);
        Self {
            queries: 1,
            elapsed_ns: value(QuerySummary::elapsed_ns),
            read_rows: value(QuerySummary::read_rows),
            read_bytes: value(QuerySummary::read_bytes),
            peak_memory_bytes: value(QuerySummary::memory_usage),
        }
    }

    /// The share of waiter `index` of `waiters`: the summed costs split evenly, the remainders
    /// going one unit each to the first waiters, so the shares add up to the whole.
    fn share(self, index: u64, waiters: u64) -> Self {
        let split = |total: u64| {
            let quotient = total.checked_div(waiters).unwrap_or(total);
            let remainder = total.checked_rem(waiters).unwrap_or(0);
            quotient.saturating_add(u64::from(index < remainder))
        };
        Self {
            queries: self.queries,
            elapsed_ns: split(self.elapsed_ns),
            read_rows: split(self.read_rows),
            read_bytes: split(self.read_bytes),
            peak_memory_bytes: self.peak_memory_bytes,
        }
    }

    fn add(self, other: Self) -> Self {
        Self {
            queries: self.queries.saturating_add(other.queries),
            elapsed_ns: self.elapsed_ns.saturating_add(other.elapsed_ns),
            read_rows: self.read_rows.saturating_add(other.read_rows),
            read_bytes: self.read_bytes.saturating_add(other.read_bytes),
            peak_memory_bytes: self.peak_memory_bytes.max(other.peak_memory_bytes),
        }
    }
}

static COST_HOOK: OnceLock<fn(BatchCost)> = OnceLock::new();

/// Registers `hook` to receive each load's share of its batch queries' cost.
///
/// It runs in the task that called the load, after the rows came back, so it can record into the
/// caller's task-locals. The first registration wins; later ones are ignored.
pub fn set_batch_cost_hook(hook: fn(BatchCost)) {
    _ = COST_HOOK.set(hook);
}

/// Hands the cost of one load to the hook. Shares from the same batch query count it once.
fn report_cost(shares: &[Share]) {
    let Some(hook) = COST_HOOK.get() else {
        return;
    };
    let mut batches: Vec<u64> = Vec::with_capacity(shares.len());
    let mut cost = BatchCost::default();
    for share in shares {
        let mut share_cost = share.cost;
        if batches.contains(&share.batch) {
            share_cost.queries = 0;
        } else {
            batches.push(share.batch);
        }
        cost = cost.add(share_cost);
    }
    if cost.queries > 0 {
        hook(cost);
    }
}

/// One waiter's share of the batch query that served it.
#[derive(Debug, Clone, Copy)]
struct Share {
    /// Tells apart the batch queries of a [`ClickhouseBatcher::load_many`].
    batch: u64,
    cost: BatchCost,
}

/// The rows of one key, and the waiter's share of the query's cost.
struct Served<V> {
    rows: Vec<V>,
    share: Share,
}

static NEXT_BATCH: AtomicU64 = AtomicU64::new(0);

/// Runs `query` to the end, so its summary covers the whole query rather than the progress up to
/// the first output block: `ClickHouse` sends the summary header before the body.
async fn fetch_all_with_cost<T: RowOwned + RowRead>(
    query: Query,
) -> clickhouse::error::Result<(Vec<T>, BatchCost)> {
    let mut cursor = query.with_setting("wait_end_of_query", "1").fetch::<T>()?;
    let mut rows = Vec::new();
    while let Some(row) = cursor.next().await? {
        rows.push(row);
    }
    Ok((rows, BatchCost::from_summary(cursor.summary())))
}

pub trait BatchQuery: Send + Sync + 'static {
    type Key: Hash + Eq + Clone + Send + Sync + 'static;
    type Value: RowOwned + RowRead + serde::de::DeserializeOwned + Clone + Send + Sync;

    fn build_query(keys: &[Self::Key]) -> String;
    fn key_of(value: &Self::Value) -> Self::Key;

    /// How long an idle batcher waits for more keys before sending the first one. Only worth
    /// setting for callers that enqueue many keys at the same instant (GraphQL resolvers);
    /// under load, batches form while earlier queries run (see `MAX_IN_FLIGHT`).
    #[must_use]
    fn linger_ms() -> u64 {
        0
    }
    #[must_use]
    fn max_batch_size() -> usize {
        1000
    }
}

pub trait BatchQueryMulti: Send + Sync + 'static {
    type Key: Hash + Eq + Clone + Send + Sync + 'static;
    type Value: RowOwned + RowRead + serde::de::DeserializeOwned + Clone + Send + Sync;

    fn build_query(keys: &[Self::Key]) -> String;
    fn key_of(value: &Self::Value) -> Self::Key;

    /// See [`BatchQuery::linger_ms`].
    #[must_use]
    fn linger_ms() -> u64 {
        0
    }
    #[must_use]
    fn max_batch_size() -> usize {
        1000
    }
}

pub trait BatchQueryGrouped: Send + Sync + 'static {
    type Key: Hash + Eq + Clone + Send + Sync + 'static;
    type Group: Hash + Eq + Clone + Send + Sync + 'static;
    type Value: RowOwned + RowRead + serde::de::DeserializeOwned + Clone + Send + Sync;

    fn build_query(group: &Self::Group, keys: &[Self::Key]) -> String;
    fn key_of(value: &Self::Value) -> Self::Key;

    /// See [`BatchQuery::linger_ms`].
    #[must_use]
    fn linger_ms() -> u64 {
        0
    }
    #[must_use]
    fn max_batch_size() -> usize {
        1000
    }
}

// --- Internal engine: deduplicated batch loop / execute pipeline ---

/// Metric names of one batcher kind, built at compile time so recording a batch doesn't
/// format (and allocate) a name per metric.
struct MetricNames {
    in_flight: &'static str,
    slot_wait_timeouts: &'static str,
    batch_size: &'static str,
    unique_ids: &'static str,
    batches: &'static str,
    query_duration_seconds: &'static str,
    errors: &'static str,
}

macro_rules! metric_names {
    ($prefix:literal) => {
        MetricNames {
            in_flight: concat!($prefix, ".in_flight"),
            slot_wait_timeouts: concat!($prefix, ".slot_wait_timeouts"),
            batch_size: concat!($prefix, ".batch_size"),
            unique_ids: concat!($prefix, ".unique_ids"),
            batches: concat!($prefix, ".batches"),
            query_duration_seconds: concat!($prefix, ".query_duration_seconds"),
            errors: concat!($prefix, ".errors"),
        }
    };
}

trait BatcherInner: Send + Sync + 'static {
    type Key: Hash + Eq + Clone + Send + Sync + 'static;
    type Group: Hash + Eq + Clone + Send + Sync + 'static;
    type Value: RowOwned + RowRead + serde::de::DeserializeOwned + Clone + Send + Sync;

    fn build_query(group: &Self::Group, keys: &[Self::Key]) -> String;
    fn key_of(value: &Self::Value) -> Self::Key;
    fn linger_ms() -> u64;
    fn max_batch_size() -> usize;

    /// Metric names, prefixed e.g. `clickhouse_batcher` or `clickhouse_batcher_multi`.
    const METRICS: MetricNames;
}

/// Adapts an ungrouped batch trait to [`BatcherInner`] with the unit group.
macro_rules! ungrouped_bridge {
    ($bridge:ident, $query:ident, $prefix:literal) => {
        struct $bridge<T>(PhantomData<T>);

        impl<T: $query> BatcherInner for $bridge<T> {
            type Key = T::Key;
            type Group = ();
            type Value = T::Value;

            fn build_query((): &(), keys: &[Self::Key]) -> String {
                T::build_query(keys)
            }
            fn key_of(value: &Self::Value) -> Self::Key {
                T::key_of(value)
            }
            fn linger_ms() -> u64 {
                T::linger_ms()
            }
            fn max_batch_size() -> usize {
                T::max_batch_size()
            }
            const METRICS: MetricNames = metric_names!($prefix);
        }
    };
}

ungrouped_bridge!(SingleBridge, BatchQuery, "clickhouse_batcher");
ungrouped_bridge!(MultiBridge, BatchQueryMulti, "clickhouse_batcher_multi");

struct GroupedBridge<T>(PhantomData<T>);

impl<T: BatchQueryGrouped> BatcherInner for GroupedBridge<T> {
    type Key = T::Key;
    type Group = T::Group;
    type Value = T::Value;

    fn build_query(group: &Self::Group, keys: &[Self::Key]) -> String {
        T::build_query(group, keys)
    }
    fn key_of(value: &Self::Value) -> Self::Key {
        T::key_of(value)
    }
    fn linger_ms() -> u64 {
        T::linger_ms()
    }
    fn max_batch_size() -> usize {
        T::max_batch_size()
    }
    const METRICS: MetricNames = metric_names!("clickhouse_batcher_grouped");
}

struct EngineRequest<I: BatcherInner> {
    key: I::Key,
    group: I::Group,
    response_tx: oneshot::Sender<BatchResult<Served<I::Value>>>,
}

struct BatchEngine<I: BatcherInner> {
    tx: mpsc::Sender<EngineRequest<I>>,
}

impl<I: BatcherInner> Clone for BatchEngine<I> {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
        }
    }
}

impl<I: BatcherInner> BatchEngine<I> {
    fn new(ch_client: clickhouse::Client) -> Self {
        let (tx, rx) = mpsc::channel(4096);
        tokio::spawn(batch_loop::<I>(ch_client, rx));
        Self { tx }
    }

    async fn enqueue(
        &self,
        group: I::Group,
        key: I::Key,
    ) -> BatchResult<oneshot::Receiver<BatchResult<Served<I::Value>>>> {
        let (response_tx, response_rx) = oneshot::channel();
        self.tx
            .send(EngineRequest {
                key,
                group,
                response_tx,
            })
            .await
            .map_err(|_closed| BatchError::Unavailable)?;
        Ok(response_rx)
    }
}

async fn await_response<V>(
    rx: oneshot::Receiver<BatchResult<Served<V>>>,
) -> BatchResult<Served<V>> {
    rx.await.map_err(|_closed| BatchError::Unavailable)?
}

/// Batches one batcher keeps querying at once. A request that finds a free slot is sent right
/// away; while all slots are busy, new requests collect into the next batch, so batches grow
/// with load instead of every request waiting out a fixed window.
///
/// Replaces fixed windows of 100 ms to 1 s, which set the API's p50: an idle batcher held its
/// first request for the whole window (steam profiles waited ~490 ms for an 80 ms query).
/// Replayed on an hour of production arrivals, two slots cut the median wait of steam profile,
/// rank and salts lookups to 66, 31 and 21 ms, at ~+0.4 `ClickHouse` cores over the windows. One
/// slot left requests stuck behind big multi-account batches (rank mean 147 ms vs. 64 ms).
const MAX_IN_FLIGHT: usize = 2;

/// Longest a batch waits for a slot before it is sent anyway, so queries stalled in `ClickHouse`
/// can't hold every later request for up to the 20 s query timeout. It matches the longest of
/// the old fixed windows for steam profiles and ranks, so the worst case is no worse than before.
const MAX_SLOT_WAIT: Duration = Duration::from_millis(500);

/// Pushes requests already waiting in the channel onto `pending`, up to the batch cap.
fn drain_queued<I: BatcherInner>(
    rx: &mut mpsc::Receiver<EngineRequest<I>>,
    pending: &mut Vec<EngineRequest<I>>,
) {
    while pending.len() < I::max_batch_size() {
        match rx.try_recv() {
            Ok(req) => pending.push(req),
            Err(_) => break,
        }
    }
}

async fn batch_loop<I: BatcherInner>(
    ch_client: clickhouse::Client,
    mut rx: mpsc::Receiver<EngineRequest<I>>,
) {
    let slots = Arc::new(Semaphore::new(MAX_IN_FLIGHT));

    while let Some(first) = rx.recv().await {
        let mut pending = vec![first];

        let linger = Duration::from_millis(I::linger_ms());
        if !linger.is_zero() {
            let now = tokio::time::Instant::now();
            let deadline = now.checked_add(linger).unwrap_or(now);
            while pending.len() < I::max_batch_size() {
                match tokio::time::timeout_at(deadline, rx.recv()).await {
                    Ok(Some(req)) => pending.push(req),
                    Ok(None) | Err(_) => break,
                }
            }
        }

        // Wait for a free slot, collecting the requests that arrive meanwhile. Without a permit
        // (slot wait timed out) the batch runs outside the slots.
        let now = tokio::time::Instant::now();
        let slot_deadline = now.checked_add(MAX_SLOT_WAIT).unwrap_or(now);
        let acquire = || tokio::time::timeout_at(slot_deadline, Arc::clone(&slots).acquire_owned());
        let permit = loop {
            if pending.len() >= I::max_batch_size() {
                break acquire().await.ok().and_then(Result::ok);
            }
            tokio::select! {
                biased;
                permit = acquire() => break permit.ok().and_then(Result::ok),
                req = rx.recv() => match req {
                    Some(req) => pending.push(req),
                    None => break acquire().await.ok().and_then(Result::ok),
                },
            }
        };
        if permit.is_none() {
            counter!(I::METRICS.slot_wait_timeouts).increment(1);
        }
        drain_queued::<I>(&mut rx, &mut pending);
        #[expect(
            clippy::cast_precision_loss,
            reason = "slot counts recorded as metrics"
        )]
        gauge!(I::METRICS.in_flight)
            .set(MAX_IN_FLIGHT.saturating_sub(slots.available_permits()) as f64);

        // The groups of one round share the slot; it frees once all their queries finish.
        let permit = Arc::new(permit);
        let mut by_group: HashMap<I::Group, Vec<EngineRequest<I>>> = HashMap::new();
        for req in pending {
            by_group.entry(req.group.clone()).or_default().push(req);
        }
        for (group, reqs) in by_group {
            let ch = ch_client.clone();
            let permit = Arc::clone(&permit);
            tokio::spawn(async move {
                execute_batch::<I>(&ch, &group, reqs).await;
                drop(permit);
            });
        }
    }
}

#[expect(
    clippy::cast_precision_loss,
    reason = "batch sizes recorded as metrics"
)]
async fn execute_batch<I: BatcherInner>(
    ch_client: &clickhouse::Client,
    group: &I::Group,
    pending: Vec<EngineRequest<I>>,
) {
    type SenderMap<I> = HashMap<
        <I as BatcherInner>::Key,
        Vec<oneshot::Sender<BatchResult<Served<<I as BatcherInner>::Value>>>>,
    >;

    let batch_size = pending.len();
    let mut senders: SenderMap<I> = HashMap::new();
    for req in pending {
        senders.entry(req.key).or_default().push(req.response_tx);
    }

    let unique_ids = senders.len();
    let metrics = &I::METRICS;
    histogram!(metrics.batch_size).record(batch_size as f64);
    histogram!(metrics.unique_ids).record(unique_ids as f64);
    counter!(metrics.batches).increment(1);

    let keys: Vec<I::Key> = senders.keys().cloned().collect();
    let query = I::build_query(group, &keys);

    let start = tokio::time::Instant::now();
    let result = fetch_all_with_cost::<I::Value>(ch_client.query(&query)).await;
    histogram!(metrics.query_duration_seconds).record(start.elapsed().as_secs_f64());

    let (rows, cost) = match result {
        Ok(result) => result,
        Err(e) => {
            counter!(metrics.errors).increment(1);
            warn!("Batch query failed: {e}");
            for (_, txs) in senders {
                for tx in txs {
                    if tx.send(Err(BatchError::QueryFailed)).is_err() {
                        debug!("Batch waiter went away before its error");
                    }
                }
            }
            return;
        }
    };

    let mut grouped: HashMap<I::Key, Vec<I::Value>> = HashMap::new();
    for row in rows {
        grouped.entry(I::key_of(&row)).or_default().push(row);
    }

    // Every waiter is charged an equal share, duplicate keys included: each stands for a lookup
    // some request made.
    let batch = NEXT_BATCH.fetch_add(1, Ordering::Relaxed);
    let waiters = u64::try_from(batch_size).unwrap_or(u64::MAX);
    let mut waiter: u64 = 0;
    let mut serve = |rows| {
        let share = Share {
            batch,
            cost: cost.share(waiter, waiters),
        };
        waiter = waiter.saturating_add(1);
        Ok(Served { rows, share })
    };
    for (key, txs) in senders {
        let values = grouped.remove(&key).unwrap_or_default();
        // Clone for all but the last waiter, which takes the rows.
        let mut txs = txs.into_iter();
        let last = txs.next_back();
        for tx in txs {
            if tx.send(serve(values.clone())).is_err() {
                debug!("Batch waiter went away before its rows");
            }
        }
        if let Some(tx) = last
            && tx.send(serve(values)).is_err()
        {
            debug!("Batch waiter went away before its rows");
        }
    }
}

// --- Public wrappers ---

pub struct ClickhouseBatcher<T: BatchQuery> {
    engine: BatchEngine<SingleBridge<T>>,
}

impl<T: BatchQuery> fmt::Debug for ClickhouseBatcher<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ClickhouseBatcher").finish_non_exhaustive()
    }
}

impl<T: BatchQuery> Clone for ClickhouseBatcher<T> {
    fn clone(&self) -> Self {
        Self {
            engine: self.engine.clone(),
        }
    }
}

impl<T: BatchQuery> ClickhouseBatcher<T> {
    #[must_use]
    pub fn new(ch_client: clickhouse::Client) -> Self {
        Self {
            engine: BatchEngine::new(ch_client),
        }
    }

    pub async fn load(&self, key: T::Key) -> BatchResult<T::Value> {
        let rx = self.engine.enqueue((), key).await?;
        counter!("clickhouse_batcher.requests").increment(1);
        let served = await_response(rx).await?;
        report_cost(&[served.share]);
        served.rows.into_iter().next().ok_or_else(|| {
            counter!("clickhouse_batcher.not_found").increment(1);
            BatchError::NotFound
        })
    }

    pub async fn load_many(&self, keys: &[T::Key]) -> BatchResult<Vec<T::Value>> {
        let mut receivers = Vec::with_capacity(keys.len());
        for key in keys {
            receivers.push(self.engine.enqueue((), key.clone()).await?);
        }
        counter!("clickhouse_batcher.requests").increment(keys.len() as u64);

        let mut results = Vec::with_capacity(receivers.len());
        let mut shares = Vec::with_capacity(receivers.len());
        let mut not_found: u64 = 0;
        for rx in receivers {
            let served = await_response(rx).await?;
            shares.push(served.share);
            if let Some(row) = served.rows.into_iter().next() {
                results.push(row);
            } else {
                not_found = not_found.saturating_add(1);
            }
        }
        report_cost(&shares);
        if not_found > 0 {
            counter!("clickhouse_batcher.not_found").increment(not_found);
        }
        Ok(results)
    }
}

pub struct ClickhouseBatcherMulti<T: BatchQueryMulti> {
    engine: BatchEngine<MultiBridge<T>>,
}

impl<T: BatchQueryMulti> fmt::Debug for ClickhouseBatcherMulti<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ClickhouseBatcherMulti")
            .finish_non_exhaustive()
    }
}

impl<T: BatchQueryMulti> Clone for ClickhouseBatcherMulti<T> {
    fn clone(&self) -> Self {
        Self {
            engine: self.engine.clone(),
        }
    }
}

impl<T: BatchQueryMulti> ClickhouseBatcherMulti<T> {
    #[must_use]
    pub fn new(ch_client: clickhouse::Client) -> Self {
        Self {
            engine: BatchEngine::new(ch_client),
        }
    }

    pub async fn load(&self, key: T::Key) -> BatchResult<Vec<T::Value>> {
        let rx = self.engine.enqueue((), key).await?;
        counter!("clickhouse_batcher_multi.requests").increment(1);
        let served = await_response(rx).await?;
        report_cost(&[served.share]);
        Ok(served.rows)
    }
}

pub struct ClickhouseBatcherGrouped<T: BatchQueryGrouped> {
    engine: BatchEngine<GroupedBridge<T>>,
}

impl<T: BatchQueryGrouped> fmt::Debug for ClickhouseBatcherGrouped<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ClickhouseBatcherGrouped")
            .finish_non_exhaustive()
    }
}

impl<T: BatchQueryGrouped> Clone for ClickhouseBatcherGrouped<T> {
    fn clone(&self) -> Self {
        Self {
            engine: self.engine.clone(),
        }
    }
}

impl<T: BatchQueryGrouped> ClickhouseBatcherGrouped<T> {
    #[must_use]
    pub fn new(ch_client: clickhouse::Client) -> Self {
        Self {
            engine: BatchEngine::new(ch_client),
        }
    }

    pub async fn load_many(&self, group: &T::Group, keys: &[T::Key]) -> BatchResult<Vec<T::Value>> {
        let mut receivers = Vec::with_capacity(keys.len());
        for key in keys {
            receivers.push(self.engine.enqueue(group.clone(), key.clone()).await?);
        }
        counter!("clickhouse_batcher_grouped.requests").increment(keys.len() as u64);

        let mut results = Vec::new();
        let mut shares = Vec::with_capacity(receivers.len());
        for rx in receivers {
            let served = await_response(rx).await?;
            shares.push(served.share);
            results.extend(served.rows);
        }
        report_cost(&shares);
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use core::cell::Cell;

    use clickhouse::Row;
    use clickhouse::test::{Mock, handlers};
    use serde::{Deserialize, Serialize};

    use super::*;

    tokio::task_local! {
        static RECORDED: Cell<BatchCost>;
    }

    fn record(cost: BatchCost) {
        _ = RECORDED.try_with(|recorded| recorded.set(recorded.get().add(cost)));
    }

    /// Runs `future` with the hook recording into a fresh task-local.
    async fn recorded<F: Future>(future: F) -> (F::Output, BatchCost) {
        set_batch_cost_hook(record);
        RECORDED
            .scope(Cell::new(BatchCost::default()), async move {
                let output = future.await;
                (output, RECORDED.with(Cell::get))
            })
            .await
    }

    #[derive(Debug, Clone, Row, Serialize, Deserialize, PartialEq, Eq)]
    struct Item {
        id: u32,
    }

    /// Lingers so concurrent loads land in one batch.
    struct Items;

    impl BatchQuery for Items {
        type Key = u32;
        type Value = Item;

        fn build_query(keys: &[u32]) -> String {
            format!("SELECT id FROM items WHERE id IN ({})", in_clause(keys))
        }
        fn key_of(value: &Item) -> u32 {
            value.id
        }
        fn linger_ms() -> u64 {
            50
        }
    }

    impl BatchQueryMulti for Items {
        type Key = u32;
        type Value = Item;

        fn build_query(keys: &[u32]) -> String {
            <Self as BatchQuery>::build_query(keys)
        }
        fn key_of(value: &Item) -> u32 {
            value.id
        }
        fn linger_ms() -> u64 {
            50
        }
    }

    const SUMMARY: &str =
        r#"{"read_rows":"5","read_bytes":"41","elapsed_ns":"1001","memory_usage":"4096"}"#;

    fn client(mock: &Mock) -> clickhouse::Client {
        clickhouse::Client::default()
            .with_url(mock.url())
            .with_validation(false)
    }

    #[test]
    fn shares_add_up_to_the_whole() {
        let cost = BatchCost {
            queries: 1,
            elapsed_ns: 1001,
            read_rows: 5,
            read_bytes: 41,
            peak_memory_bytes: 4096,
        };
        let shares: Vec<_> = (0..3).map(|i| cost.share(i, 3)).collect();
        let total = shares
            .iter()
            .fold(BatchCost::default(), |sum, s| sum.add(*s));
        assert_eq!(shares[0].read_rows, 2);
        assert_eq!(shares[2].read_rows, 1);
        assert!(shares.iter().all(|s| s.peak_memory_bytes == 4096));
        assert_eq!(total, BatchCost { queries: 3, ..cost });
    }

    #[tokio::test]
    async fn concurrent_loads_split_the_batch() {
        let mock = Mock::new();
        mock.add(handlers::provide_with_summary(
            [Item { id: 1 }, Item { id: 2 }],
            SUMMARY,
        ));
        let batcher = ClickhouseBatcherMulti::<Items>::new(client(&mock));

        let ((one, one_cost), (two, two_cost)) =
            tokio::join!(recorded(batcher.load(1)), recorded(batcher.load(2)),);

        assert_eq!(one.unwrap(), [Item { id: 1 }]);
        assert_eq!(two.unwrap(), [Item { id: 2 }]);
        assert_eq!(one_cost.queries, 1);
        assert_eq!(two_cost.queries, 1);
        assert_eq!(one_cost.read_rows + two_cost.read_rows, 5);
        assert_eq!(one_cost.read_bytes + two_cost.read_bytes, 41);
        assert_eq!(one_cost.elapsed_ns + two_cost.elapsed_ns, 1001);
        assert_eq!(one_cost.peak_memory_bytes, 4096);
    }

    #[tokio::test]
    async fn load_many_counts_one_query_per_batch() {
        let mock = Mock::new();
        mock.add(handlers::provide_with_summary(
            [Item { id: 1 }, Item { id: 2 }],
            SUMMARY,
        ));
        let batcher = ClickhouseBatcher::<Items>::new(client(&mock));

        let (items, cost) = recorded(batcher.load_many(&[1, 2, 3])).await;

        assert_eq!(items.unwrap().len(), 2);
        assert_eq!(
            cost,
            BatchCost {
                queries: 1,
                elapsed_ns: 1001,
                read_rows: 5,
                read_bytes: 41,
                peak_memory_bytes: 4096,
            }
        );
    }

    #[tokio::test]
    async fn failed_batches_record_nothing() {
        let mock = Mock::new();
        mock.add(handlers::failure(
            clickhouse::test::status::INTERNAL_SERVER_ERROR,
        ));
        let batcher = ClickhouseBatcherMulti::<Items>::new(client(&mock));

        let (result, cost) = recorded(batcher.load(1)).await;

        assert_eq!(result.unwrap_err(), BatchError::QueryFailed);
        assert_eq!(cost, BatchCost::default());
    }
}
