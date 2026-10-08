//! Batched `ClickHouse` inserts shared by the ingestion tools.

use core::sync::atomic::{AtomicUsize, Ordering};
use core::time::Duration;
use std::sync::Arc;

use clickhouse::{RowOwned, RowWrite};
use tokio::sync::{Mutex, mpsc, oneshot};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use tracing::{error, info};

use crate::retry_fn_with_backoff;

/// How a [`BatchInserter`] groups rows into inserts.
#[derive(Debug, Clone)]
pub struct BatchInserterConfig {
    /// Target table.
    pub table: String,
    /// Prefix of the flush metrics: `{prefix}.batch_flush.{success,failure,entries}`,
    /// labelled with the table.
    pub metrics_prefix: String,
    /// Flush once this many rows are pending.
    pub max_rows: usize,
    /// Flush a non-empty batch after this long; `None` flushes only on size or shutdown.
    pub flush_interval: Option<Duration>,
    /// Number of concurrent flushing workers.
    pub workers: usize,
    /// Number of queued [`BatchInserter::insert`] calls before callers wait.
    pub queue_capacity: usize,
}

struct Request<T> {
    rows: Vec<T>,
    ack: oneshot::Sender<bool>,
}

/// Resolves once the rows of one [`BatchInserter::insert`] call were flushed: `true` if
/// they reached `ClickHouse`, `false` if the flush failed after its retries. Dropping it
/// does not cancel the insert.
pub struct InsertAck(oneshot::Receiver<bool>);

impl InsertAck {
    pub async fn flushed(self) -> bool {
        self.0.await.unwrap_or(false)
    }
}

#[derive(Default)]
struct Stats {
    flushed_rows: AtomicUsize,
    failed_rows: AtomicUsize,
}

/// Accumulates rows from many producers and writes them to one table in batches,
/// flushing on size, on an interval, and on [`BatchInserter::shutdown`]. Each flush is
/// retried with backoff; on persistent failure the batch is dropped and its acks
/// report `false`.
pub struct BatchInserter<T> {
    tx: mpsc::Sender<Request<T>>,
    shutdown: CancellationToken,
    workers: std::sync::Mutex<Vec<JoinHandle<()>>>,
    stats: Arc<Stats>,
}

impl<T> BatchInserter<T>
where
    T: RowOwned + RowWrite + Send + Sync + 'static,
{
    #[must_use]
    pub fn spawn(client: &clickhouse::Client, config: BatchInserterConfig) -> Self {
        info!(
            table = config.table,
            max_rows = config.max_rows,
            flush_interval_ms = config.flush_interval.map(|d| d.as_millis()),
            workers = config.workers,
            "Starting batch inserter"
        );
        let (tx, rx) = mpsc::channel(config.queue_capacity.max(1));
        let rx = Arc::new(Mutex::new(rx));
        let shutdown = CancellationToken::new();
        let stats = Arc::new(Stats::default());
        let config = Arc::new(config);
        let workers = (0..config.workers.max(1))
            .map(|id| {
                tokio::spawn(run_worker(
                    Worker {
                        id,
                        client: client.clone(),
                        config: Arc::clone(&config),
                        stats: Arc::clone(&stats),
                    },
                    Arc::clone(&rx),
                    shutdown.clone(),
                ))
            })
            .collect();
        Self {
            tx,
            shutdown,
            workers: std::sync::Mutex::new(workers),
            stats,
        }
    }

    /// Queues `rows` for the next batch, waiting while the queue is full. `None` once the
    /// inserter is shut down.
    pub async fn insert(&self, rows: Vec<T>) -> Option<InsertAck> {
        let (ack, rx) = oneshot::channel();
        if self.shutdown.is_cancelled() {
            return None;
        }
        self.tx.send(Request { rows, ack }).await.ok()?;
        Some(InsertAck(rx))
    }

    /// Whether any flush has failed permanently.
    pub fn has_failed(&self) -> bool {
        self.stats.failed_rows.load(Ordering::Relaxed) > 0
    }

    /// Rows written so far.
    pub fn flushed_rows(&self) -> usize {
        self.stats.flushed_rows.load(Ordering::Relaxed)
    }

    /// Stops accepting rows, flushes everything queued and waits for the workers.
    pub async fn shutdown(&self) {
        self.shutdown.cancel();
        let workers = core::mem::take(
            &mut *self
                .workers
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner),
        );
        for worker in workers {
            if let Err(e) = worker.await {
                error!("Batch inserter worker panicked: {e}");
            }
        }
    }
}

struct Worker {
    id: usize,
    client: clickhouse::Client,
    config: Arc<BatchInserterConfig>,
    stats: Arc<Stats>,
}

async fn run_worker<T>(
    worker: Worker,
    rx: Arc<Mutex<mpsc::Receiver<Request<T>>>>,
    shutdown: CancellationToken,
) where
    T: RowOwned + RowWrite + Send + Sync + 'static,
{
    let max_rows = worker.config.max_rows.max(1);
    let mut pending: Vec<Request<T>> = Vec::new();
    let mut pending_rows = 0;
    let mut flush_timer = worker.config.flush_interval.map(|interval| {
        let mut timer = tokio::time::interval_at(tokio::time::Instant::now() + interval, interval);
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        timer
    });

    loop {
        let already = pending_rows;
        let received = async {
            let mut rx = rx.lock().await;
            let first = rx.recv().await?;
            let mut batch = vec![first];
            let mut rows = batch[0].rows.len();
            // Take whatever else is already queued, up to the batch size.
            while already + rows < max_rows {
                let Ok(next) = rx.try_recv() else { break };
                rows += next.rows.len();
                batch.push(next);
            }
            Some((batch, rows))
        };
        let tick = async {
            match flush_timer.as_mut() {
                Some(timer) => timer.tick().await,
                None => core::future::pending().await,
            }
        };

        tokio::select! {
            biased;
            () = shutdown.cancelled() => {
                // Closing makes `recv` return what is still queued, then `None`.
                let mut rx = rx.lock().await;
                rx.close();
                while let Some(req) = rx.recv().await {
                    pending_rows += req.rows.len();
                    pending.push(req);
                    if pending_rows >= max_rows {
                        worker.flush(&mut pending).await;
                        pending_rows = 0;
                    }
                }
                worker.flush(&mut pending).await;
                return;
            }
            _ = tick, if !pending.is_empty() => {
                worker.flush(&mut pending).await;
                pending_rows = 0;
            }
            received = received => {
                let Some((batch, rows)) = received else {
                    worker.flush(&mut pending).await;
                    return;
                };
                pending.extend(batch);
                pending_rows += rows;
                if pending_rows >= max_rows {
                    worker.flush(&mut pending).await;
                    pending_rows = 0;
                }
            }
        }
    }
}

impl Worker {
    async fn flush<T>(&self, pending: &mut Vec<Request<T>>)
    where
        T: RowOwned + RowWrite + Send + Sync + 'static,
    {
        if pending.is_empty() {
            return;
        }
        let table = self.config.table.as_str();
        let prefix = self.config.metrics_prefix.as_str();
        let rows: usize = pending.iter().map(|r| r.rows.len()).sum();
        let result = retry_fn_with_backoff(&format!("{table} batch flush"), || async {
            let mut insert = self.client.insert::<T>(table).await?;
            for row in pending.iter().flat_map(|r| &r.rows) {
                insert.write(row).await?;
            }
            insert.end().await
        })
        .await;
        let success = match result {
            Ok(()) => {
                self.stats.flushed_rows.fetch_add(rows, Ordering::Relaxed);
                metrics::counter!(format!("{prefix}.batch_flush.success"), "table" => table.to_owned())
                    .increment(1);
                metrics::counter!(format!("{prefix}.batch_flush.entries"), "table" => table.to_owned())
                    .increment(rows as u64);
                info!(
                    "[{table} inserter {}] Flushed {rows} rows from {} requests",
                    self.id,
                    pending.len()
                );
                true
            }
            Err(e) => {
                self.stats.failed_rows.fetch_add(rows, Ordering::Relaxed);
                metrics::counter!(format!("{prefix}.batch_flush.failure"), "table" => table.to_owned())
                    .increment(1);
                error!(
                    "[{table} inserter {}] Flush of {rows} rows failed permanently: {e}",
                    self.id
                );
                false
            }
        };
        for req in pending.drain(..) {
            let _ = req.ack.send(success);
        }
    }
}

#[cfg(test)]
mod tests {
    use clickhouse::Row;
    use clickhouse::test::{Mock, handlers};
    use serde::{Deserialize, Serialize};

    use super::*;

    #[derive(Row, Serialize, Deserialize, Debug, PartialEq)]
    struct TestRow {
        id: u32,
    }

    fn rows(ids: &[u32]) -> Vec<TestRow> {
        ids.iter().map(|&id| TestRow { id }).collect()
    }

    fn inserter(mock: &Mock, flush_interval: Option<Duration>) -> BatchInserter<TestRow> {
        let client = clickhouse::Client::default()
            .with_mock(mock)
            .with_validation(false);
        BatchInserter::spawn(
            &client,
            BatchInserterConfig {
                table: "test".to_owned(),
                metrics_prefix: "test".to_owned(),
                max_rows: 3,
                flush_interval,
                workers: 1,
                queue_capacity: 8,
            },
        )
    }

    #[tokio::test]
    async fn flushes_on_size_and_on_shutdown() {
        let mock = Mock::new();
        let first = mock.add(handlers::record::<TestRow>());
        let second = mock.add(handlers::record::<TestRow>());
        let inserter = inserter(&mock, None);

        let a = inserter.insert(rows(&[1, 2])).await.unwrap();
        let b = inserter.insert(rows(&[3])).await.unwrap();
        assert!(a.flushed().await);
        assert!(b.flushed().await);

        let c = inserter.insert(rows(&[4])).await.unwrap();
        inserter.shutdown().await;
        assert!(c.flushed().await);
        assert!(inserter.insert(rows(&[5])).await.is_none());

        assert_eq!(first.collect::<Vec<TestRow>>().await, rows(&[1, 2, 3]));
        assert_eq!(second.collect::<Vec<TestRow>>().await, rows(&[4]));
        assert_eq!(inserter.flushed_rows(), 4);
        assert!(!inserter.has_failed());
    }

    #[tokio::test]
    async fn flushes_a_partial_batch_on_the_interval() {
        let mock = Mock::new();
        let recorded = mock.add(handlers::record::<TestRow>());
        let inserter = inserter(&mock, Some(Duration::from_millis(50)));

        let ack = inserter.insert(rows(&[7])).await.unwrap();
        assert!(ack.flushed().await);
        assert_eq!(recorded.collect::<Vec<TestRow>>().await, rows(&[7]));
    }
}
