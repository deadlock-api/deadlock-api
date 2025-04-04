use anyhow::Result;
use itertools::Itertools;
use once_cell::sync::Lazy;
use rand::rng;
use rand::seq::IndexedRandom;
use std::env;
use tracing::{info, instrument};

use crate::models::{AccountId, SteamPlayerSummary, SteamPlayerSummaryResponse};

static STEAM_API_KEYS: Lazy<Vec<String>> = Lazy::new(|| {
    env::var("STEAM_API_KEYS")
        .expect("STEAM_API_KEYS must be set")
        .split(',')
        .map(|s| s.to_string())
        .collect()
});

#[instrument(skip(http_client), fields(account_ids = account_ids.len()))]
pub async fn fetch_steam_profiles(
    http_client: &reqwest::Client,
    account_ids: &[AccountId],
) -> Result<Vec<SteamPlayerSummary>> {
    if account_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Convert account IDs to Steam ID3 format
    let steam_id64s: Vec<String> = account_ids
        .iter()
        .map(|id| common::account_id_to_steam_id64(id.account_id))
        .map(|i| i.to_string())
        .collect();

    if steam_id64s.is_empty() {
        return Ok(Vec::new());
    }

    // Build the API URL
    let api_key = STEAM_API_KEYS.choose(&mut rng()).unwrap();
    let steam_ids = steam_id64s.join(",");
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={}&steamids={}",
        api_key, steam_ids
    );

    // Make the API call
    let player_summaries: SteamPlayerSummaryResponse = http_client
        .get(&url)
        .send()
        .await
        .and_then(|r| r.error_for_status())?
        .json()
        .await?;
    let player_summaries = player_summaries.response.players;
    info!("Fetched {} Steam profiles", player_summaries.len());

    Ok(player_summaries.into_iter().map_into().collect_vec())
}
