use core::time::Duration;
use std::collections::HashMap;

use axum::http::StatusCode;
use tokio::sync::{mpsc, oneshot};
use tracing::warn;

use crate::error::{APIError, APIResult};
use crate::routes::v1::players::steam::route::{SteamProfile, build_query_many};

const BATCH_WINDOW: Duration = Duration::from_millis(100);
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
        response_rx.await.map_err(|_| APIError::InternalError {
            message: "Batcher dropped response".to_string(),
        })?
    }
}

async fn batch_loop(ch_client: clickhouse::Client, mut rx: mpsc::Receiver<BatchRequest>) {
    while let Some(first) = rx.recv().await {
        let mut pending = vec![first];

        let deadline = tokio::time::Instant::now() + BATCH_WINDOW;
        loop {
            if pending.len() >= MAX_BATCH_SIZE {
                break;
            }
            match tokio::time::timeout_at(deadline, rx.recv()).await {
                Ok(Some(req)) => pending.push(req),
                Ok(None) | Err(_) => break,
            }
        }

        let ch = ch_client.clone();
        tokio::spawn(async move { execute_batch(&ch, pending).await });
    }
}

async fn execute_batch(ch_client: &clickhouse::Client, pending: Vec<BatchRequest>) {
    let mut senders: HashMap<u32, Vec<oneshot::Sender<APIResult<SteamProfile>>>> = HashMap::new();
    for req in pending {
        senders
            .entry(req.account_id)
            .or_default()
            .push(req.response_tx);
    }

    let account_ids: Vec<u32> = senders.keys().copied().collect();
    let query = build_query_many(&account_ids);

    match ch_client.query(&query).fetch_all::<SteamProfile>().await {
        Ok(profiles) => {
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
