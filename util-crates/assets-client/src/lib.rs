//! Client for the public asset endpoints of api.deadlock-api.com (heroes, ranked seasons).

#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

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
    pub calibration_matches: u32,
    pub intervals: Vec<SeasonInterval>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct CurrentSeason {
    /// Feeds the `rank_interval` field of `CMsgClientToGCGetMatchHistory`.
    pub interval: u32,
    /// How many placement matches the season runs.
    pub calibration_matches: u32,
}

/// The ranked season running right now. `None` between seasons.
pub async fn fetch_current_season(
    http_client: &reqwest::Client,
) -> reqwest::Result<Option<CurrentSeason>> {
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
    Ok(seasons.iter().find_map(|s| {
        s.intervals
            .iter()
            .find(|i| (i.start_timestamp..=i.end_timestamp).contains(&now))
            .map(|i| CurrentSeason {
                interval: i.interval,
                calibration_matches: s.calibration_matches,
            })
    }))
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

/// Calls `on_refresh` with the current ranked season right away and then hourly, from a
/// background task. Seasons turn over on the order of months, so that is ample. A failed
/// fetch is logged and skipped.
pub fn spawn_season_refresh_task<F>(on_refresh: F) -> reqwest::Result<()>
where
    F: Fn(Option<CurrentSeason>) + Send + 'static,
{
    let http_client = service_utils::http_client()?;
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_hours(1));
        loop {
            interval.tick().await;
            match fetch_current_season(&http_client).await {
                Ok(season) => on_refresh(season),
                Err(e) => tracing::warn!("Failed to refresh ranked season: {e:?}"),
            }
        }
    });
    Ok(())
}
