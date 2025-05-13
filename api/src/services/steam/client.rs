use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::RateLimitQuota;
use crate::services::rate_limiter::extractor::RateLimitKey;

use crate::services::steam::types::{
    GetPlayerSummariesResponse, SteamProxyQuery, SteamProxyResponse,
};
use crate::state::AppState;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use derive_more::Constructor;
use prost::Message;
use serde_json::json;
use std::time::Duration;
use tracing::debug;

/// Error type for Steam account name fetching
#[derive(Debug, thiserror::Error)]
pub enum SteamAccountNameError {
    #[error("Failed to fetch steam name: {0}")]
    FetchError(String),
    #[error("Failed to parse steam name")]
    ParseError,
    #[error("Rate limit exceeded: {0}")]
    RateLimitExceeded(String),
}

/// Client for interacting with the Steam API and proxy
#[derive(Constructor, Clone)]
pub struct SteamClient {
    http_client: reqwest::Client,
    steam_proxy_url: String,
    steam_proxy_api_key: String,
    steam_api_key: String,
}

impl SteamClient {
    /// Call the Steam proxy with the given query
    pub async fn call_steam_proxy<M: Message>(
        &self,
        query: SteamProxyQuery<M>,
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
        self.http_client
            .post(&self.steam_proxy_url)
            .bearer_auth(&self.steam_proxy_api_key)
            .timeout(query.request_timeout)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
    }

    /// Get the current client version from the Steam Database
    pub async fn get_current_client_version(&self) -> APIResult<u32> {
        get_current_client_version(&self.http_client).await
    }

    /// Fetch a Steam account name by Steam ID
    pub async fn fetch_steam_account_name(
        &self,
        rate_limit_key: &RateLimitKey,
        state: &AppState,
        steam_id: u32,
    ) -> Result<String, SteamAccountNameError> {
        fetch_steam_account_name_cached(
            rate_limit_key,
            state,
            &self.http_client,
            steam_id,
            &self.steam_api_key,
        )
        .await
    }
}

#[cached(
    ty = "TimedCache<u8, u32>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn get_current_client_version_internal(http_client: &reqwest::Client) -> APIResult<u32> {
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

#[cached(
    ty = "TimedCache<u8, u32>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
pub async fn get_current_client_version(http_client: &reqwest::Client) -> APIResult<u32> {
    get_current_client_version_internal(http_client).await
}

#[cached(
    ty = "TimedCache<u32, String>",
    create = "{ TimedCache::with_lifespan(24 * 60 * 60) }",
    result = true,
    convert = "{ steam_id }",
    sync_writes = "by_key",
    key = "u32"
)]
async fn fetch_steam_account_name_cached(
    rate_limit_key: &RateLimitKey,
    state: &AppState,
    http_client: &reqwest::Client,
    steam_id: u32,
    steam_api_key: &str,
) -> Result<String, SteamAccountNameError> {
    state
        .rate_limit_client
        .apply_limits(
            rate_limit_key,
            "steam_account_name",
            &[
                RateLimitQuota::ip_limit(50, Duration::from_secs(60 * 60)),
                RateLimitQuota::global_limit(500, Duration::from_secs(60 * 60)),
            ],
        )
        .await
        .map_err(|e| SteamAccountNameError::RateLimitExceeded(e.to_string()))?;
    let steamid64 = steam_id as u64 + 76561197960265728;
    let response = http_client
        .get(format!(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={steam_api_key}&steamids={steamid64}",
        ))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| SteamAccountNameError::FetchError(e.to_string()))?;

    let player_summaries = response
        .json::<GetPlayerSummariesResponse>()
        .await
        .map_err(|e| SteamAccountNameError::FetchError(e.to_string()))?;

    player_summaries
        .response
        .players
        .first()
        .and_then(|player| player.personaname.clone())
        .ok_or(SteamAccountNameError::ParseError)
}
