//! Shared HTTP clients. `reqwest::Client::new()` has no timeouts at all, so a stalled
//! peer would hang a loop forever.

use core::time::Duration;
use std::sync::LazyLock;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Total time for a request including the body, for plain API calls.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
/// Longest silence between reads, for downloads whose total time is unbounded.
const READ_TIMEOUT: Duration = Duration::from_secs(60);

static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .unwrap_or_else(|e| panic!("Failed to build HTTP client: {e}"))
});

static STREAMING_HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(READ_TIMEOUT)
        .build()
        .unwrap_or_else(|e| panic!("Failed to build streaming HTTP client: {e}"))
});

/// Process-wide client for API calls: 10s connect, 60s per request. Requests can set a
/// tighter `.timeout()` themselves. Cloning it is cheap and shares the connection pool.
#[must_use]
pub fn http_client() -> reqwest::Client {
    HTTP_CLIENT.clone()
}

/// Process-wide client for downloads that may legitimately take long: 10s connect and at
/// most 60s without receiving data, but no cap on the total.
#[must_use]
pub fn streaming_http_client() -> reqwest::Client {
    STREAMING_HTTP_CLIENT.clone()
}
