use core::time::Duration;
use std::sync::LazyLock;

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use metrics::counter;
use prost::Message;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::instrument;
use valveprotos::deadlock::EgcCitadelClientMessages;

static STEAM_PROXY_URL: LazyLock<String> =
    LazyLock::new(|| std::env::var("STEAM_PROXY_URL").unwrap());
static STEAM_PROXY_API_KEY: LazyLock<String> =
    LazyLock::new(|| std::env::var("STEAM_PROXY_API_KEY").unwrap());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamProxyResponse {
    pub data: String,
    pub username: String,
}

#[allow(clippy::too_many_arguments)]
#[instrument(skip(http_client, msg))]
pub async fn call_steam_proxy<T: Message + Default>(
    http_client: &reqwest::Client,
    msg_type: EgcCitadelClientMessages,
    msg: &impl Message,
    in_all_groups: Option<&[&str]>,
    in_any_groups: Option<&[&str]>,
    cooldown_time: Duration,
    request_timeout: Duration,
) -> anyhow::Result<(String, T)> {
    let serialized_message = msg.encode_to_vec();
    let encoded_message = BASE64_STANDARD.encode(&serialized_message);
    let result: reqwest::Result<SteamProxyResponse> = http_client
        .post(&*STEAM_PROXY_URL)
        .bearer_auth(&*STEAM_PROXY_API_KEY)
        .timeout(request_timeout)
        .json(&json!({
            "message_kind": msg_type as i32,
            "job_cooldown_millis": cooldown_time.as_millis(),
            "rate_limit_cooldown_millis": 2 * cooldown_time.as_millis(),
            "soft_cooldown_millis": cooldown_time.as_millis() / 2,
            "bot_in_all_groups": in_all_groups,
            "bot_in_any_groups": in_any_groups,
            "data": encoded_message,
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await;
    let result = match result {
        Ok(result) => {
            counter!("steam_proxy.call.success", "msg_type" => msg_type.as_str_name().to_string())
                .increment(1);
            result
        }
        Err(e) => {
            counter!("steam_proxy.call.failure", "msg_type" => msg_type.as_str_name().to_string())
                .increment(1);
            return Err(e.into());
        }
    };
    let username = result.username;
    let data = BASE64_STANDARD.decode(&result.data)?;
    let decoded = T::decode(data.as_ref())?;
    Ok((username, decoded))
}
