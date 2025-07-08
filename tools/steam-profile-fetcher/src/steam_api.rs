use std::env;

use anyhow::Result;
use itertools::Itertools;
use rand::rng;
use rand::seq::IndexedRandom;
use tracing::instrument;

use crate::models::{SteamPlayerSummary, SteamPlayerSummaryResponse};

static STEAM_API_KEYS: std::sync::LazyLock<Vec<String>> = std::sync::LazyLock::new(|| {
    env::var("STEAM_API_KEYS")
        .expect("STEAM_API_KEYS must be set")
        .split(',')
        .map(std::string::ToString::to_string)
        .collect()
});

#[instrument(skip(http_client), fields(account_ids = account_ids.len()))]
pub(crate) async fn fetch_steam_profiles(
    http_client: &reqwest::Client,
    account_ids: &[&u32],
) -> Result<Vec<SteamPlayerSummary>> {
    if account_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Convert account IDs to Steam ID3 format
    let steam_id64s: Vec<String> = account_ids
        .iter()
        .map(|id| common::account_id_to_steam_id64(**id))
        .map(|i| i.to_string())
        .collect();

    if steam_id64s.is_empty() {
        return Ok(Vec::new());
    }

    // Build the API URL
    let api_key = STEAM_API_KEYS.choose(&mut rng()).unwrap();
    let steam_ids = steam_id64s.join(",");
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={api_key}&steamids={steam_ids}"
    );

    // Make the API call
    let player_summaries: SteamPlayerSummaryResponse = http_client
        .get(&url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)?
        .json()
        .await?;
    let player_summaries = player_summaries.response.players;
    Ok(player_summaries.into_iter().map_into().collect_vec())
}
