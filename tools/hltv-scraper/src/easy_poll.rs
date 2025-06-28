use reqwest::Client;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::{
    task::AbortHandle,
    time::{Duration, interval},
};

/// Starts polling a given URL at a specified interval, updating the shared state with the latest plaintext response.
///
/// # Arguments
///
/// * `url` - The URL to poll.
/// * `interval` - The interval duration to wait between polls.
///
/// # Returns
///
/// * `Arc<RwLock<String>>` - An atomic reference-counted pointer to the plaintext response data wrapped in a tokio read-write lock.
pub(crate) async fn start_polling_text(
    url: String,
    interval: Duration,
) -> (AbortHandle, Arc<RwLock<String>>) {
    start_polling_core(url, interval, |response| async move {
        response.text().await.ok()
    })
    .await
}

/// Core polling logic shared between JSON and plaintext polling functions.
///
/// # Arguments
///
/// * `url` - The URL to poll.
/// * `interval` - The interval duration to wait between polls.
/// * `parse_fn` - An async closure to parse the `reqwest::Response` into the desired type `T`.
///
/// # Returns
///
/// * `Arc<RwLock<T>>` - An atomic reference-counted pointer to the parsed response data wrapped in a tokio read-write lock.
async fn start_polling_core<T, F, Fut>(
    url: String,
    interval_duration: Duration,
    parse_fn: F,
) -> (AbortHandle, Arc<RwLock<T>>)
where
    T: Send + Sync + 'static,
    F: Fn(reqwest::Response) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Option<T>> + Send,
{
    let client = Client::new();

    // Perform an upfront request to get the initial value
    let initial_data = client
        .get(&url)
        .send()
        .await
        .expect("Failed to make initial request")
        .error_for_status()
        .expect("Initial request failed");

    let initial_parsed = parse_fn(initial_data)
        .await
        .expect("Failed to parse the initial response");

    let data = Arc::new(RwLock::new(initial_parsed));
    let data_clone = Arc::clone(&data);

    let join_handle = tokio::spawn(async move {
        let mut interval = interval(interval_duration);

        loop {
            interval.tick().await;

            match client.get(&url).send().await {
                Ok(response) => {
                    if let Ok(response) = response.error_for_status()
                        && let Some(parsed) = parse_fn(response).await
                    {
                        let mut data = data_clone.write().await;
                        *data = parsed;
                    }
                }
                Err(e) => eprintln!("Error polling URL: {e}"),
            }
        }
    });

    (join_handle.abort_handle(), data)
}
