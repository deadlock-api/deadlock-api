use std::sync::Arc;

use tokio::sync::RwLock;
use tokio::task::AbortHandle;
use tokio::time::{Duration, interval};
use tracing::warn;

#[derive(Debug, thiserror::Error)]
pub(crate) enum PollError {
    #[error("Initial poll request failed")]
    Request(#[source] reqwest::Error),
    #[error("Initial poll request returned error status")]
    Status(#[source] reqwest::Error),
    #[error("Failed to read initial poll body")]
    Body(#[source] reqwest::Error),
}

/// Starts polling a given URL at a specified interval, updating the shared state with the latest plaintext response.
///
/// Returns an abort handle for the spawned poller and a shared lock holding the latest response text.
pub(crate) async fn start_polling_text(
    url: String,
    interval_duration: Duration,
) -> Result<(AbortHandle, Arc<RwLock<String>>), PollError> {
    let client = common::http_client();

    let initial = client
        .get(&url)
        .send()
        .await
        .map_err(PollError::Request)?
        .error_for_status()
        .map_err(PollError::Status)?
        .text()
        .await
        .map_err(PollError::Body)?;

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
