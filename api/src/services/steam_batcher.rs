use core::time::Duration;
use std::collections::HashMap;

use axum::http::StatusCode;
use metrics::{counter, gauge, histogram};
use tokio::sync::{mpsc, oneshot};
use tracing::warn;

use crate::error::{APIError, APIResult};
use crate::routes::v1::players::steam::route::{SteamProfile, build_query_many};

const MIN_BATCH_WINDOW_MS: u64 = 0;
const MAX_BATCH_WINDOW_MS: u64 = 300;
const MAX_BATCH_SIZE: usize = 1000;

struct BatchRequest {
    account_id: u32,
    response_tx: oneshot::Sender<APIResult<SteamProfile>>,
}

#[derive(Clone)]
pub(crate) struct SteamProfileBatcher {
    tx: mpsc::Sender<BatchRequest>,
}

impl SteamProfileBatcher {
    pub(crate) fn new(ch_client: clickhouse::Client) -> Self {
        let (tx, rx) = mpsc::channel(4096);
        tokio::spawn(batch_loop(ch_client, rx));
        Self { tx }
    }

    pub(crate) async fn load(&self, account_id: u32) -> APIResult<SteamProfile> {
        let (response_tx, response_rx) = oneshot::channel();
        self.tx
            .send(BatchRequest {
                account_id,
                response_tx,
            })
            .await
            .map_err(|_| APIError::InternalError {
                message: "Batcher unavailable".to_string(),
            })?;
        counter!("steam_batcher.requests").increment(1);
        response_rx.await.map_err(|_| APIError::InternalError {
            message: "Batcher dropped response".to_string(),
        })?
    }
}

fn adaptive_window(prev_batch_size: usize) -> Duration {
    let clamped = prev_batch_size.min(MAX_BATCH_SIZE) as u64;
    let ms = MIN_BATCH_WINDOW_MS
        + (MAX_BATCH_WINDOW_MS - MIN_BATCH_WINDOW_MS) * clamped / MAX_BATCH_SIZE as u64;
    Duration::from_millis(ms)
}

async fn batch_loop(ch_client: clickhouse::Client, mut rx: mpsc::Receiver<BatchRequest>) {
    let mut prev_batch_size: usize = 0;

    while let Some(first) = rx.recv().await {
        let mut pending = vec![first];

        let window = adaptive_window(prev_batch_size);
        let deadline = tokio::time::Instant::now() + window;
        loop {
            if pending.len() >= MAX_BATCH_SIZE {
                break;
            }
            match tokio::time::timeout_at(deadline, rx.recv()).await {
                Ok(Some(req)) => pending.push(req),
                Ok(None) | Err(_) => break,
            }
        }

        prev_batch_size = pending.len();
        gauge!("steam_batcher.window_ms").set(window.as_secs_f64() * 1000.0);

        let ch = ch_client.clone();
        tokio::spawn(async move { execute_batch(&ch, pending).await });
    }
}

#[allow(clippy::cast_precision_loss)] // batch sizes are small (<= 1000)
async fn execute_batch(ch_client: &clickhouse::Client, pending: Vec<BatchRequest>) {
    let batch_size = pending.len();
    let mut senders: HashMap<u32, Vec<oneshot::Sender<APIResult<SteamProfile>>>> = HashMap::new();
    for req in pending {
        senders
            .entry(req.account_id)
            .or_default()
            .push(req.response_tx);
    }

    let unique_ids = senders.len();
    histogram!("steam_batcher.batch_size").record(batch_size as f64);
    histogram!("steam_batcher.unique_ids").record(unique_ids as f64);
    counter!("steam_batcher.batches").increment(1);

    let account_ids: Vec<u32> = senders.keys().copied().collect();
    let query = build_query_many(&account_ids);

    let start = tokio::time::Instant::now();
    match ch_client.query(&query).fetch_all::<SteamProfile>().await {
        Ok(profiles) => {
            histogram!("steam_batcher.query_duration_seconds")
                .record(start.elapsed().as_secs_f64());

            for profile in profiles {
                if let Some(txs) = senders.remove(&profile.account_id) {
                    let mut txs = txs;
                    if let Some(last) = txs.pop() {
                        for tx in txs {
                            let _ = tx.send(Ok(profile.clone()));
                        }
                        let _ = last.send(Ok(profile));
                    }
                }
            }
            // Remaining senders had no matching profile
            let not_found = senders.len();
            if not_found > 0 {
                counter!("steam_batcher.not_found").increment(not_found as u64);
            }
            for (_, txs) in senders {
                for tx in txs {
                    let _ = tx.send(Err(APIError::status_msg(
                        StatusCode::NOT_FOUND,
                        "Steam profile not found.",
                    )));
                }
            }
        }
        Err(e) => {
            histogram!("steam_batcher.query_duration_seconds")
                .record(start.elapsed().as_secs_f64());
            counter!("steam_batcher.errors").increment(1);
            warn!("Batch steam profile query failed: {e}");
            for (_, txs) in senders {
                for tx in txs {
                    let _ = tx.send(Err(APIError::InternalError {
                        message: "Failed to fetch steam profile".to_string(),
                    }));
                }
            }
        }
    }
}
