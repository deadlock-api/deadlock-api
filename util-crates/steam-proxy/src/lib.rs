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
use std::sync::LazyLock;

use base64::Engine as _;
use base64::prelude::BASE64_STANDARD;
use metrics::counter;
use prost::Message;
use serde::{Deserialize, Serialize};
use tracing::{instrument, warn};
use valveprotos::deadlock::EgcCitadelClientMessages;

static STEAM_PROXY_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("STEAM_PROXY_URL").unwrap_or_else(|_| {
        warn!("STEAM_PROXY_URL not set");
        String::new()
    })
});
static STEAM_PROXY_API_KEY: LazyLock<String> = LazyLock::new(|| {
    std::env::var("STEAM_PROXY_API_KEY").unwrap_or_else(|_| {
        warn!("STEAM_PROXY_API_KEY not set");
        String::new()
    })
});

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

#[derive(Debug, thiserror::Error)]
pub enum SteamProxyError {
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Base64(#[from] base64::DecodeError),
    #[error(transparent)]
    Decode(#[from] prost::DecodeError),
}

/// How sv-proxy should route and pace one [`call_steam_proxy`] call.
#[derive(Debug, Clone, Copy)]
pub struct SteamProxyOptions<'a> {
    /// Only use bots that are in all of these groups.
    pub in_all_groups: Option<&'a [&'a str]>,
    /// Only use bots that are in any of these groups.
    pub in_any_groups: Option<&'a [&'a str]>,
    /// How long the bot rests after the job; a rate limit rests it four times as long.
    pub cooldown: Duration,
    /// How far into its cooldown a bot still counts as ready. `None` means 5 minutes.
    pub soft_cooldown: Option<Duration>,
    /// Total time allowed for the proxy request.
    pub request_timeout: Duration,
    /// Run the job on this bot.
    pub username: Option<&'a str>,
}

#[instrument(skip(http_client, msg))]
pub async fn call_steam_proxy<T: Message + Default>(
    http_client: &reqwest::Client,
    msg_type: EgcCitadelClientMessages,
    msg: &impl Message,
    options: SteamProxyOptions<'_>,
) -> Result<(String, T), SteamProxyError> {
    let SteamProxyOptions {
        in_all_groups,
        in_any_groups,
        cooldown,
        soft_cooldown,
        request_timeout,
        username,
    } = options;
    let result: reqwest::Result<SteamProxyResponse> = http_client
        .post(&*STEAM_PROXY_URL)
        .bearer_auth(&*STEAM_PROXY_API_KEY)
        .timeout(request_timeout)
        .json(&SteamProxyRequest {
            message_kind: msg_type as i32,
            job_cooldown_millis: cooldown.as_millis(),
            rate_limit_cooldown_millis: cooldown.as_millis().saturating_mul(4),
            soft_cooldown_millis: soft_cooldown.map_or(5 * 60 * 1000, |d| d.as_millis()),
            bot_in_all_groups: in_all_groups,
            bot_in_any_groups: in_any_groups,
            bot_username: username,
            data: SteamProxyRequest::<&str>::encode_message(msg),
        })
        .send()
        .await?
        .error_for_status()?
        .json()
        .await;
    let result = match result {
        Ok(result) => {
            counter!("steam_proxy.call.success", "msg_type" => msg_type.as_str_name()).increment(1);
            result
        }
        Err(e) => {
            counter!("steam_proxy.call.failure", "msg_type" => msg_type.as_str_name()).increment(1);
            return Err(e.into());
        }
    };
    let decoded = result.decode::<T, SteamProxyError>()?;
    Ok((result.username, decoded))
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
}
