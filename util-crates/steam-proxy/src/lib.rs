//! Client side of sv-proxy, which runs Game Coordinator jobs on a pool of Steam bots.

#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

use core::time::Duration;
use std::sync::Arc;

use base64::Engine as _;
use base64::prelude::BASE64_STANDARD;
use metrics::counter;
use prost::Message;
use rand::prelude::IndexedRandom as _;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use tracing::{instrument, warn};
use valveprotos::deadlock::EgcCitadelClientMessages;

/// Body of a job request to sv-proxy. `S` is the string type of the bot group names.
#[derive(Debug, Serialize)]
pub struct SteamProxyRequest<'a, S> {
    /// The [`EgcCitadelClientMessages`] value of the message.
    pub message_kind: i32,
    /// How long the bot rests after the job.
    pub job_cooldown_millis: u128,
    /// How long the bot rests after Steam rate-limited the job.
    pub rate_limit_cooldown_millis: u128,
    /// How far into its cooldown a bot still counts as ready.
    pub soft_cooldown_millis: u128,
    /// Only use bots that are in all of these groups.
    pub bot_in_all_groups: Option<&'a [S]>,
    /// Only use bots that are in any of these groups.
    pub bot_in_any_groups: Option<&'a [S]>,
    /// Run the job on this bot.
    pub bot_username: Option<&'a str>,
    /// The message, see [`SteamProxyRequest::encode_message`].
    pub data: String,
}

impl<S> SteamProxyRequest<'_, S> {
    /// The `data` of a request: the protobuf-encoded message in base64.
    pub fn encode_message(msg: &impl Message) -> String {
        BASE64_STANDARD.encode(msg.encode_to_vec())
    }
}

/// Body of a successful sv-proxy job response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamProxyResponse {
    /// The protobuf-encoded response message in base64, see [`SteamProxyResponse::decode`].
    pub data: String,
    /// The bot that ran the job.
    pub username: String,
}

impl SteamProxyResponse {
    /// Decodes the response message.
    pub fn decode<M, E>(&self) -> Result<M, E>
    where
        M: Message + Default,
        E: From<base64::DecodeError> + From<prost::DecodeError>,
    {
        let data = BASE64_STANDARD.decode(&self.data)?;
        Ok(M::decode(data.as_slice())?)
    }
}

/// A decoded sv-proxy job response.
#[derive(Debug, Clone)]
pub struct SteamProxyReply<M> {
    /// The response message.
    pub msg: M,
    /// The bot that ran the job.
    pub username: String,
}

impl<M: Message + Default> TryFrom<SteamProxyResponse> for SteamProxyReply<M> {
    type Error = SteamProxyError;

    fn try_from(response: SteamProxyResponse) -> Result<Self, Self::Error> {
        Ok(Self {
            msg: response.decode::<M, SteamProxyError>()?,
            username: response.username,
        })
    }
}

/// Body of a non-success sv-proxy response. Auth and bad-request errors are plain text instead.
#[derive(Debug, Deserialize)]
struct SteamProxyErrorResponse {
    message: String,
    pool_limit_info: Option<SteamProxyPoolLimitInfo>,
}

#[derive(Debug, Deserialize)]
struct SteamProxyPoolLimitInfo {
    wait_for_millis: u64,
}

/// Error of a sv-proxy call. Cloneable, so a cached failure can be replayed.
#[derive(Debug, Clone, thiserror::Error)]
pub enum SteamProxyError {
    #[error("no proxy url configured")]
    NoProxyUrl,
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
    #[must_use]
    pub fn from_status(status: StatusCode, body: String) -> Self {
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

    /// Whether the same call can succeed when repeated right away.
    #[must_use]
    pub const fn is_retryable(&self) -> bool {
        matches!(self, Self::Request(_) | Self::Timeout(_) | Self::Failed(..))
    }
}

/// How sv-proxy should route and pace one call.
#[derive(Debug, Clone, Copy)]
pub struct SteamProxyOptions<'a> {
    /// Only use bots that are in all of these groups.
    pub in_all_groups: Option<&'a [&'a str]>,
    /// Only use bots that are in any of these groups.
    pub in_any_groups: Option<&'a [&'a str]>,
    /// How long the bot rests after the job. A rate limit rests it
    /// [`SteamProxyClient::with_rate_limit_cooldown_factor`] times as long.
    pub cooldown: Duration,
    /// How far into its cooldown a bot still counts as ready. `None` means half the cooldown.
    pub soft_cooldown: Option<Duration>,
    /// Total time allowed for the proxy request.
    pub request_timeout: Duration,
    /// Run the job on this bot.
    pub username: Option<&'a str>,
}

/// Client for sv-proxy. Spreads calls over its proxy urls at random.
#[derive(Debug, Clone)]
pub struct SteamProxyClient {
    http_client: reqwest::Client,
    urls: Vec<String>,
    api_key: String,
    rate_limit_cooldown_factor: u32,
}

impl SteamProxyClient {
    /// A client for the given proxy urls. A rate-limited bot rests twice its job cooldown.
    #[must_use]
    pub const fn new(http_client: reqwest::Client, urls: Vec<String>, api_key: String) -> Self {
        Self {
            http_client,
            urls,
            api_key,
            rate_limit_cooldown_factor: 2,
        }
    }

    /// A client configured by `STEAM_PROXY_URL` (comma-separated urls) and `STEAM_PROXY_API_KEY`.
    #[must_use]
    pub fn from_env(http_client: reqwest::Client) -> Self {
        let env = |name| {
            std::env::var(name).unwrap_or_else(|_| {
                warn!("{name} not set");
                String::new()
            })
        };
        let urls = env("STEAM_PROXY_URL")
            .split(',')
            .map(str::trim)
            .filter(|url| !url.is_empty())
            .map(str::to_owned)
            .collect();
        Self::new(http_client, urls, env("STEAM_PROXY_API_KEY"))
    }

    /// How many job cooldowns a bot rests after Steam rate-limited its job.
    #[must_use]
    pub const fn with_rate_limit_cooldown_factor(mut self, factor: u32) -> Self {
        self.rate_limit_cooldown_factor = factor;
        self
    }

    /// Runs a job and decodes its response message.
    pub async fn call<R: Message + Default>(
        &self,
        msg_type: EgcCitadelClientMessages,
        msg: &impl Message,
        options: SteamProxyOptions<'_>,
    ) -> Result<SteamProxyReply<R>, SteamProxyError> {
        self.call_raw(msg_type, msg, options).await?.try_into()
    }

    /// Runs a job and returns its response undecoded.
    #[instrument(skip(self, msg))]
    pub async fn call_raw(
        &self,
        msg_type: EgcCitadelClientMessages,
        msg: &impl Message,
        options: SteamProxyOptions<'_>,
    ) -> Result<SteamProxyResponse, SteamProxyError> {
        let result = self.send(msg_type, msg, options).await;
        let msg_type = msg_type.as_str_name();
        match result {
            Ok(_) => counter!("steam_proxy.call.success", "msg_type" => msg_type).increment(1),
            Err(_) => counter!("steam_proxy.call.failure", "msg_type" => msg_type).increment(1),
        }
        result
    }

    async fn send(
        &self,
        msg_type: EgcCitadelClientMessages,
        msg: &impl Message,
        options: SteamProxyOptions<'_>,
    ) -> Result<SteamProxyResponse, SteamProxyError> {
        let SteamProxyOptions {
            in_all_groups,
            in_any_groups,
            cooldown,
            soft_cooldown,
            request_timeout,
            username,
        } = options;
        let url = self
            .urls
            .choose(&mut rand::rng())
            .ok_or(SteamProxyError::NoProxyUrl)?;
        let soft_cooldown =
            soft_cooldown.unwrap_or_else(|| cooldown.checked_div(2).unwrap_or_default());
        let response = self
            .http_client
            .post(url)
            .bearer_auth(&self.api_key)
            .timeout(request_timeout)
            .json(&SteamProxyRequest {
                message_kind: msg_type as i32,
                job_cooldown_millis: cooldown.as_millis(),
                rate_limit_cooldown_millis: cooldown
                    .as_millis()
                    .saturating_mul(self.rate_limit_cooldown_factor.into()),
                soft_cooldown_millis: soft_cooldown.as_millis(),
                bot_in_all_groups: in_all_groups,
                bot_in_any_groups: in_any_groups,
                bot_username: username,
                data: SteamProxyRequest::<&str>::encode_message(msg),
            })
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(SteamProxyError::from_status(status, body));
        }
        Ok(response.json().await?)
    }
}

#[cfg(test)]
mod tests {
    use valveprotos::deadlock::CMsgClientToGcGetMatchMetaData;

    use super::*;

    #[test]
    fn request_body_matches_sv_proxy() {
        let msg = CMsgClientToGcGetMatchMetaData {
            match_id: Some(42),
            ..Default::default()
        };
        let body = SteamProxyRequest {
            message_kind: EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData as i32,
            job_cooldown_millis: 1000,
            rate_limit_cooldown_millis: 4000,
            soft_cooldown_millis: 500,
            bot_in_all_groups: Some(&["a"][..]),
            bot_in_any_groups: None,
            bot_username: Some("bot"),
            data: SteamProxyRequest::<&str>::encode_message(&msg),
        };
        assert_eq!(
            serde_json::to_value(&body).unwrap(),
            serde_json::json!({
                "message_kind": EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData as i32,
                "job_cooldown_millis": 1000,
                "rate_limit_cooldown_millis": 4000,
                "soft_cooldown_millis": 500,
                "bot_in_all_groups": ["a"],
                "bot_in_any_groups": null,
                "bot_username": "bot",
                "data": BASE64_STANDARD.encode(msg.encode_to_vec()),
            })
        );

        let response = SteamProxyResponse {
            data: body.data,
            username: "bot".to_owned(),
        };
        let decoded: CMsgClientToGcGetMatchMetaData =
            response.decode::<_, SteamProxyError>().unwrap();
        assert_eq!(decoded, msg);
    }

    #[test]
    fn error_status_classification() {
        let cooldown = SteamProxyError::from_status(
            StatusCode::TOO_MANY_REQUESTS,
            r#"{"message": "busy", "pool_limit_info": {"wait_for_millis": 2300}}"#.to_owned(),
        );
        assert!(matches!(
            cooldown,
            SteamProxyError::Cooldown { ref message, wait_for: Some(w) }
                if message == "busy" && w == Duration::from_millis(2300)
        ));
        assert!(!cooldown.is_retryable());
        assert!(matches!(
            SteamProxyError::from_status(StatusCode::SERVICE_UNAVAILABLE, "down".to_owned()),
            SteamProxyError::NoAliveBots(m) if m == "down"
        ));
        let failed = SteamProxyError::from_status(StatusCode::BAD_GATEWAY, String::new());
        assert!(matches!(
            failed,
            SteamProxyError::Failed(StatusCode::BAD_GATEWAY, _)
        ));
        assert!(failed.is_retryable());
        assert!(matches!(
            SteamProxyError::from_status(StatusCode::UNAUTHORIZED, "no".to_owned()),
            SteamProxyError::Rejected(StatusCode::UNAUTHORIZED, m) if m == "no"
        ));
    }

    #[tokio::test]
    async fn no_proxy_url() {
        let client = SteamProxyClient::new(reqwest::Client::new(), Vec::new(), String::new());
        let result = client
            .call_raw(
                EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData,
                &CMsgClientToGcGetMatchMetaData::default(),
                SteamProxyOptions {
                    in_all_groups: None,
                    in_any_groups: None,
                    cooldown: Duration::ZERO,
                    soft_cooldown: None,
                    request_timeout: Duration::from_secs(1),
                    username: None,
                },
            )
            .await;
        assert!(matches!(result, Err(SteamProxyError::NoProxyUrl)));
    }
}
