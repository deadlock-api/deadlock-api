use core::time::Duration;

use serde::Deserialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppStateError {
    #[error("Parsing error: {0}")]
    ParsingConfig(#[from] serde_env::Error),
    #[error("HTTP client error: {0}")]
    HttpClient(#[from] reqwest::Error),
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct Config {
    #[serde(default)]
    pub(crate) deadlock_api_key: Option<String>,
}

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) config: Config,
    pub(crate) http_client: reqwest::Client,
}

impl AppState {
    pub(crate) fn from_env() -> Result<AppState, AppStateError> {
        let config = serde_env::from_env()?;
        // Broadcasts stream for as long as their match runs, so bound connects and the
        // silence between reads rather than each request's total time.
        let http_client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(60))
            .build()?;
        Ok(Self {
            config,
            http_client,
        })
    }
}
