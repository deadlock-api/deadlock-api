use core::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct Hero {
    pub id: u32,
    pub in_development: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SeasonInterval {
    pub interval: u32,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RankedSeason {
    pub intervals: Vec<SeasonInterval>,
}

/// The ranked interval running right now, as accepted by the `rank_interval` field
/// of `CMsgClientToGCGetMatchHistory`. `None` between seasons.
pub async fn fetch_current_rank_interval(
    http_client: &reqwest::Client,
) -> reqwest::Result<Option<u32>> {
    let seasons: Vec<RankedSeason> = http_client
        .get("https://api.deadlock-api.com/v1/assets/ranked-seasons")
        .send()
        .await?
        .json()
        .await?;
    let now = i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_secs(),
    )
    .unwrap_or(i64::MAX);
    Ok(seasons
        .iter()
        .flat_map(|s| &s.intervals)
        .find(|i| (i.start_timestamp..=i.end_timestamp).contains(&now))
        .map(|i| i.interval))
}

pub async fn fetch_hero_ids(http_client: &reqwest::Client) -> reqwest::Result<Vec<u32>> {
    let heroes: Vec<Hero> = http_client
        .get("https://api.deadlock-api.com/v1/assets/heroes?only_active=true")
        .send()
        .await?
        .json()
        .await?;
    Ok(heroes
        .iter()
        .filter(|h| h.in_development.is_none_or(|d| !d))
        .map(|h| h.id)
        .collect())
}
