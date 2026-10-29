//! Batched key lookups: concurrent callers' keys are collected into one `IN (...)` query.

use core::fmt;
use core::hash::Hash;
use core::marker::PhantomData;
use core::time::Duration;
use std::collections::HashMap;
use std::sync::Arc;

use clickhouse::{RowOwned, RowRead};
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
    response_tx: oneshot::Sender<BatchResult<Vec<I::Value>>>,
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
    ) -> BatchResult<oneshot::Receiver<BatchResult<Vec<I::Value>>>> {
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

async fn await_response<V>(rx: oneshot::Receiver<BatchResult<Vec<V>>>) -> BatchResult<Vec<V>> {
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
        Vec<oneshot::Sender<BatchResult<Vec<<I as BatcherInner>::Value>>>>,
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
    let result = ch_client.query(&query).fetch_all::<I::Value>().await;
    histogram!(metrics.query_duration_seconds).record(start.elapsed().as_secs_f64());

    let rows = match result {
        Ok(rows) => rows,
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

    for (key, txs) in senders {
        let values = grouped.remove(&key).unwrap_or_default();
        // Clone for all but the last waiter, which takes the rows.
        let mut txs = txs.into_iter();
        let last = txs.next_back();
        for tx in txs {
            if tx.send(Ok(values.clone())).is_err() {
                debug!("Batch waiter went away before its rows");
            }
        }
        if let Some(tx) = last
            && tx.send(Ok(values)).is_err()
        {
            debug!("Batch waiter went away before its rows");
        }
    }
}

// --- Public wrappers ---

pub struct ClickhouseBatcher<T: BatchQuery> {
    engine: BatchEngine<SingleBridge<T>>,
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
        let rows = await_response(rx).await?;
        rows.into_iter().next().ok_or_else(|| {
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
        let mut not_found: u64 = 0;
        for rx in receivers {
            if let Some(row) = await_response(rx).await?.into_iter().next() {
                results.push(row);
            } else {
                not_found = not_found.saturating_add(1);
            }
        }
        if not_found > 0 {
            counter!("clickhouse_batcher.not_found").increment(not_found);
        }
        Ok(results)
    }
}

pub struct ClickhouseBatcherMulti<T: BatchQueryMulti> {
    engine: BatchEngine<MultiBridge<T>>,
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
        await_response(rx).await
    }
}

pub struct ClickhouseBatcherGrouped<T: BatchQueryGrouped> {
    engine: BatchEngine<GroupedBridge<T>>,
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
        for rx in receivers {
            results.extend(await_response(rx).await?);
        }
        Ok(results)
    }
}
