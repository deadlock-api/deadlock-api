use clap::Parser;
use glicko_mmr::config::Config;
use glicko_mmr::types::{CHMatch, Glicko2HistoryEntry};
use glicko_mmr::{update_single_rating_period, utils};
use std::collections::HashMap;
use tracing::{debug, error, info};

const UPDATE_INTERVAL: u64 = 30 * 60; // 30 minutes

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();
    common::init_tracing();
    common::init_metrics()?;

    let ch_client = common::get_ch_client()?;
    let config = Config::parse();

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(UPDATE_INTERVAL));
    loop {
        let Ok(start_time) = utils::get_rating_period_starting_week(&ch_client).await else {
            info!("No matches to process, sleeping...");
            interval.tick().await;
            continue;
        };
        let matches_to_process =
            CHMatch::query_rating_period(&ch_client, start_time, start_time + 7 * 24 * 60 * 60)
                .await?;
        if matches_to_process.is_empty() {
            info!("No matches to process, sleeping...");
            interval.tick().await;
            continue;
        }
        let player_ratings_before_rating_period =
            Glicko2HistoryEntry::query_latest_before_match_id(
                &ch_client,
                matches_to_process[0].match_id, // This is safe because we checked that matches_to_process is not empty
            )
            .await?
            .into_iter()
            .map(|entry| (entry.account_id, entry))
            .collect::<HashMap<_, _>>();
        match update_single_rating_period(
            &config,
            &matches_to_process,
            &player_ratings_before_rating_period,
            true,
        )
        .await
        {
            Ok(updates) if !updates.is_empty() => {
                debug!("Writing {} updates", updates.len());
                let mut inserter = ch_client.insert("glicko")?;
                for update in updates {
                    inserter.write(&update).await?;
                }
                inserter.end().await?;
                info!("Updated ratings");
            }
            Ok(_) => {
                info!("No matches to process, sleeping...");
                interval.tick().await;
            }
            Err(e) => {
                error!("Failed to update ratings: {}", e);
                interval.tick().await;
            }
        }
    }
}
