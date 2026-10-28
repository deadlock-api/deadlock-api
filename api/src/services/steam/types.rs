use chrono::{DateTime, FixedOffset};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use steam_proxy::SteamProxyError;
use thiserror::Error;
use utoipa::ToSchema;

use crate::utils::parse::parse_rfc2822_datetime;

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

/// How the API answers a failed Steam proxy call.
pub(crate) trait SteamProxyErrorResponse {
    /// Status for the API's own response.
    fn response_status(&self) -> StatusCode;
    /// Message for the API's own response, telling the client to retry only when a later
    /// attempt can succeed.
    fn response_message(&self) -> &'static str;
    /// Seconds the client should wait before retrying, when the proxy's bot pool is drained.
    fn retry_after_secs(&self) -> Option<u64>;
}

impl SteamProxyErrorResponse for SteamProxyError {
    fn response_status(&self) -> StatusCode {
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
            | Self::NoProxyUrl => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn response_message(&self) -> &'static str {
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
            Self::NoProxyUrl => "No Steam proxy URL configured.",
        }
    }

    fn retry_after_secs(&self) -> Option<u64> {
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
