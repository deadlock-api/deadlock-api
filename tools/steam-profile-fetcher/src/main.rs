#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::correctness)]
#![deny(clippy::suspicious)]
#![deny(clippy::style)]
#![deny(clippy::complexity)]
#![deny(clippy::perf)]
#![deny(clippy::pedantic)]
#![deny(clippy::std_instead_of_core)]
#![allow(clippy::unreadable_literal)]
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]

use core::time::Duration;
use std::env;

use anyhow::Result;
use itertools::Itertools;
use metrics::{counter, gauge};
use models::SteamPlayerSummary;
use tracing::{error, info, instrument};

mod models;
mod steam_api;

static FETCH_INTERVAL: std::sync::LazyLock<Duration> = std::sync::LazyLock::new(|| {
    Duration::from_secs(
        env::var("FETCH_INTERVAL_SECONDS")
            .unwrap_or_else(|_| "120".to_string())
            .parse()
            .unwrap_or(2 * 60),
    )
});

const OUTDATED_INTERVAL: &str = "INTERVAL 2 WEEK";

#[tokio::main]
async fn main() -> Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    info!("Starting Steam Profile Fetcher");

    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;

    let mut interval = tokio::time::interval(*FETCH_INTERVAL);
    loop {
        interval.tick().await;
        if let Ok(()) = fetch_and_update_profiles(&http_client, &ch_client).await {
            info!("Updated Steam profiles");
        } else {
            error!("Error updating Steam profiles");
        }
    }
}

#[instrument(skip_all)]
async fn fetch_and_update_profiles(
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
) -> Result<()> {
    let account_ids = get_account_ids_to_update(ch_client).await?;
    gauge!("steam_profile_fetcher.account_ids_to_update").set(account_ids.len() as f64);

    if account_ids.len() < 100 {
        info!("No full batch, waiting for next interval");
        return Ok(());
    }
    info!("Found {} account IDs to update", account_ids.len());

    let batch = account_ids.iter().take(100).collect_vec();
    let profiles = match steam_api::fetch_steam_profiles(http_client, &batch).await {
        Ok(profiles) => {
            info!("Fetched {} Steam profiles", profiles.len());
            counter!("steam_profile_fetcher.fetched_profiles.success")
                .increment(profiles.len() as u64);
            profiles
        }
        Err(e) => {
            error!("Failed to fetch Steam profiles: {}", e);
            counter!("steam_profile_fetcher.fetched_profiles.failure")
                .increment(batch.len() as u64);
            return Err(e);
        }
    };

    let unavailable_profiles = batch
        .into_iter()
        .filter(|id| !profiles.iter().any(|p| p.account_id == **id))
        .copied()
        .collect_vec();
    match delete_profiles(ch_client, &unavailable_profiles).await {
        Ok(()) => {
            info!(
                "Deleted {} unavailable profiles",
                unavailable_profiles.len()
            );
            counter!("steam_profile_fetcher.deleted_profiles.success")
                .increment(unavailable_profiles.len() as u64);
        }
        Err(e) => {
            error!("Failed to delete unavailable profiles: {}", e);
            counter!("steam_profile_fetcher.deleted_profiles.failure")
                .increment(unavailable_profiles.len() as u64);
        }
    }

    match save_profiles(ch_client, &profiles).await {
        Ok(()) => {
            info!(
                "Saved {} Steam profiles, {} account IDs remaining to update",
                profiles.len(),
                account_ids.len() - profiles.len()
            );
            gauge!("steam_profile_fetcher.account_ids_to_update").decrement(profiles.len() as f64);
            counter!("steam_profile_fetcher.saved_profiles.success")
                .increment(profiles.len() as u64);
        }
        Err(e) => {
            error!("Failed to save Steam profiles: {}", e);
            counter!("steam_profile_fetcher.saved_profiles.failure")
                .increment(profiles.len() as u64);
            return Err(e.into());
        }
    }

    Ok(())
}

async fn get_account_ids_to_update(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<Vec<u32>> {
    let query = format!(
        r"
WITH recent_matches AS (SELECT match_id FROM match_info WHERE start_time > now() - {OUTDATED_INTERVAL}),
    up_to_date_accounts AS (SELECT account_id FROM steam_profiles WHERE last_updated > now() - {OUTDATED_INTERVAL})
SELECT DISTINCT account_id
FROM match_player
WHERE match_id IN recent_matches AND account_id NOT IN up_to_date_accounts
AND account_id > 0

UNION DISTINCT

SELECT account_id
FROM steam_profiles FINAL
WHERE last_updated < now() - {OUTDATED_INTERVAL}
    "
    );
    ch_client.query(&query).fetch_all().await
}

#[instrument(skip_all)]
async fn save_profiles(
    ch_client: &clickhouse::Client,
    profiles: &[SteamPlayerSummary],
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client
        .insert::<SteamPlayerSummary>("steam_profiles")
        .await?;
    for profile in profiles {
        inserter.write(profile).await?;
    }
    inserter.end().await
}

#[instrument(skip_all)]
async fn delete_profiles(
    ch_client: &clickhouse::Client,
    profiles: &[u32],
) -> clickhouse::error::Result<()> {
    ch_client
        .query("DELETE FROM steam_profiles WHERE account_id IN ?")
        .bind(profiles)
        .execute()
        .await
}
