use std::env;

use anyhow::Result;
use itertools::Itertools;
use rand::rng;
use rand::seq::IndexedRandom;
use tracing::instrument;

use crate::models::{
    SteamFriend, SteamFriendListResponse, SteamPlayerSummary, SteamPlayerSummaryResponse,
};

static STEAM_API_KEYS: std::sync::LazyLock<Vec<String>> = std::sync::LazyLock::new(|| {
    env::var("STEAM_API_KEYS")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .map(std::string::ToString::to_string)
        .collect()
});

fn pick_api_key() -> Result<&'static String> {
    STEAM_API_KEYS
        .choose(&mut rng())
        .ok_or_else(|| anyhow::anyhow!("no Steam API keys configured (set STEAM_API_KEYS)"))
}

#[instrument(skip(http_client), fields(account_ids = account_ids.len()))]
pub(crate) async fn fetch_steam_profiles(
    http_client: &reqwest::Client,
    account_ids: &[u32],
) -> Result<Vec<SteamPlayerSummary>> {
    if account_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Convert account IDs to Steam ID64 format
    let steam_ids = account_ids
        .iter()
        .map(|&id| common::account_id_to_steam_id64(id))
        .join(",");

    // Build the API URL
    let api_key = pick_api_key()?;
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={api_key}&steamids={steam_ids}"
    );

    // Make the API call. Errors drop the URL: it carries the API key and they get logged.
    let player_summaries: SteamPlayerSummaryResponse = async {
        http_client
            .get(&url)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
    }
    .await
    .map_err(reqwest::Error::without_url)?;
    Ok(player_summaries.response.players)
}

/// Returns an empty list for private profiles (Steam responds 401/403).
#[instrument(skip(http_client))]
pub(crate) async fn fetch_steam_friends(
    http_client: &reqwest::Client,
    account_id: u32,
) -> Result<Vec<SteamFriend>> {
    let api_key = pick_api_key()?;
    let steam_id64 = common::account_id_to_steam_id64(account_id);
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key={api_key}&steamid={steam_id64}&relationship=friend"
    );

    // Errors drop the URL: it carries the API key and they get logged.
    async {
        let response = http_client.get(&url).send().await?;
        if matches!(
            response.status(),
            reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN
        ) {
            return Ok(Vec::new());
        }
        let friends: SteamFriendListResponse = response.error_for_status()?.json().await?;
        Ok(friends.friendslist.friends)
    }
    .await
    .map_err(|e: reqwest::Error| e.without_url().into())
}
