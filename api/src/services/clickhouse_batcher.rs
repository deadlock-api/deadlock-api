use core::hash::Hash;
use core::time::Duration;
use std::collections::HashMap;

use axum::http::StatusCode;
use clickhouse::{RowOwned, RowRead};
use metrics::{counter, gauge, histogram};
use tokio::sync::{mpsc, oneshot};
use tracing::warn;

use crate::error::{APIError, APIResult};

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

type SenderMap<T> =
    HashMap<<T as BatchQuery>::Key, Vec<oneshot::Sender<APIResult<<T as BatchQuery>::Value>>>>;

struct BatchRequest<T: BatchQuery> {
    key: T::Key,
    response_tx: oneshot::Sender<APIResult<T::Value>>,
}

pub(crate) struct ClickhouseBatcher<T: BatchQuery> {
    tx: mpsc::Sender<BatchRequest<T>>,
}

impl<T: BatchQuery> Clone for ClickhouseBatcher<T> {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
        }
    }
}

impl<T: BatchQuery> ClickhouseBatcher<T> {
    pub(crate) fn new(ch_client: clickhouse::Client) -> Self {
        let (tx, rx) = mpsc::channel(4096);
        tokio::spawn(batch_loop::<T>(ch_client, rx));
        Self { tx }
    }

    async fn send_request(&self, key: T::Key) -> APIResult<oneshot::Receiver<APIResult<T::Value>>> {
        let (response_tx, response_rx) = oneshot::channel();
        self.tx
            .send(BatchRequest { key, response_tx })
            .await
            .map_err(|_| APIError::internal("Batcher unavailable"))?;
        Ok(response_rx)
    }

    async fn recv_response(rx: oneshot::Receiver<APIResult<T::Value>>) -> APIResult<T::Value> {
        rx.await
            .map_err(|_| APIError::internal("Batcher dropped response"))?
    }

    pub(crate) async fn load(&self, key: T::Key) -> APIResult<T::Value> {
        let rx = self.send_request(key).await?;
        counter!("clickhouse_batcher.requests").increment(1);
        Self::recv_response(rx).await
    }

    pub(crate) async fn load_many(&self, keys: &[T::Key]) -> APIResult<Vec<T::Value>> {
        let mut receivers = Vec::with_capacity(keys.len());
        for key in keys {
            receivers.push(self.send_request(key.clone()).await?);
        }
        counter!("clickhouse_batcher.requests").increment(keys.len() as u64);

        let mut results = Vec::with_capacity(receivers.len());
        for rx in receivers {
            if let Ok(value) = Self::recv_response(rx).await {
                results.push(value);
            }
        }
        Ok(results)
    }
}

fn batch_window<T: BatchQuery>(prev_batch_size: usize) -> Duration {
    if prev_batch_size >= T::max_batch_size() {
        Duration::ZERO
    } else {
        Duration::from_millis(T::batch_window_ms())
    }
}

async fn batch_loop<T: BatchQuery>(
    ch_client: clickhouse::Client,
    mut rx: mpsc::Receiver<BatchRequest<T>>,
) {
    let mut prev_batch_size: usize = 0;

    while let Some(first) = rx.recv().await {
        let mut pending = vec![first];

        let window = batch_window::<T>(prev_batch_size);
        let deadline = tokio::time::Instant::now() + window;
        loop {
            if pending.len() >= T::max_batch_size() {
                break;
            }
            match tokio::time::timeout_at(deadline, rx.recv()).await {
                Ok(Some(req)) => pending.push(req),
                Ok(None) | Err(_) => break,
            }
        }

        prev_batch_size = pending.len();
        gauge!("clickhouse_batcher.window_ms").set(window.as_secs_f64() * 1000.0);

        let ch = ch_client.clone();
        tokio::spawn(async move { execute_batch::<T>(&ch, pending).await });
    }
}

#[allow(clippy::cast_precision_loss)]
async fn execute_batch<T: BatchQuery>(
    ch_client: &clickhouse::Client,
    pending: Vec<BatchRequest<T>>,
) {
    let batch_size = pending.len();
    let mut senders: SenderMap<T> = HashMap::new();
    for req in pending {
        senders.entry(req.key).or_default().push(req.response_tx);
    }

    let unique_ids = senders.len();
    histogram!("clickhouse_batcher.batch_size").record(batch_size as f64);
    histogram!("clickhouse_batcher.unique_ids").record(unique_ids as f64);
    counter!("clickhouse_batcher.batches").increment(1);

    let keys: Vec<T::Key> = senders.keys().cloned().collect();
    let query = T::build_query(&keys);

    let start = tokio::time::Instant::now();
    match ch_client.query(&query).fetch_all::<T::Value>().await {
        Ok(rows) => {
            histogram!("clickhouse_batcher.query_duration_seconds")
                .record(start.elapsed().as_secs_f64());

            for row in rows {
                let key = T::key_of(&row);
                if let Some(mut txs) = senders.remove(&key)
                    && let Some(last) = txs.pop()
                {
                    for tx in txs {
                        let _ = tx.send(Ok(row.clone()));
                    }
                    let _ = last.send(Ok(row));
                }
            }

            let not_found = senders.len();
            if not_found > 0 {
                counter!("clickhouse_batcher.not_found").increment(not_found as u64);
            }
            for (_, txs) in senders {
                for tx in txs {
                    let _ = tx.send(Err(APIError::status_msg(
                        StatusCode::NOT_FOUND,
                        "Not found",
                    )));
                }
            }
        }
        Err(e) => {
            histogram!("clickhouse_batcher.query_duration_seconds")
                .record(start.elapsed().as_secs_f64());
            counter!("clickhouse_batcher.errors").increment(1);
            warn!("Batch query failed: {e}");
            for (_, txs) in senders {
                for tx in txs {
                    let _ = tx.send(Err(APIError::internal("Batch query failed")));
                }
            }
        }
    }
}

// --- Multi-value variant (1:N key-to-rows) ---

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

type MultiSenderMap<T> = HashMap<
    <T as BatchQueryMulti>::Key,
    Vec<oneshot::Sender<APIResult<Vec<<T as BatchQueryMulti>::Value>>>>,
>;

struct MultiBatchRequest<T: BatchQueryMulti> {
    key: T::Key,
    response_tx: oneshot::Sender<APIResult<Vec<T::Value>>>,
}

pub(crate) struct ClickhouseBatcherMulti<T: BatchQueryMulti> {
    tx: mpsc::Sender<MultiBatchRequest<T>>,
}

impl<T: BatchQueryMulti> Clone for ClickhouseBatcherMulti<T> {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
        }
    }
}

impl<T: BatchQueryMulti> ClickhouseBatcherMulti<T> {
    pub(crate) fn new(ch_client: clickhouse::Client) -> Self {
        let (tx, rx) = mpsc::channel(4096);
        tokio::spawn(multi_batch_loop::<T>(ch_client, rx));
        Self { tx }
    }

    pub(crate) async fn load(&self, key: T::Key) -> APIResult<Vec<T::Value>> {
        let (response_tx, response_rx) = oneshot::channel();
        self.tx
            .send(MultiBatchRequest { key, response_tx })
            .await
            .map_err(|_| APIError::internal("Batcher unavailable"))?;
        counter!("clickhouse_batcher_multi.requests").increment(1);
        response_rx
            .await
            .map_err(|_| APIError::internal("Batcher dropped response"))?
    }
}

fn multi_batch_window<T: BatchQueryMulti>(prev_batch_size: usize) -> Duration {
    if prev_batch_size >= T::max_batch_size() {
        Duration::ZERO
    } else {
        Duration::from_millis(T::batch_window_ms())
    }
}

async fn multi_batch_loop<T: BatchQueryMulti>(
    ch_client: clickhouse::Client,
    mut rx: mpsc::Receiver<MultiBatchRequest<T>>,
) {
    let mut prev_batch_size: usize = 0;

    while let Some(first) = rx.recv().await {
        let mut pending = vec![first];

        let window = multi_batch_window::<T>(prev_batch_size);
        let deadline = tokio::time::Instant::now() + window;
        loop {
            if pending.len() >= T::max_batch_size() {
                break;
            }
            match tokio::time::timeout_at(deadline, rx.recv()).await {
                Ok(Some(req)) => pending.push(req),
                Ok(None) | Err(_) => break,
            }
        }

        prev_batch_size = pending.len();
        gauge!("clickhouse_batcher_multi.window_ms").set(window.as_secs_f64() * 1000.0);

        let ch = ch_client.clone();
        tokio::spawn(async move { execute_multi_batch::<T>(&ch, pending).await });
    }
}

#[allow(clippy::cast_precision_loss)]
async fn execute_multi_batch<T: BatchQueryMulti>(
    ch_client: &clickhouse::Client,
    pending: Vec<MultiBatchRequest<T>>,
) {
    let batch_size = pending.len();
    let mut senders: MultiSenderMap<T> = HashMap::new();
    for req in pending {
        senders.entry(req.key).or_default().push(req.response_tx);
    }

    let unique_ids = senders.len();
    histogram!("clickhouse_batcher_multi.batch_size").record(batch_size as f64);
    histogram!("clickhouse_batcher_multi.unique_ids").record(unique_ids as f64);
    counter!("clickhouse_batcher_multi.batches").increment(1);

    let keys: Vec<T::Key> = senders.keys().cloned().collect();
    let query = T::build_query(&keys);

    let start = tokio::time::Instant::now();
    match ch_client.query(&query).fetch_all::<T::Value>().await {
        Ok(rows) => {
            histogram!("clickhouse_batcher_multi.query_duration_seconds")
                .record(start.elapsed().as_secs_f64());

            // Group rows by key
            let mut grouped: HashMap<T::Key, Vec<T::Value>> = HashMap::new();
            for row in rows {
                let key = T::key_of(&row);
                grouped.entry(key).or_default().push(row);
            }

            // Send grouped results to all waiters
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
        Err(e) => {
            histogram!("clickhouse_batcher_multi.query_duration_seconds")
                .record(start.elapsed().as_secs_f64());
            counter!("clickhouse_batcher_multi.errors").increment(1);
            warn!("Multi batch query failed: {e}");
            for (_, txs) in senders {
                for tx in txs {
                    let _ = tx.send(Err(APIError::internal("Batch query failed")));
                }
            }
        }
    }
}
