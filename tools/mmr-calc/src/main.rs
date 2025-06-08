use crate::regression::Regression;
use crate::types::{Match, PlayerMMR};
use std::collections::HashMap;
use std::time::Duration;
use tracing::info;

mod regression;
mod types;
mod utils;

async fn run_regression(
    ch_client: &clickhouse::Client,
    all_player_mmrs: &mut HashMap<u32, PlayerMMR>,
) -> anyhow::Result<()> {
    let start_match = utils::get_regression_starting_id(ch_client).await?;
    let mut matches = utils::get_matches_starting_from(ch_client, start_match).await?;
    let mut updates = Vec::new();
    let mut processed = 0;
    let mut sum_squared_errors = 0.0;
    let algorithm = Regression;
    while let Some(match_) = matches.next().await? {
        let match_: Match = match_.into();
        let (updated_mmrs, squared_errors) = algorithm.run_regression(&match_, all_player_mmrs);
        updates.extend(updated_mmrs);
        sum_squared_errors += squared_errors;

        processed += 1;
        if processed % 1000 == 0 {
            let rmse = (sum_squared_errors / processed as f64).sqrt();
            info!("Processed {processed} matches, RMSE: {rmse}");
            utils::insert_mmrs(ch_client, &updates).await?;
            updates.clear();
        }
    }
    utils::insert_mmrs(ch_client, &updates).await?;
    info!("Done!");

    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let ch_client = common::get_ch_client()?;
    let start_match = utils::get_regression_starting_id(&ch_client).await?;
    let all_player_mmrs = utils::get_all_player_mmrs(&ch_client, start_match).await?;
    info!("Loaded {} mmrs", all_player_mmrs.len());
    let mut all_player_mmrs: HashMap<u32, PlayerMMR> = all_player_mmrs
        .into_iter()
        .map(|mmr| (mmr.account_id, mmr))
        .collect();

    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        run_regression(&ch_client, &mut all_player_mmrs).await?;
    }
}
