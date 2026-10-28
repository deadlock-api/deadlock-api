use core::time::Duration;
use std::sync::Arc;

use chrono::{DateTime, FixedOffset};
use prost::Message;
use reqwest::StatusCode;
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

pub(crate) use common::SteamProxyResponse as SteamProxyRawResponse;

/// Body of a non-success proxy response. Auth and bad-request errors are plain text instead.
#[derive(Debug, Deserialize)]
struct SteamProxyErrorResponse {
    message: String,
    pool_limit_info: Option<SteamProxyPoolLimitInfo>,
}

#[derive(Debug, Deserialize)]
struct SteamProxyPoolLimitInfo {
    wait_for_millis: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamProxyResponse<M: Message> {
    pub(crate) msg: M,
    pub(crate) username: String,
}

impl<M: Message + Default> TryFrom<SteamProxyRawResponse> for SteamProxyResponse<M> {
    type Error = SteamProxyError;

    fn try_from(raw: SteamProxyRawResponse) -> Result<Self, Self::Error> {
        let msg = raw.decode::<M, SteamProxyError>()?;
        Ok(Self {
            msg,
            username: raw.username,
        })
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

/// Error type for Steam proxy calls. Cloneable, so a cached failure can be replayed.
#[derive(Debug, Clone, Error)]
pub(crate) enum SteamProxyError {
    #[error("no proxy base url configured")]
    NoBaseUrl,
    #[error("request timed out: {0}")]
    Timeout(Arc<reqwest::Error>),
    #[error("failed to decode proxy response: {0}")]
    Decode(Arc<reqwest::Error>),
    #[error("request failed: {0}")]
    Request(Arc<reqwest::Error>),
    /// Every bot that could serve the request is on cooldown (429).
    #[error("all bots are on cooldown: {message}")]
    Cooldown {
        message: String,
        /// The proxy's suggested wait before the next request of the same kind.
        wait_for: Option<Duration>,
    },
    /// No bot of the group is logged in (503).
    #[error("no bot is alive: {0}")]
    NoAliveBots(String),
    /// The bot failed even after retries and was reset (502), or the proxy's store failed (500).
    #[error("proxy failed with {0}: {1}")]
    Failed(StatusCode, String),
    /// Bad auth or a malformed request: the same request fails again.
    #[error("proxy rejected the request with {0}: {1}")]
    Rejected(StatusCode, String),
    #[error("failed to decode base64 data: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("failed to parse protobuf message: {0}")]
    Protobuf(#[from] prost::DecodeError),
}

impl From<reqwest::Error> for SteamProxyError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            Self::Timeout(Arc::new(e))
        } else if e.is_decode() {
            Self::Decode(Arc::new(e))
        } else {
            Self::Request(Arc::new(e))
        }
    }
}

impl SteamProxyError {
    /// Classifies a non-success proxy response by its status and body.
    pub(crate) fn from_status(status: StatusCode, body: String) -> Self {
        let (message, wait_for) = match serde_json::from_str(&body) {
            Ok(SteamProxyErrorResponse {
                message,
                pool_limit_info,
            }) => (
                message,
                pool_limit_info.map(|i| Duration::from_millis(i.wait_for_millis)),
            ),
            Err(_) => (body, None),
        };
        match status {
            StatusCode::TOO_MANY_REQUESTS => Self::Cooldown { message, wait_for },
            StatusCode::SERVICE_UNAVAILABLE => Self::NoAliveBots(message),
            s if s.is_server_error() => Self::Failed(s, message),
            s => Self::Rejected(s, message),
        }
    }

    /// Status for the API's own response.
    pub(crate) const fn response_status(&self) -> StatusCode {
        match self {
            Self::Cooldown { .. } | Self::NoAliveBots(_) | Self::Request(_) => {
                StatusCode::SERVICE_UNAVAILABLE
            }
            Self::Failed(..) => StatusCode::BAD_GATEWAY,
            Self::Timeout(_) => StatusCode::GATEWAY_TIMEOUT,
            Self::Rejected(..)
            | Self::Decode(_)
            | Self::Base64(_)
            | Self::Protobuf(_)
            | Self::NoBaseUrl => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// Message for the API's own response, telling the client to retry only when a later
    /// attempt can succeed.
    pub(crate) const fn response_message(&self) -> &'static str {
        match self {
            Self::Cooldown { .. } | Self::NoAliveBots(_) => {
                "Steam is busy. Retry after the delay in the Retry-After header."
            }
            Self::Failed(..) => "Steam failed to answer the request. Retry your request later.",
            Self::Timeout(_) => "Steam took too long to answer. Retry your request later.",
            Self::Request(_) => "Failed to reach Steam. Retry your request later.",
            Self::Rejected(..) => "The Steam proxy rejected the request. Retrying won't help.",
            Self::Decode(_) => {
                "Failed to parse the response from the Steam proxy. Retrying won't help."
            }
            Self::Base64(_) => "Failed to decode base64 data from Steam. Retrying won't help.",
            Self::Protobuf(_) => {
                "Failed to parse protobuf message from Steam. Retrying won't help."
            }
            Self::NoBaseUrl => "No Steam proxy URL configured.",
        }
    }

    /// Whether the same call can succeed when repeated right away.
    pub(crate) const fn is_retryable(&self) -> bool {
        matches!(self, Self::Request(_) | Self::Timeout(_) | Self::Failed(..))
    }

    /// Seconds the client should wait before retrying, when the proxy's bot pool is drained.
    pub(crate) fn retry_after_secs(&self) -> Option<u64> {
        match self {
            Self::Cooldown { wait_for, .. } => {
                Some(wait_for.map_or(10, |w| w.as_secs().saturating_add(1)))
            }
            // Bots come back as they reconnect.
            Self::NoAliveBots(_) => Some(60),
            _ => None,
        }
    }
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

#[derive(Debug, Deserialize)]
pub(super) struct ForumRssV2 {
    pub(crate) channel: ForumChannelV2,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ForumChannelV2 {
    #[serde(default, rename = "item")]
    pub(crate) patch_notes: Vec<ForumPatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub(crate) struct ForumPatch {
    pub(crate) title: String,
    #[serde(deserialize_with = "parse_rfc2822_datetime")]
    pub(crate) pub_date: DateTime<FixedOffset>,
    pub(crate) link: String,
    pub(crate) guid: PatchGuid,
    pub(crate) category: PatchCategory,
    #[serde(rename(deserialize = "encoded"))]
    pub(crate) content: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct SteamRss {
    pub(crate) channel: SteamChannel,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SteamChannel {
    #[serde(default, rename = "item")]
    pub(crate) patch_notes: Vec<SteamNews>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub(crate) struct SteamNews {
    pub(crate) title: String,
    #[serde(deserialize_with = "parse_rfc2822_datetime")]
    pub(crate) pub_date: DateTime<FixedOffset>,
    pub(crate) link: String,
    pub(crate) guid: PatchGuid,
    #[serde(rename(deserialize = "description"))]
    pub(crate) content: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(tag = "source", rename_all = "lowercase")]
pub(crate) enum FeedItem {
    Forum(ForumPatch),
    Steam(SteamNews),
}

impl FeedItem {
    pub(crate) const fn pub_date(&self) -> DateTime<FixedOffset> {
        match self {
            Self::Forum(p) => p.pub_date,
            Self::Steam(p) => p.pub_date,
        }
    }
}
