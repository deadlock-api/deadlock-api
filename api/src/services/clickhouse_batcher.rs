use core::hash::Hash;
use core::marker::PhantomData;
use core::time::Duration;
use std::collections::HashMap;

use axum::http::StatusCode;
use clickhouse::{RowOwned, RowRead};
use metrics::{counter, gauge, histogram};
use tokio::sync::{mpsc, oneshot};
use tracing::warn;

use crate::error::{APIError, APIResult};

/// Render a comma-separated list of keys for use inside a SQL `IN (...)` clause.
pub(crate) fn in_clause<K: core::fmt::Display>(keys: &[K]) -> String {
    use core::fmt::Write;
    let mut out = String::new();
    let mut first = true;
    for key in keys {
        if !first {
            out.push(',');
        }
        let _ = write!(out, "{key}");
        first = false;
    }
    out
}

pub(crate) trait BatchQuery: Send + Sync + 'static {
    type Key: Hash + Eq + Clone + Send + Sync + 'static;
    type Value: RowOwned + RowRead + serde::de::DeserializeOwned + Clone + Send + Sync;

    fn build_query(keys: &[Self::Key]) -> String;
    fn key_of(value: &Self::Value) -> Self::Key;

    fn batch_window_ms() -> u64 {
        100
    }
    fn max_batch_size() -> usize {
        1000
    }
}

pub(crate) trait BatchQueryMulti: Send + Sync + 'static {
    type Key: Hash + Eq + Clone + Send + Sync + 'static;
    type Value: RowOwned + RowRead + serde::de::DeserializeOwned + Clone + Send + Sync;

    fn build_query(keys: &[Self::Key]) -> String;
    fn key_of(value: &Self::Value) -> Self::Key;

    fn batch_window_ms() -> u64 {
        20
    }
    fn max_batch_size() -> usize {
        1000
    }
}

// --- Internal engine: deduplicated batch loop / execute pipeline ---

trait BatcherInner: Send + Sync + 'static {
    type Key: Hash + Eq + Clone + Send + Sync + 'static;
    type Value: RowOwned + RowRead + serde::de::DeserializeOwned + Clone + Send + Sync;

    fn build_query(keys: &[Self::Key]) -> String;
    fn key_of(value: &Self::Value) -> Self::Key;
    fn batch_window_ms() -> u64;
    fn max_batch_size() -> usize;

    /// Metric name prefix, e.g. `clickhouse_batcher` or `clickhouse_batcher_multi`.
    const METRIC_PREFIX: &'static str;
}

struct SingleBridge<T>(PhantomData<T>);

impl<T: BatchQuery> BatcherInner for SingleBridge<T> {
    type Key = T::Key;
    type Value = T::Value;

    fn build_query(keys: &[Self::Key]) -> String {
        T::build_query(keys)
    }
    fn key_of(value: &Self::Value) -> Self::Key {
        T::key_of(value)
    }
    fn batch_window_ms() -> u64 {
        T::batch_window_ms()
    }
    fn max_batch_size() -> usize {
        T::max_batch_size()
    }
    const METRIC_PREFIX: &'static str = "clickhouse_batcher";
}

struct MultiBridge<T>(PhantomData<T>);

impl<T: BatchQueryMulti> BatcherInner for MultiBridge<T> {
    type Key = T::Key;
    type Value = T::Value;

    fn build_query(keys: &[Self::Key]) -> String {
        T::build_query(keys)
    }
    fn key_of(value: &Self::Value) -> Self::Key {
        T::key_of(value)
    }
    fn batch_window_ms() -> u64 {
        T::batch_window_ms()
    }
    fn max_batch_size() -> usize {
        T::max_batch_size()
    }
    const METRIC_PREFIX: &'static str = "clickhouse_batcher_multi";
}

struct EngineRequest<I: BatcherInner> {
    key: I::Key,
    response_tx: oneshot::Sender<APIResult<Vec<I::Value>>>,
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

    async fn enqueue(&self, key: I::Key) -> APIResult<oneshot::Receiver<APIResult<Vec<I::Value>>>> {
        let (response_tx, response_rx) = oneshot::channel();
        self.tx
            .send(EngineRequest { key, response_tx })
            .await
            .map_err(|_| APIError::internal("Batcher unavailable"))?;
        Ok(response_rx)
    }
}

async fn await_response<V>(rx: oneshot::Receiver<APIResult<Vec<V>>>) -> APIResult<Vec<V>> {
    rx.await
        .map_err(|_| APIError::internal("Batcher dropped response"))?
}

fn next_window<I: BatcherInner>(prev_batch_size: usize) -> Duration {
    if prev_batch_size >= I::max_batch_size() {
        Duration::ZERO
    } else {
        Duration::from_millis(I::batch_window_ms())
    }
}

async fn batch_loop<I: BatcherInner>(
    ch_client: clickhouse::Client,
    mut rx: mpsc::Receiver<EngineRequest<I>>,
) {
    let mut prev_batch_size: usize = 0;

    while let Some(first) = rx.recv().await {
        let mut pending = vec![first];

        let window = next_window::<I>(prev_batch_size);
        let deadline = tokio::time::Instant::now() + window;
        loop {
            if pending.len() >= I::max_batch_size() {
                break;
            }
            match tokio::time::timeout_at(deadline, rx.recv()).await {
                Ok(Some(req)) => pending.push(req),
                Ok(None) | Err(_) => break,
            }
        }

        prev_batch_size = pending.len();
        gauge!(format!("{}.window_ms", I::METRIC_PREFIX)).set(window.as_secs_f64() * 1000.0);

        let ch = ch_client.clone();
        tokio::spawn(async move { execute_batch::<I>(&ch, pending).await });
    }
}

#[allow(clippy::cast_precision_loss)]
async fn execute_batch<I: BatcherInner>(
    ch_client: &clickhouse::Client,
    pending: Vec<EngineRequest<I>>,
) {
    type SenderMap<I> = HashMap<
        <I as BatcherInner>::Key,
        Vec<oneshot::Sender<APIResult<Vec<<I as BatcherInner>::Value>>>>,
    >;

    let batch_size = pending.len();
    let mut senders: SenderMap<I> = HashMap::new();
    for req in pending {
        senders.entry(req.key).or_default().push(req.response_tx);
    }

    let unique_ids = senders.len();
    let prefix = I::METRIC_PREFIX;
    histogram!(format!("{prefix}.batch_size")).record(batch_size as f64);
    histogram!(format!("{prefix}.unique_ids")).record(unique_ids as f64);
    counter!(format!("{prefix}.batches")).increment(1);

    let keys: Vec<I::Key> = senders.keys().cloned().collect();
    let query = I::build_query(&keys);

    let start = tokio::time::Instant::now();
    let result = ch_client.query(&query).fetch_all::<I::Value>().await;
    histogram!(format!("{prefix}.query_duration_seconds")).record(start.elapsed().as_secs_f64());

    let rows = match result {
        Ok(rows) => rows,
        Err(e) => {
            counter!(format!("{prefix}.errors")).increment(1);
            warn!("Batch query failed: {e}");
            for (_, txs) in senders {
                for tx in txs {
                    let _ = tx.send(Err(APIError::internal("Batch query failed")));
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
        let last_idx = txs.len() - 1;
        for (i, tx) in txs.into_iter().enumerate() {
            if i == last_idx {
                let _ = tx.send(Ok(values));
                break;
            }
            let _ = tx.send(Ok(values.clone()));
        }
    }
}

// --- Public wrappers ---

pub(crate) struct ClickhouseBatcher<T: BatchQuery> {
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
    pub(crate) fn new(ch_client: clickhouse::Client) -> Self {
        Self {
            engine: BatchEngine::new(ch_client),
        }
    }

    pub(crate) async fn load(&self, key: T::Key) -> APIResult<T::Value> {
        let rx = self.engine.enqueue(key).await?;
        counter!("clickhouse_batcher.requests").increment(1);
        let rows = await_response(rx).await?;
        if let Some(row) = rows.into_iter().next() {
            Ok(row)
        } else {
            counter!("clickhouse_batcher.not_found").increment(1);
            Err(APIError::status_msg(StatusCode::NOT_FOUND, "Not found"))
        }
    }

    pub(crate) async fn load_many(&self, keys: &[T::Key]) -> APIResult<Vec<T::Value>> {
        let mut receivers = Vec::with_capacity(keys.len());
        for key in keys {
            receivers.push(self.engine.enqueue(key.clone()).await?);
        }
        counter!("clickhouse_batcher.requests").increment(keys.len() as u64);

        let mut results = Vec::with_capacity(receivers.len());
        let mut not_found: u64 = 0;
        for rx in receivers {
            if let Ok(rows) = await_response(rx).await {
                if let Some(row) = rows.into_iter().next() {
                    results.push(row);
                } else {
                    not_found += 1;
                }
            }
        }
        if not_found > 0 {
            counter!("clickhouse_batcher.not_found").increment(not_found);
        }
        Ok(results)
    }
}

pub(crate) struct ClickhouseBatcherMulti<T: BatchQueryMulti> {
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
    pub(crate) fn new(ch_client: clickhouse::Client) -> Self {
        Self {
            engine: BatchEngine::new(ch_client),
        }
    }

    pub(crate) async fn load(&self, key: T::Key) -> APIResult<Vec<T::Value>> {
        let rx = self.engine.enqueue(key).await?;
        counter!("clickhouse_batcher_multi.requests").increment(1);
        await_response(rx).await
    }
}
