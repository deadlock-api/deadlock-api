use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::RateLimitQuota;
use crate::services::rate_limiter::extractor::RateLimitKey;

use crate::context::AppState;
use crate::services::steam::types::{
    GetPlayerSummariesResponse, Patch, Rss, SteamAccountNameError, SteamProxyQuery,
    SteamProxyRawResponse, SteamProxyResponse, SteamProxyResult,
};
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use derive_more::Constructor;
use metrics::counter;
use prost::Message;
use reqwest::header::HeaderValue;
use serde_json::json;
use std::time::Duration;
use tracing::{debug, error};
use uuid::Uuid;
use valveprotos::deadlock::CMsgClientToGcGetMatchMetaDataResponse;

const RSS_ENDPOINT: &str = "https://forums.playdeadlock.com/forums/changelog.10/index.rss";

/// Client for interacting with the Steam API and proxy
#[derive(Constructor, Clone)]
pub(crate) struct SteamClient {
    http_client: reqwest::Client,
    steam_proxy_url: String,
    steam_proxy_api_key: String,
    steam_api_key: String,
}

impl SteamClient {
    pub(crate) async fn call_steam_proxy<M: Message, R: Message + Default>(
        &self,
        query: SteamProxyQuery<M>,
    ) -> SteamProxyResult<SteamProxyResponse<R>> {
        self.call_steam_proxy_raw(query).await?.try_into()
    }

    pub(crate) async fn call_steam_proxy_raw<M: Message>(
        &self,
        query: SteamProxyQuery<M>,
    ) -> SteamProxyResult<SteamProxyRawResponse> {
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
        match self._call_proxy(&query, &body).await {
            Ok(r) => {
                debug!(
                    "Successfully called Steam proxy for {}",
                    query.msg_type.as_str_name()
                );
                counter!("steam.proxy.call", "msg_type" => query.msg_type.as_str_name(), "error" => "false").increment(1);
                Ok(r)
            }
            Err(e) => {
                error!("Failed to call Steam proxy: {e}");
                counter!("steam.proxy.call", "msg_type" => query.msg_type.as_str_name(), "error" => "true").increment(1);
                Err(e.into())
            }
        }
    }

    async fn _call_proxy<M: Message, T: serde::Serialize + ?Sized>(
        &self,
        query: &SteamProxyQuery<M>,
        body: &T,
    ) -> reqwest::Result<SteamProxyRawResponse> {
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
    pub(crate) async fn get_current_client_version(&self) -> APIResult<u32> {
        get_current_client_version(&self.http_client).await
    }

    /// Fetch a Steam account name by Steam ID
    pub(crate) async fn fetch_steam_account_name(
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

    pub(crate) async fn fetch_patch_notes(&self) -> APIResult<Vec<Patch>> {
        fetch_patch_notes(&self.http_client).await
    }

    pub(crate) async fn fetch_metadata_file(
        &self,
        match_id: u64,
        salts: CMsgClientToGcGetMatchMetaDataResponse,
    ) -> reqwest::Result<Vec<u8>> {
        self.http_client
            .get(format!(
                "http://replay{}.valve.net/1422450/{match_id}_{}.meta.bz2",
                salts.replay_group_id.unwrap_or_default(),
                salts.metadata_salt.unwrap_or_default()
            ))
            .send()
            .await
            .and_then(|resp| resp.error_for_status())?
            .bytes()
            .await
            .map(|r| r.to_vec())
    }

    pub(crate) async fn metadata_file_exists(
        &self,
        match_id: u64,
        salts: CMsgClientToGcGetMatchMetaDataResponse,
    ) -> reqwest::Result<()> {
        self.http_client
            .head(format!(
                "http://replay{}.valve.net/1422450/{match_id}_{}.meta.bz2",
                salts.replay_group_id.unwrap_or_default(),
                salts.metadata_salt.unwrap_or_default()
            ))
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .and_then(|resp| resp.error_for_status())
            .map(drop)
    }

    pub(crate) async fn live_demo_exists(&self, match_id: u64) -> reqwest::Result<()> {
        self.http_client
            .head(format!(
                "https://dist1-ord1.steamcontent.com/tv/{match_id}/sync"
            ))
            .send()
            .await
            .and_then(|resp| resp.error_for_status())
            .map(drop)
    }

    pub(crate) async fn send_webhook(
        &self,
        webhook_url: &str,
        payload: Vec<u8>,
        sig: &HeaderValue,
    ) -> reqwest::Result<()> {
        self.http_client
            .post(webhook_url)
            .body(payload)
            .header("X-Hook0-Signature", sig)
            .header("X-Event-Type", "match.metadata.created")
            .header("X-Event-Id", Uuid::new_v4().to_string())
            .header("Content-Type", "application/json")
            .header("User-Agent", "hook0-output-worker/0.3.0")
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .and_then(|m| m.error_for_status())
            .map(drop)
    }
}

#[cached(
    ty = "TimedCache<u8, Vec<Patch>>",
    create = "{ TimedCache::with_lifespan(30 * 60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
pub(crate) async fn fetch_patch_notes(http_client: &reqwest::Client) -> APIResult<Vec<Patch>> {
    let response = http_client.get(RSS_ENDPOINT).send().await.map_err(|e| {
        APIError::status_msg(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to fetch patch notes: {e}"),
        )
    })?;
    let rss = response.text().await.map_err(|e| {
        APIError::status_msg(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to read patch notes: {e}"),
        )
    })?;
    serde_xml_rs::from_str::<Rss>(&rss)
        .map(|rss| rss.channel.patch_notes)
        .map_err(|e| {
            APIError::status_msg(
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to parse patch notes: {e}"),
            )
        })
}

#[cached(
    ty = "TimedCache<u8, u32>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn get_current_client_version(http_client: &reqwest::Client) -> APIResult<u32> {
    let steam_info = http_client
        .get("https://raw.githubusercontent.com/SteamDatabase/GameTracking-Deadlock/refs/heads/master/game/citadel/steam.inf")
        .send()
        .await
        .and_then(|resp| resp.error_for_status())?
        .text().await?;
    for line in steam_info.lines() {
        if line.starts_with("ClientVersion=") {
            return line
                .split('=')
                .nth(1)
                .and_then(|v| v.parse().ok())
                .ok_or(APIError::internal(
                    "Failed to parse client version".to_string(),
                ));
        }
    }
    Err(APIError::internal(
        "Failed to fetch client version".to_string(),
    ))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_patches() {
        let patches = fetch_patch_notes(&reqwest::Client::new())
            .await
            .expect("Failed to fetch patch notes");
        assert!(patches.len() > 7);
    }
}
