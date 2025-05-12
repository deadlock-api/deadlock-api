use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::services::steam::types::{SteamProxyQuery, SteamProxyResponse};
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use prost::Message;
use serde_json::json;
use tracing::debug;

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

#[cached(
    ty = "TimedCache<u8, u32>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
pub async fn get_current_client_version(http_client: &reqwest::Client) -> APIResult<u32> {
    let steam_info = http_client
        .get("https://raw.githubusercontent.com/SteamDatabase/GameTracking-Deadlock/refs/heads/master/game/citadel/steam.inf")
        .send()
        .await
        .and_then(|resp| resp.error_for_status())
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch steam info: {e}"),
        })?
        .text().await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch steam info: {e}"),
        })?;
    for line in steam_info.lines() {
        if line.starts_with("ClientVersion=") {
            return line.split('=').nth(1).and_then(|v| v.parse().ok()).ok_or(
                APIError::InternalError {
                    message: "Failed to parse client version".to_string(),
                },
            );
        }
    }
    Err(APIError::InternalError {
        message: "Failed to fetch client version".to_string(),
    })
}
