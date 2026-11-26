use core::time::Duration;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use cached::macros::cached;
use metrics::counter;
use prost::Message;
use reqwest::Response;
use steam_proxy::{SteamProxyClient, SteamProxyOptions, SteamProxyReply, SteamProxyResponse};
use tracing::debug;
use url::Url;
use valveprotos::deadlock::{CMsgClientToGcGetMatchMetaDataResponse, EgcCitadelClientMessages};

use crate::context::AppState;
use crate::error::APIResult;
use crate::middleware::cors::is_own_origin;
use crate::services::protected_accounts;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Quota, RateLimit, Scope};
use crate::services::steam::patch_feed::PatchFeeds;
use crate::services::steam::types::{
    FeedItem, GetPlayerSummariesResponse, Patch, SteamAccountNameError, SteamAccountVerifyError,
    SteamProxyResult,
};
use crate::utils::valve_replay::replay_file_url;

const ACCOUNT_NAME_RATE_LIMIT: RateLimit = RateLimit::new(
    "steam_account_name",
    &[
        Quota::new(Scope::Ip, 50, Duration::from_hours(1)),
        Quota::new(Scope::Global, 500, Duration::from_hours(1)),
    ],
);

const STEAM_OPENID_ENDPOINT: &str = "https://steamcommunity.com/openid/login";

/// Client for interacting with the Steam API and proxy
#[derive(Clone)]
pub(crate) struct SteamClient {
    http_client: reqwest::Client,
    patch_feeds: Arc<PatchFeeds>,
    steam_proxy: SteamProxyClient,
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
            patch_feeds: Arc::new(PatchFeeds::new()),
            steam_proxy: SteamProxyClient::new(
                http_client.clone(),
                steam_proxy_urls,
                steam_proxy_api_key,
            ),
            http_client,
            steam_api_key,
        }
    }

    /// Runs a Game Coordinator job through the Steam proxy and decodes its response.
    pub(crate) async fn call_steam_proxy<R: Message + Default>(
        &self,
        msg_type: EgcCitadelClientMessages,
        msg: &impl Message,
        options: SteamProxyOptions<'_>,
    ) -> SteamProxyResult<SteamProxyReply<R>> {
        self.call_steam_proxy_raw(msg_type, msg, options)
            .await?
            .try_into()
    }

    /// Runs a Game Coordinator job through the Steam proxy.
    pub(crate) async fn call_steam_proxy_raw(
        &self,
        msg_type: EgcCitadelClientMessages,
        msg: &impl Message,
        options: SteamProxyOptions<'_>,
    ) -> SteamProxyResult<SteamProxyResponse> {
        let result = self.steam_proxy.call_raw(msg_type, msg, options).await;
        let msg_type = msg_type.as_str_name();
        if result.is_ok() {
            debug!("Successfully called Steam proxy for {msg_type}");
        }
        let error = if result.is_ok() { "false" } else { "true" };
        counter!("steam.proxy.call", "msg_type" => msg_type, "error" => error).increment(1);
        result
    }

    /// Get the current client version from the Steam Database
    pub(crate) async fn get_current_client_version(&self) -> APIResult<u32> {
        Ok(steam_proxy::get_current_client_version(&self.http_client).await?)
    }

    pub(crate) const fn http_client(&self) -> &reqwest::Client {
        &self.http_client
    }

    pub(crate) fn steam_api_key(&self) -> &str {
        &self.steam_api_key
    }

    /// Verifies a Steam `OpenID` assertion issued to deadlock-api.com proves ownership of
    /// `steam_id`.
    pub(crate) async fn verify_user_owns_steam_id(
        &self,
        open_id_params: &HashMap<String, String>,
        steam_id: u64,
    ) -> Result<(), SteamAccountVerifyError> {
        // Steam only checks the signature, so the claims must be checked here. Without the
        // return_to check, any site offering "Sign in with Steam" could replay its users'
        // assertions against us.
        if !is_assertion_for(open_id_params, steam_id) {
            return Err(SteamAccountVerifyError::VerificationFailed);
        }
        // make a request to the OpenID provider to verify the parameters
        let params: Vec<(&str, &str)> = open_id_params
            .iter()
            .filter(|(key, _)| *key != "openid.mode")
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .chain([("openid.mode", "check_authentication")])
            .collect();
        let response = self
            .http_client
            .post(STEAM_OPENID_ENDPOINT)
            .form(&params)
            .send()
            .await?
            .text()
            .await?;
        // check the response for "is_valid:true"
        if !response.lines().any(|line| line.trim() == "is_valid:true") {
            return Err(SteamAccountVerifyError::VerificationFailed);
        }
        Ok(())
    }

    /// Fetch a Steam account name by Steam ID
    pub(crate) async fn fetch_steam_account_name(
        &self,
        rate_limit_key: &RateLimitKey,
        state: &AppState,
        steam_id: u32,
    ) -> Result<String, SteamAccountNameError> {
        if protected_accounts::is_protected(&state.pg_client, steam_id)
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

    pub(crate) async fn fetch_patch_notes(&self) -> APIResult<Arc<Vec<Patch>>> {
        self.patch_feeds.patch_notes().await
    }

    pub(crate) async fn fetch_combined_patch_feed(&self) -> APIResult<Arc<Vec<FeedItem>>> {
        self.patch_feeds.combined().await
    }

    pub(crate) async fn fetch_metadata_file(
        &self,
        match_id: u64,
        salts: CMsgClientToGcGetMatchMetaDataResponse,
    ) -> reqwest::Result<Vec<u8>> {
        self.http_client
            .get(replay_file_url(
                salts.replay_group_id.unwrap_or_default(),
                match_id,
                salts.metadata_salt.unwrap_or_default(),
                "meta",
            ))
            .send()
            .await
            .and_then(Response::error_for_status)?
            .bytes()
            .await
            .map(Vec::from)
    }
}

#[cached(
    max_size = 100_000,
    ttl_secs = 86400,
    convert = "{ steam_id }",
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
        .check(rate_limit_key, ACCOUNT_NAME_RATE_LIMIT)
        .await
        .map_err(|e| SteamAccountNameError::RateLimitExceeded(e.to_string()))?;
    let steamid64 = steam_id::SteamId::from_account_id(steam_id).steam64();
    // Errors drop the URL: it carries the API key and they get logged.
    let player_summaries: GetPlayerSummariesResponse = async {
        http_client
            .get(format!(
                "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={steam_api_key}&steamids={steamid64}",
            ))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
    }
    .await
    .map_err(|e| SteamAccountNameError::FetchError(e.without_url().to_string()))?;

    player_summaries
        .response
        .players
        .into_iter()
        .next()
        .and_then(|player| player.personaname)
        .ok_or(SteamAccountNameError::ParseError)
}

/// Does the `OpenID` assertion claim `steam_id`, come from Steam, and was it issued to one of our
/// own sites. Only fields covered by the signature count, as Steam's `check_authentication`
/// ignores everything else.
fn is_assertion_for(params: &HashMap<String, String>, steam_id: u64) -> bool {
    let get = |key: &str| params.get(key).map(String::as_str);
    let Some(signed) = get("openid.signed") else {
        return false;
    };
    let signed: HashSet<&str> = signed.split(',').collect();
    if !["op_endpoint", "claimed_id", "identity", "return_to"]
        .iter()
        .all(|field| signed.contains(field))
    {
        return false;
    }
    if get("openid.op_endpoint") != Some(STEAM_OPENID_ENDPOINT) {
        return false;
    }
    let expected_id = format!("https://steamcommunity.com/openid/id/{steam_id}");
    if get("openid.claimed_id") != Some(&expected_id)
        || get("openid.identity") != Some(&expected_id)
    {
        return false;
    }
    get("openid.return_to")
        .and_then(|return_to| Url::parse(return_to).ok())
        .is_some_and(|url| is_own_origin(&url.origin().ascii_serialization()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const STEAM_ID: u64 = 76_561_198_000_000_000;

    fn assertion(return_to: &str) -> HashMap<String, String> {
        let id = format!("https://steamcommunity.com/openid/id/{STEAM_ID}");
        [
            ("openid.ns", "http://specs.openid.net/auth/2.0"),
            ("openid.mode", "id_res"),
            ("openid.op_endpoint", STEAM_OPENID_ENDPOINT),
            ("openid.claimed_id", &id),
            ("openid.identity", &id),
            ("openid.return_to", return_to),
            ("openid.response_nonce", "2026-10-14T00:00:00Zabc"),
            ("openid.assoc_handle", "1234567890"),
            (
                "openid.signed",
                "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
            ),
            ("openid.sig", "c2lnbmF0dXJl"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_owned(), v.to_owned()))
        .collect()
    }

    #[test]
    fn test_accepts_own_return_to() {
        for return_to in [
            "https://deadlock-api.com/data-privacy?action=tracking",
            "https://www.deadlock-api.com/data-privacy?action=deletion",
        ] {
            assert!(
                is_assertion_for(&assertion(return_to), STEAM_ID),
                "{return_to}"
            );
        }
    }

    #[test]
    fn test_rejects_foreign_return_to() {
        for return_to in [
            "https://evil.com/login",
            "https://deadlock-api.com.evil.com/data-privacy",
            "https://evil.com/?r=https://deadlock-api.com",
            "https://deadlock-api.com@evil.com/",
            "http://deadlock-api.com/data-privacy",
            "https://deadlock-api.com:8443/data-privacy",
            "not a url",
        ] {
            assert!(
                !is_assertion_for(&assertion(return_to), STEAM_ID),
                "{return_to}"
            );
        }
    }

    #[test]
    fn test_rejects_wrong_or_unsigned_claims() {
        let ok = "https://deadlock-api.com/data-privacy";
        assert!(!is_assertion_for(&assertion(ok), STEAM_ID + 1));

        let mut params = assertion(ok);
        params.insert(
            "openid.claimed_id".to_owned(),
            format!("https://evil.com/openid/id/{STEAM_ID}"),
        );
        assert!(!is_assertion_for(&params, STEAM_ID));

        let mut params = assertion(ok);
        params.insert(
            "openid.signed".to_owned(),
            "signed,op_endpoint,claimed_id,identity,response_nonce,assoc_handle".to_owned(),
        );
        assert!(!is_assertion_for(&params, STEAM_ID));

        let mut params = assertion(ok);
        params.insert(
            "openid.op_endpoint".to_owned(),
            "https://evil.com/openid".to_owned(),
        );
        assert!(!is_assertion_for(&params, STEAM_ID));

        let mut params = assertion(ok);
        params.remove("openid.return_to");
        assert!(!is_assertion_for(&params, STEAM_ID));
    }
}
