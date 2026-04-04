use serde::Deserialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppStateError {
    #[error("Parsing error: {0}")]
    ParsingConfig(#[from] serde_env::Error),
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
    #[allow(clippy::too_many_lines)]
    pub(crate) fn from_env() -> Result<AppState, AppStateError> {
        let config = serde_env::from_env()?;
        let http_client = reqwest::Client::new();
        Ok(Self {
            config,
            http_client,
        })
    }
}
