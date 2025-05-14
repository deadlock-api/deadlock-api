use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use prost::Message;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use valveprotos::deadlock::EgcCitadelClientMessages;

#[derive(Debug, Clone)]
pub struct SteamProxyQuery<M: Message> {
    pub msg_type: EgcCitadelClientMessages,
    pub msg: M,
    pub in_all_groups: Option<Vec<String>>,
    pub in_any_groups: Option<Vec<String>>,
    pub cooldown_time: Duration,
    pub request_timeout: Duration,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SteamProxyRawResponse {
    pub data: String,
    pub username: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SteamProxyResponse<R: Message> {
    pub msg: R,
    pub username: String,
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
pub struct GetPlayerSummariesResponse {
    pub response: PlayerSummariesResponse,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PlayerSummariesResponse {
    pub players: Vec<PlayerSummary>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PlayerSummary {
    pub personaname: Option<String>,
}

pub type SteamProxyResult<T> = Result<T, SteamProxyError>;

/// Error type for Steam proxy calls
#[derive(Debug, Error)]
pub enum SteamProxyError {
    #[error("Failed to call Steam proxy: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("Failed to decode base64 data: {0}")]
    Base64Error(#[from] base64::DecodeError),
    #[error("Failed to parse protobuf message: {0}")]
    ProtobufError(#[from] prost::DecodeError),
}

/// Error type for Steam account name fetching
#[derive(Debug, Error)]
pub enum SteamAccountNameError {
    #[error("Failed to fetch steam name: {0}")]
    FetchError(String),
    #[error("Failed to parse steam name")]
    ParseError,
    #[error("Rate limit exceeded: {0}")]
    RateLimitExceeded(String),
}
