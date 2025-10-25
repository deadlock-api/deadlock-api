use core::time::Duration;

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use itertools::Itertools;
use metrics::counter;
use prost::Message;
use rand::prelude::IndexedRandom;
use reqwest::Response;
use serde_json::json;
use tracing::{debug, error};
use valveprotos::deadlock::CMsgClientToGcGetMatchMetaDataResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ClickhouseSalts;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::types::{
    GetPlayerSummariesResponse, Patch, Rss, SteamAccountNameError, SteamAccountVerifyError,
    SteamProxyError, SteamProxyQuery, SteamProxyRawResponse, SteamProxyResponse, SteamProxyResult,
};

const RSS_ENDPOINT: &str = "https://forums.playdeadlock.com/forums/changelog.10/index.rss";

/// Client for interacting with the Steam API and proxy
#[derive(Clone)]
pub(crate) struct SteamClient {
    http_client: reqwest::Client,
    steam_proxy_urls: Vec<String>,
    steam_proxy_api_key: String,
    steam_api_key: String,
}

impl SteamClient {
    pub(crate) fn new(
        http_client: reqwest::Client,
        steam_proxy_urls: Vec<String>,
        steam_proxy_api_key: String,
        steam_api_key: String,
    ) -> Self {
        Self {
            http_client,
            steam_proxy_urls,
            steam_proxy_api_key,
            steam_api_key,
        }
    }

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
            "soft_cooldown_millis": query.soft_cooldown_millis.unwrap_or_else(|| query.cooldown_time / 2).as_millis(),
            "bot_in_all_groups": query.in_all_groups,
            "bot_in_any_groups": query.in_any_groups,
            "data": encoded_message,
            "bot_username": query.username,
        });
        match self.call_proxy(&query, &body).await {
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
                Err(e)
            }
        }
    }

    async fn call_proxy<M: Message, T: serde::Serialize + ?Sized>(
        &self,
        query: &SteamProxyQuery<M>,
        body: &T,
    ) -> SteamProxyResult<SteamProxyRawResponse> {
        let url = if self.steam_proxy_urls.len() == 1 {
            #[allow(clippy::indexing_slicing, reason = "We checked the length")]
            &self.steam_proxy_urls[0]
        } else {
            self.steam_proxy_urls
                .choose(&mut rand::rng())
                .ok_or(SteamProxyError::NoBaseUrl)?
        };

        self.http_client
            .post(url)
            .bearer_auth(&self.steam_proxy_api_key)
            .timeout(query.request_timeout)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
            .map_err(Into::into)
    }

    /// Get the current client version from the Steam Database
    pub(crate) async fn get_current_client_version(&self) -> APIResult<u32> {
        get_current_client_version(&self.http_client).await
    }

    /// Is the given Steam ID in the protected users list
    pub(crate) async fn is_user_protected(
        &self,
        pg_client: &sqlx::Pool<sqlx::Postgres>,
        steam_id: u32,
    ) -> sqlx::Result<bool> {
        get_protected_users_cached(pg_client)
            .await
            .map(|p| p.contains(&steam_id))
    }

    pub(crate) async fn verify_user_owns_steam_id(
        &self,
        open_id_params: &std::collections::HashMap<String, String>,
        steam_id: u64,
    ) -> Result<(), SteamAccountVerifyError> {
        // make a request to the OpenID provider to verify the parameters
        let mut params = open_id_params.clone();
        params.insert("openid.mode".to_owned(), "check_authentication".to_owned());
        let response = self
            .http_client
            .post("https://steamcommunity.com/openid/login")
            .form(&params)
            .send()
            .await?
            .text()
            .await?;
        // check the response for "is_valid:true"
        if !response.contains("is_valid:true") {
            return Err(SteamAccountVerifyError::VerificationFailed);
        }
        // check that the claimed Steam ID matches the provided Steam ID
        let claimed_steam_id = open_id_params
            .get("openid.claimed_id")
            .and_then(|url| url.rsplit('/').next())
            .and_then(|id_str| id_str.parse::<u64>().ok())
            .ok_or_else(|| SteamAccountVerifyError::VerificationFailed)?;
        if claimed_steam_id != steam_id {
            return Err(SteamAccountVerifyError::VerificationFailed);
        }
        Ok(())
    }

    /// Get protected users list
    pub(crate) async fn get_protected_users(
        &self,
        pg_client: &sqlx::Pool<sqlx::Postgres>,
    ) -> sqlx::Result<Vec<u32>> {
        get_protected_users_cached(pg_client).await
    }

    /// Fetch a Steam account name by Steam ID
    pub(crate) async fn fetch_steam_account_name(
        &self,
        rate_limit_key: &RateLimitKey,
        state: &AppState,
        steam_id: u32,
    ) -> Result<String, SteamAccountNameError> {
        if self
            .is_user_protected(&state.pg_client, steam_id)
            .await
            .unwrap_or(false)
        {
            return Err(SteamAccountNameError::FetchError(
                "User is protected".to_owned(),
            ));
        }

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
            .and_then(Response::error_for_status)?
            .bytes()
            .await
            .map(|r| r.to_vec())
    }

    pub(crate) async fn metadata_file_exists(
        &self,
        salts: &ClickhouseSalts,
    ) -> reqwest::Result<()> {
        self.http_client
            .head(format!(
                "http://replay{}.valve.net/1422450/{}_{}.meta.bz2",
                salts.cluster_id.unwrap_or_default(),
                salts.match_id,
                salts.metadata_salt.unwrap_or_default()
            ))
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .and_then(Response::error_for_status)
            .map(drop)
    }

    pub(crate) async fn replay_file_exists(&self, salts: &ClickhouseSalts) -> reqwest::Result<()> {
        self.http_client
            .head(format!(
                "http://replay{}.valve.net/1422450/{}_{}.dem.bz2",
                salts.cluster_id.unwrap_or_default(),
                salts.match_id,
                salts.replay_salt.unwrap_or_default()
            ))
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .and_then(Response::error_for_status)
            .map(drop)
    }
}

#[cached(
    ty = "TimedCache<u8, Vec<Patch>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(30 * 60)) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn fetch_patch_notes(http_client: &reqwest::Client) -> APIResult<Vec<Patch>> {
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
    quick_xml::de::from_str::<Rss>(&rss)
        .map(|rss| rss.channel.patch_notes)
        .map_err(|e| {
            APIError::status_msg(
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to parse patch notes: {e}"),
            )
        })
}

#[cached(
    ty = "TimedCache<u8, Vec<u32>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(24 * 60 * 60)) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn get_protected_users_cached(
    ph_client: &sqlx::Pool<sqlx::Postgres>,
) -> sqlx::Result<Vec<u32>> {
    let protected_users = sqlx::query!("SELECT steam_id FROM protected_user_accounts")
        .fetch_all(ph_client)
        .await?
        .into_iter()
        .map(|r| r.steam_id)
        .map(i32::cast_unsigned)
        .collect_vec();
    Ok(protected_users)
}

#[cached(
    ty = "TimedCache<u8, u32>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60 * 60)) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn get_current_client_version(http_client: &reqwest::Client) -> APIResult<u32> {
    let steam_info = http_client
        .get("https://raw.githubusercontent.com/SteamDatabase/GameTracking-Deadlock/refs/heads/master/game/citadel/steam.inf")
        .send()
        .await
        .and_then(Response::error_for_status)?
        .text().await?;
    for line in steam_info.lines() {
        if line.starts_with("ClientVersion=") {
            return line
                .split('=')
                .nth(1)
                .and_then(|v| v.parse().ok())
                .ok_or(APIError::internal(
                    "Failed to parse client version".to_owned(),
                ));
        }
    }
    Err(APIError::internal(
        "Failed to fetch client version".to_owned(),
    ))
}

#[cached(
    ty = "TimedCache<u32, String>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(24 * 60 * 60)) }",
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
                Quota::ip_limit(50, Duration::from_secs(60 * 60)),
                Quota::global_limit(500, Duration::from_secs(60 * 60)),
            ],
        )
        .await
        .map_err(|e| SteamAccountNameError::RateLimitExceeded(e.to_string()))?;
    let steamid64 = u64::from(steam_id) + 76561197960265728;
    let response = http_client
        .get(format!(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={steam_api_key}&steamids={steamid64}",
        ))
        .send()
        .await
        .and_then(Response::error_for_status)
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
