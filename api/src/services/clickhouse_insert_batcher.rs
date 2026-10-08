use core::time::Duration;
use std::sync::Arc;

use clickhouse::{RowOwned, RowWrite};
use metrics::{counter, histogram};
use serde::Serialize;
use tokio::sync::Mutex;
use tokio::time::interval;
use tracing::{debug, error, info, warn};

pub(crate) trait BatchInsert: Send + Sync + 'static {
    type Row: RowOwned + RowWrite + Serialize + Clone + Send + Sync;

    fn table_name() -> &'static str;

    fn flush_interval_secs() -> u64 {
        10
    }
    fn max_buffer_size() -> usize {
        10_000
    }
}

pub(crate) struct ClickhouseInsertBatcher<T: BatchInsert> {
    buffer: Mutex<Vec<T::Row>>,
    ch_client: clickhouse::Client,
}

impl<T: BatchInsert> ClickhouseInsertBatcher<T> {
    pub(crate) fn new(ch_client: clickhouse::Client) -> Self {
        Self {
            buffer: Mutex::new(Vec::with_capacity(1000)),
            ch_client,
        }
    }

    /// Queue a single row, see [`Self::insert`].
    pub(crate) async fn insert_one(&self, row: T::Row) {
        self.push(1, [row]).await;
    }

    /// Queue rows for batch insertion. Non-blocking beyond the mutex lock.
    pub(crate) async fn insert(&self, rows: Vec<T::Row>) {
        if rows.is_empty() {
            return;
        }
        self.push(rows.len(), rows).await;
    }

    /// Appends `count` rows, dropping the oldest buffered rows past the max buffer size.
    async fn push(&self, count: usize, rows: impl IntoIterator<Item = T::Row>) {
        let max = T::max_buffer_size();
        let mut buffer = self.buffer.lock().await;
        if buffer.len() + count > max {
            warn!(
                "Insert batcher buffer full for {}, dropping oldest entries",
                T::table_name()
            );
            let to_drain = (buffer.len() + count).saturating_sub(max);
            let drain_count = to_drain.min(buffer.len());
            buffer.drain(0..drain_count);
        }
        buffer.extend(rows);
    }

    /// Start the background flush task. It flushes every `flush_interval_secs` until
    /// [`crate::BACKGROUND_SHUTDOWN`] is cancelled (after the server stopped serving), then runs a
    /// final flush. The task is tracked by [`crate::BACKGROUND_TASKS`] so shutdown can await it.
    pub(crate) fn start_background_flush(self: Arc<Self>) {
        crate::BACKGROUND_TASKS.spawn(async move {
            let mut tick = interval(Duration::from_secs(T::flush_interval_secs()));
            info!("{} insert batcher started", T::table_name());

            loop {
                tokio::select! {
                    _ = tick.tick() => self.flush().await,
                    () = crate::BACKGROUND_SHUTDOWN.cancelled() => {
                        info!(
                            "{} insert batcher shutting down, performing final flush",
                            T::table_name()
                        );
                        self.flush().await;
                        break;
                    }
                }
            }

            info!("{} insert batcher stopped", T::table_name());
        });
    }

    #[expect(clippy::cast_precision_loss)]
    async fn flush(&self) {
        let rows: Vec<T::Row> = {
            let mut buffer = self.buffer.lock().await;
            if buffer.is_empty() {
                return;
            }
            core::mem::take(&mut *buffer)
        };

        let table = T::table_name();
        let count = rows.len();
        debug!("Flushing {count} rows to {table}");
        histogram!("clickhouse_insert_batcher.batch_size", "table" => table).record(count as f64);

        if let Err(e) = self.insert_batch(&rows).await {
            error!("Failed to flush rows to {table}: {e}");
            counter!("clickhouse_insert_batcher.errors", "table" => table).increment(1);
            // Re-queue failed rows up to max capacity
            let max = T::max_buffer_size();
            let mut buffer = self.buffer.lock().await;
            let available = max.saturating_sub(buffer.len());
            buffer.extend(rows.into_iter().take(available));
        } else {
            debug!("Successfully flushed {count} rows to {table}");
        }
    }

    async fn insert_batch(&self, rows: &[T::Row]) -> clickhouse::error::Result<()> {
        let mut inserter = self.ch_client.insert::<T::Row>(T::table_name()).await?;
        for row in rows {
            inserter.write(row).await?;
        }
        inserter.end().await?;
        Ok(())
    }
}
