use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use once_cell::sync::Lazy;
use prost::Message;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;
use valveprotos::deadlock::EgcCitadelClientMessages;

static STEAM_PROXY_URL: Lazy<String> = Lazy::new(|| std::env::var("STEAM_PROXY_URL").unwrap());
static STEAM_PROXY_API_KEY: Lazy<String> =
    Lazy::new(|| std::env::var("STEAM_PROXY_API_KEY").unwrap());

#[derive(Debug, Deserialize, Serialize)]
pub struct Hero {
    pub id: u32,
}

pub async fn fetch_hero_ids(http_client: &reqwest::Client) -> reqwest::Result<Vec<u32>> {
    let heroes: Vec<Hero> = http_client
        .get("https://assets.deadlock-api.com/v2/heroes?only_active=true")
        .send()
        .await?
        .json()
        .await?;
    Ok(heroes.iter().map(|h| h.id).collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamProxyResponse {
    pub data: String,
    pub username: String,
}

#[allow(clippy::too_many_arguments)]
pub async fn call_steam_proxy<T: Message + Default>(
    http_client: &reqwest::Client,
    msg_type: EgcCitadelClientMessages,
    msg: impl Message,
    in_all_groups: Option<&[&str]>,
    in_any_groups: Option<&[&str]>,
    cooldown_time: Duration,
    request_timeout: Duration,
) -> reqwest::Result<T> {
    let serialized_message = msg.encode_to_vec();
    let encoded_message = BASE64_STANDARD.encode(&serialized_message);
    http_client
        .post(&*STEAM_PROXY_URL)
        .bearer_auth(&*STEAM_PROXY_API_KEY)
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
        .map(|r: SteamProxyResponse| BASE64_STANDARD.decode(&r.data).unwrap())
        .map(|r| T::decode(r.as_ref()).unwrap())
}
