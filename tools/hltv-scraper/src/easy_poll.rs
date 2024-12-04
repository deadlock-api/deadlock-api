use serde::de::DeserializeOwned;
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Duration;

/// Starts polling a given URL at a specified interval, updating the shared state with the latest decoded JSON response.
///
/// # Arguments
///
/// * `url` - The URL to poll.
/// * `interval` - The interval duration to wait between polls.
///
/// # Returns
///
/// * `Arc<RwLock<T>>` - An atomic reference-counted pointer to the JSON response data wrapped in a read-write lock.
#[allow(unused)]
pub fn start_polling_json<T>(url: String, interval: Duration) -> Arc<RwLock<T>>
where
    T: DeserializeOwned + Send + Sync + 'static,
{
    start_polling_core(url, interval, |response| response.json::<T>().ok())
}

/// Starts polling a given URL at a specified interval, updating the shared state with the latest plaintext response.
///
/// # Arguments
///
/// * `url` - The URL to poll.
/// * `interval` - The interval duration to wait between polls.
///
/// # Returns
///
/// * `Arc<RwLock<String>>` - An atomic reference-counted pointer to the plaintext response data wrapped in a read-write lock.
pub fn start_polling_text(url: String, interval: Duration) -> Arc<RwLock<String>> {
    start_polling_core(url, interval, |response| response.text().ok())
}

/// Core polling logic shared between JSON and plaintext polling functions.
///
/// # Arguments
///
/// * `url` - The URL to poll.
/// * `interval` - The interval duration to wait between polls.
/// * `parse_fn` - A closure to parse the `reqwest::blocking::Response` into the desired type `T`.
///
/// # Returns
///
/// * `Arc<RwLock<T>>` - An atomic reference-counted pointer to the parsed response data wrapped in a read-write lock.
fn start_polling_core<T, F>(url: String, interval: Duration, parse_fn: F) -> Arc<RwLock<T>>
where
    T: Send + Sync + 'static,
    F: Fn(reqwest::blocking::Response) -> Option<T> + Send + Sync + 'static,
{
    // Perform an upfront request to get the initial value
    let client = reqwest::blocking::Client::new();
    let initial_data = match client.get(&url).send() {
        Ok(response) => parse_fn(response).expect("Failed to parse the initial response"),
        Err(e) => panic!("Error making the initial request: {}", e),
    };

    let data = Arc::new(RwLock::new(initial_data));
    let data_clone = Arc::clone(&data);

    thread::spawn(move || loop {
        match client.get(&url).send() {
            Ok(response) => {
                if let Some(parsed) = parse_fn(response) {
                    if let Ok(mut data) = data_clone.write() {
                        *data = parsed;
                    }
                }
            }
            Err(e) => eprintln!("Error polling URL: {}", e),
        }

        thread::sleep(interval);
    });

    data
}
