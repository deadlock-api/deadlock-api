use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use prost::Message;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use valveprotos::deadlock::EgcCitadelClientMessages;

#[derive(Debug, Clone)]
pub(crate) struct SteamProxyQuery<M: Message> {
    pub(crate) msg_type: EgcCitadelClientMessages,
    pub(crate) msg: M,
    pub(crate) in_all_groups: Option<Vec<String>>,
    pub(crate) in_any_groups: Option<Vec<String>>,
    pub(crate) cooldown_time: Duration,
    pub(crate) request_timeout: Duration,
    pub(crate) username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamProxyRawResponse {
    pub(crate) data: String,
    username: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamProxyResponse<R: Message> {
    pub(crate) msg: R,
    pub(crate) username: String,
}

impl<R: Message + Default> TryFrom<SteamProxyRawResponse> for SteamProxyResponse<R> {
    type Error = SteamProxyError;

    fn try_from(
        SteamProxyRawResponse { data, username }: SteamProxyRawResponse,
    ) -> Result<Self, Self::Error> {
        let decoded_data = BASE64_STANDARD.decode(&data)?;
        let msg = R::decode(decoded_data.as_slice())?;
        Ok(SteamProxyResponse { msg, username })
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(super) struct GetPlayerSummariesResponse {
    pub(super) response: PlayerSummariesResponse,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(super) struct PlayerSummariesResponse {
    pub(super) players: Vec<PlayerSummary>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(super) struct PlayerSummary {
    pub(super) personaname: Option<String>,
}

pub(crate) type SteamProxyResult<T> = Result<T, SteamProxyError>;

/// Error type for Steam proxy calls
#[derive(Debug, Error)]
pub(crate) enum SteamProxyError {
    #[error("Failed to call Steam proxy: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Failed to decode base64 data: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("Failed to parse protobuf message: {0}")]
    Protobuf(#[from] prost::DecodeError),
}

/// Error type for Steam account name fetching
#[derive(Debug, Error)]
pub(crate) enum SteamAccountNameError {
    #[error("Failed to fetch steam name: {0}")]
    FetchError(String),
    #[error("Failed to parse steam name")]
    ParseError,
    #[error("Rate limit exceeded: {0}")]
    RateLimitExceeded(String),
}
