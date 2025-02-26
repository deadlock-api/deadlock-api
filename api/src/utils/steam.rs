use crate::config::Config;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use prost::Message;
use serde::{Deserialize, Serialize};
use serde_json::json;
use valveprotos::deadlock::EgcCitadelClientMessages;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamProxyResponse {
    pub data: String,
    pub username: String,
}

pub async fn call_steam_proxy(
    config: &Config,
    http_client: &reqwest::Client,
    msg_type: EgcCitadelClientMessages,
    msg: impl Message,
    cooldown_time: std::time::Duration,
    groups: &[&str],
) -> reqwest::Result<SteamProxyResponse> {
    let serialized_message = msg.encode_to_vec();
    let encoded_message = BASE64_STANDARD.encode(&serialized_message);
    http_client
        .post(&config.steam_proxy_url)
        .bearer_auth(&config.steam_proxy_api_key)
        .json(&json!({
            "message_kind": msg_type as i32,
            "job_cooldown_millis": cooldown_time.as_millis(),
            "bot_in_all_groups": groups,
            "data": encoded_message,
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await
}
