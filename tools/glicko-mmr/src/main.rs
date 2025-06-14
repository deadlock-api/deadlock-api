use crate::config::Config;
use crate::types::{CHMatch, Glicko2HistoryEntry};
use chrono::{DateTime, Utc};
use clap::Parser;
use indicatif::{ParallelProgressIterator, ProgressIterator};
use itertools::Itertools;
use rayon::prelude::*;
use std::collections::HashMap;
use tracing::{debug, info};

mod config;
mod glicko;
mod types;
mod utils;

const UPDATE_INTERVAL: u64 = 30 * 60; // 30 minutes

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();
    common::init_tracing();
    common::init_metrics()?;

    let config = Config::parse();

    let ch_client = common::get_ch_client()?;

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(UPDATE_INTERVAL));
    loop {
        let Ok(start_time) = utils::get_rating_period_starting_day(&ch_client).await else {
            info!("No matches to process, sleeping...");
            interval.tick().await;
            continue;
        };

        info!(
            "Processing Rating Period starting at {}",
            DateTime::<Utc>::from_timestamp(start_time as i64, 0).unwrap()
        );
        let matches_to_process =
            CHMatch::query_rating_period(&ch_client, start_time, start_time + 24 * 60 * 60).await?;
        if matches_to_process.is_empty() {
            info!("No matches to process, sleeping 10s...");
            interval.tick().await;
            continue;
        }
        debug!("Fetched {} matches", matches_to_process.len());
        let player_ratings_before_rating_period =
            Glicko2HistoryEntry::query_latest_before_match_id(
                &ch_client,
                matches_to_process[0].match_id, // This is safe because we checked that matches_to_process is not empty
            )
            .await?
            .into_iter()
            .map(|entry| (entry.account_id, entry))
            .collect::<HashMap<_, _>>();

        let all_accounts = matches_to_process
            .iter()
            .flat_map(|m| m.team0_players.iter().chain(m.team1_players.iter()))
            .unique()
            .collect::<Vec<_>>();
        info!("Processing {} accounts", all_accounts.len());
        let updates = all_accounts
            .into_par_iter()
            .progress()
            .flat_map(|account_id| {
                let matches = matches_to_process
                    .iter()
                    .filter(|m| {
                        m.team0_players.contains(account_id) || m.team1_players.contains(account_id)
                    })
                    .sorted_by_key(|m| m.match_id)
                    .collect::<Vec<_>>();
                glicko::update_player_ratings_all_matches(
                    &config,
                    *account_id,
                    &matches,
                    &player_ratings_before_rating_period,
                )
                .unwrap()
            })
            .collect::<Vec<_>>();
        debug!("Writing {} updates", updates.len());
        let mut inserter = ch_client.insert("glicko_history")?;
        for update in updates.iter().progress() {
            inserter.write(update).await?;
        }
        inserter.end().await?;
    }
}
