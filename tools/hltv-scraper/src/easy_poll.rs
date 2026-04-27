use std::sync::Arc;

use anyhow::Context;
use reqwest::Client;
use tokio::sync::RwLock;
use tokio::task::AbortHandle;
use tokio::time::{Duration, interval};
use tracing::warn;

/// Starts polling a given URL at a specified interval, updating the shared state with the latest plaintext response.
///
/// Returns an abort handle for the spawned poller and a shared lock holding the latest response text.
pub(crate) async fn start_polling_text(
    url: String,
    interval_duration: Duration,
) -> anyhow::Result<(AbortHandle, Arc<RwLock<String>>)> {
    let client = Client::new();

    let initial = client
        .get(&url)
        .send()
        .await
        .context("Initial poll request failed")?
        .error_for_status()
        .context("Initial poll request returned error status")?
        .text()
        .await
        .context("Failed to read initial poll body")?;

    let data = Arc::new(RwLock::new(initial));
    let data_clone = Arc::clone(&data);

    let join_handle = tokio::spawn(async move {
        let mut ticker = interval(interval_duration);

        loop {
            ticker.tick().await;

            match client.get(&url).send().await {
                Ok(response) => {
                    if let Ok(response) = response.error_for_status()
                        && let Ok(parsed) = response.text().await
                    {
                        let mut data = data_clone.write().await;
                        *data = parsed;
                    }
                }
                Err(e) => warn!("Error polling URL: {e}"),
            }
        }
    });

    Ok((join_handle.abort_handle(), data))
}
