use crate::regression::Regression;
use crate::types::{MMR, Match};
use clap::Parser;
use itertools::Itertools;
use std::collections::HashMap;
use tracing::info;

mod regression;
mod types;
mod utils;

#[derive(Copy, Clone, Debug, PartialEq, Eq, clap::ValueEnum)]
enum MMRType {
    Hero,
    Player,
}

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[arg(short, long, required = true)]
    mmr_type: MMRType,
}

async fn run_regression(
    ch_client: &clickhouse::Client,
    mmr_type: MMRType,
    all_player_mmrs: &mut HashMap<u32, MMR>,
) -> anyhow::Result<()> {
    let start_match = utils::get_regression_starting_id(ch_client, mmr_type).await?;
    let mut matches = utils::get_matches_starting_from(ch_client, start_match).await?;
    let mut updates = Vec::new();
    let mut processed = 0;
    let mut sum_squared_errors = 0.0;
    let algorithm = Regression;
    while let Some(match_) = matches.next().await? {
        let match_: Match = match_.into();
        let (updated_mmrs, squared_errors) =
            algorithm.run_regression(&match_, all_player_mmrs, mmr_type);
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
    let args = Args::parse();
    let start_match = utils::get_regression_starting_id(&ch_client, args.mmr_type).await?;
    let all_player_mmrs: Vec<MMR> = match args.mmr_type {
        MMRType::Hero => utils::get_all_player_hero_mmrs(&ch_client, start_match)
            .await?
            .into_iter()
            .map_into()
            .collect(),
        MMRType::Player => utils::get_all_player_mmrs(&ch_client, start_match)
            .await?
            .into_iter()
            .map_into()
            .collect(),
    };
    info!("Loaded {} mmrs", all_player_mmrs.len());
    let mut all_player_mmrs: HashMap<u32, MMR> = all_player_mmrs
        .into_iter()
        .map(|mmr| match mmr {
            MMR::Player(ref m) => (m.account_id, mmr),
            MMR::Hero(ref m) => (m.account_id, mmr),
        })
        .collect();

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
    loop {
        interval.tick().await;
        run_regression(&ch_client, args.mmr_type, &mut all_player_mmrs).await?;
    }
}
