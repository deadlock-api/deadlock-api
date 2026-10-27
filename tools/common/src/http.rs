//! Shared HTTP clients. `reqwest::Client::new()` has no timeouts at all, so a stalled
//! peer would hang a loop forever.

use core::time::Duration;
use std::sync::OnceLock;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Total time for a request including the body, for plain API calls.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
/// Longest silence between reads, for downloads whose total time is unbounded.
const READ_TIMEOUT: Duration = Duration::from_secs(60);

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static STREAMING_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// The client in `cell`, built by `build` on first use. Racing first calls may each build one;
/// all but the first are dropped.
fn shared_client(
    cell: &OnceLock<reqwest::Client>,
    build: impl FnOnce() -> reqwest::Result<reqwest::Client>,
) -> reqwest::Result<reqwest::Client> {
    if let Some(client) = cell.get() {
        return Ok(client.clone());
    }
    let client = build()?;
    Ok(cell.get_or_init(|| client).clone())
}

/// Process-wide client for API calls: 10s connect, 60s per request. Requests can set a
/// tighter `.timeout()` themselves. Cloning it is cheap and shares the connection pool.
pub fn http_client() -> reqwest::Result<reqwest::Client> {
    shared_client(&HTTP_CLIENT, || {
        reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
    })
}

/// Process-wide client for downloads that may legitimately take long: 10s connect and at
/// most 60s without receiving data, but no cap on the total.
pub fn streaming_http_client() -> reqwest::Result<reqwest::Client> {
    shared_client(&STREAMING_HTTP_CLIENT, || {
        reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .read_timeout(READ_TIMEOUT)
            .build()
    })
}
