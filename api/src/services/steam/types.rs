use core::time::Duration;

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use chrono::{DateTime, FixedOffset};
use prost::Message;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use utoipa::ToSchema;
use valveprotos::deadlock::EgcCitadelClientMessages;

use crate::utils::parse::parse_rfc2822_datetime;

#[derive(Debug, Clone)]
pub(crate) struct SteamProxyQuery<M: Message> {
    pub(crate) msg_type: EgcCitadelClientMessages,
    pub(crate) msg: M,
    pub(crate) in_all_groups: Option<Vec<String>>,
    pub(crate) in_any_groups: Option<Vec<String>>,
    pub(crate) cooldown_time: Duration,
    pub(crate) soft_cooldown_millis: Option<Duration>,
    pub(crate) request_timeout: Duration,
    pub(crate) username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamProxyRawResponse {
    pub(crate) data: String,
    pub(crate) username: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamProxyResponse<M: Message> {
    pub(crate) msg: M,
    pub(crate) username: String,
}

impl<M: Message + Default> TryFrom<SteamProxyRawResponse> for SteamProxyResponse<M> {
    type Error = SteamProxyError;

    fn try_from(
        SteamProxyRawResponse { data, username }: SteamProxyRawResponse,
    ) -> Result<Self, Self::Error> {
        let decoded_data = BASE64_STANDARD.decode(&data)?;
        let msg = M::decode(decoded_data.as_slice())?;
        Ok(SteamProxyResponse { msg, username })
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(super) struct GetPlayerSummariesResponse {
    pub(super) response: PlayerSummariesResponse,
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct GetSteamServerListResponse {
    pub(super) response: SteamServerListResponse,
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct SteamServerListResponse {
    #[serde(default)]
    pub(super) servers: Vec<SteamServer>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub(crate) struct SteamServer {
    /// Full address of the server including port (e.g. `1.2.3.4:27015`)
    pub(crate) addr: String,
    /// Game port the server is listening on
    pub(crate) gameport: u16,
    /// `SteamID` of the server
    pub(crate) steamid: String,
    /// Server name as advertised to Steam
    pub(crate) name: String,
    /// Steam appid of the game running on this server
    pub(crate) appid: u32,
    /// Internal game directory name
    pub(crate) gamedir: String,
    /// Server build version
    pub(crate) version: String,
    /// Product identifier reported by the server
    pub(crate) product: String,
    /// Steam region code reported by the server
    pub(crate) region: i32,
    /// Current player count
    pub(crate) players: u32,
    /// Maximum player count
    pub(crate) max_players: u32,
    /// Number of bots on the server
    pub(crate) bots: u32,
    /// Current map
    pub(crate) map: String,
    /// Whether the server is VAC-secured
    pub(crate) secure: bool,
    /// Whether this is a dedicated server
    pub(crate) dedicated: bool,
    /// Operating system the server is running on (e.g. `l` for Linux, `w` for Windows)
    pub(crate) os: String,
    /// Steam gametype tags
    pub(crate) gametype: String,
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
    #[error("No base url set")]
    NoBaseUrl,
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

/// Error type for Steam account name fetching
#[derive(Debug, Error)]
pub(crate) enum SteamAccountVerifyError {
    #[error(transparent)]
    FetchError(#[from] reqwest::Error),
    #[error("Failed to verify ownership")]
    VerificationFailed,
}

#[derive(Debug, Deserialize)]
pub(super) struct Rss {
    pub(crate) channel: Channel,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Channel {
    #[serde(rename = "item")]
    pub(crate) patch_notes: Vec<Patch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub(crate) struct Patch {
    pub(crate) title: String,
    #[serde(deserialize_with = "parse_rfc2822_datetime")]
    pub(crate) pub_date: DateTime<FixedOffset>,
    pub(crate) link: String,
    pub(crate) guid: PatchGuid,
    pub(crate) author: String,
    pub(crate) category: PatchCategory,
    #[serde(rename(deserialize = "creator"))]
    pub(crate) dc_creator: String,
    #[serde(rename(deserialize = "encoded"))]
    pub(crate) content_encoded: String,
    #[serde(rename(deserialize = "comments"))]
    pub(crate) slash_comments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub(crate) struct PatchGuid {
    #[serde(rename(deserialize = "@isPermaLink"))]
    pub(crate) is_perma_link: bool,
    #[serde(rename(deserialize = "$text"))]
    pub(crate) text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub(crate) struct PatchCategory {
    #[serde(rename(deserialize = "@domain"))]
    pub(crate) domain: String,
    #[serde(rename(deserialize = "$text"))]
    pub(crate) text: String,
}
