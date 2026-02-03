mod types;

use core::sync::atomic::{AtomicBool, Ordering};
use core::time::Duration;
use std::sync::Arc;

use clickhouse::Client;
use tokio::sync::Mutex;
use tokio::time::interval;
use tracing::{debug, error, info, warn};
pub(crate) use types::RequestLog;

const FLUSH_INTERVAL_SECS: u64 = 10;
const MAX_BUFFER_SIZE: usize = 10_000;

pub(crate) struct RequestLogger {
    buffer: Arc<Mutex<Vec<RequestLog>>>,
    ch_client: Client,
    shutdown: Arc<AtomicBool>,
}

impl RequestLogger {
    pub(crate) fn new(ch_client: Client) -> Self {
        Self {
            buffer: Arc::new(Mutex::new(Vec::with_capacity(1000))),
            ch_client,
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Log a request. This is non-blocking and adds to the buffer.
    pub(crate) async fn log(&self, request: RequestLog) {
        let mut buffer = self.buffer.lock().await;
        if buffer.len() >= MAX_BUFFER_SIZE {
            warn!("Request log buffer is full, dropping oldest entries");
            buffer.drain(0..1000);
        }
        buffer.push(request);
    }

    /// Start the background flush task
    pub(crate) fn start_background_flush(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        let logger = Arc::clone(&self);
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(FLUSH_INTERVAL_SECS));
            info!("Request logger background flush task started");

            loop {
                interval.tick().await;

                if logger.shutdown.load(Ordering::Relaxed) {
                    info!("Request logger shutting down, performing final flush");
                    logger.flush().await;
                    break;
                }

                logger.flush().await;
            }

            info!("Request logger background flush task stopped");
        })
    }

    /// Signal shutdown and wait for the background task to complete
    #[allow(dead_code)]
    pub(crate) fn signal_shutdown(&self) {
        self.shutdown.store(true, Ordering::Relaxed);
    }

    /// Flush the buffer to `ClickHouse`
    async fn flush(&self) {
        let logs: Vec<RequestLog> = {
            let mut buffer = self.buffer.lock().await;
            if buffer.is_empty() {
                return;
            }
            core::mem::take(&mut *buffer)
        };

        let count = logs.len();
        debug!("Flushing {count} request logs to ClickHouse");

        if let Err(e) = self.insert_batch(&logs).await {
            error!("Failed to insert request logs to ClickHouse: {e}");
            // Re-add failed logs back to the buffer (up to max size)
            let mut buffer = self.buffer.lock().await;
            let available_space = MAX_BUFFER_SIZE.saturating_sub(buffer.len());
            let to_restore = logs.into_iter().take(available_space);
            for log in to_restore {
                buffer.push(log);
            }
        } else {
            debug!("Successfully flushed {count} request logs to ClickHouse");
        }
    }

    async fn insert_batch(&self, logs: &[RequestLog]) -> clickhouse::error::Result<()> {
        let mut inserter = self.ch_client.insert::<RequestLog>("request_logs").await?;
        for log in logs {
            inserter.write(log).await?;
        }
        inserter.end().await?;
        Ok(())
    }
}
