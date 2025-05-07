use crate::config::Config;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use prost::Message;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;
use tracing::debug;
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
pub struct SteamProxyResponse {
    pub data: String,
    pub username: String,
}

pub async fn call_steam_proxy(
    config: &Config,
    http_client: &reqwest::Client,
    query: SteamProxyQuery<impl Message>,
) -> reqwest::Result<SteamProxyResponse> {
    let serialized_message = query.msg.encode_to_vec();
    let encoded_message = BASE64_STANDARD.encode(&serialized_message);
    let body = json!({
        "message_kind": query.msg_type as i32,
        "job_cooldown_millis": query.cooldown_time.as_millis(),
        "rate_limit_cooldown_millis": 2 * query.cooldown_time.as_millis(),
        "bot_in_all_groups": query.in_all_groups,
        "bot_in_any_groups": query.in_any_groups,
        "data": encoded_message,
        "bot_username": query.username,
    });
    debug!("Calling Steam Proxy with body: {:?}", body);
    http_client
        .post(&config.steam_proxy_url)
        .bearer_auth(&config.steam_proxy_api_key)
        .timeout(query.request_timeout)
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await
}
