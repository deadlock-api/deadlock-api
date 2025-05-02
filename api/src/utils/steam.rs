use crate::config::Config;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use prost::Message;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;
use valveprotos::deadlock::EgcCitadelClientMessages;

#[derive(Debug, Clone, Deserialize)]
pub struct SteamProxyResponse {
    pub data: String,
    pub username: String,
}

#[allow(clippy::too_many_arguments)]
pub async fn call_steam_proxy(
    config: &Config,
    http_client: &reqwest::Client,
    msg_type: EgcCitadelClientMessages,
    msg: impl Message,
    in_all_groups: Option<&[&str]>,
    in_any_groups: Option<&[&str]>,
    cooldown_time: Duration,
    request_timeout: Duration,
) -> reqwest::Result<SteamProxyResponse> {
    let serialized_message = msg.encode_to_vec();
    let encoded_message = BASE64_STANDARD.encode(&serialized_message);
    http_client
        .post(&config.steam_proxy_url)
        .bearer_auth(&config.steam_proxy_api_key)
        .timeout(request_timeout)
        .json(&json!({
            "message_kind": msg_type as i32,
            "job_cooldown_millis": cooldown_time.as_millis(),
            "rate_limit_cooldown_millis": 2 * cooldown_time.as_millis(),
            "bot_in_all_groups": in_all_groups,
            "bot_in_any_groups": in_any_groups,
            "data": encoded_message,
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await
}
