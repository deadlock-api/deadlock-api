use crate::hero_regression::hero_regression;
use crate::regression::regression;
use clap::Parser;
use derive_more::Display;
use std::collections::HashMap;
use std::time::Duration;
use tracing::info;

mod hero_regression;
mod regression;
mod types;
mod utils;

#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Display, Default, clap::ValueEnum)]
pub(crate) enum MMRType {
    #[default]
    #[clap(name = "Player")]
    Player,
    #[clap(name = "Hero")]
    Hero,
}

#[derive(Parser, Debug)]
#[command(version, about)]
pub(crate) struct Args {
    #[arg(short, long, default_value_t = MMRType::Player)]
    mmr_type: MMRType,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let args = Args::parse();

    let ch_client = common::get_ch_client()?;

    match args.mmr_type {
        MMRType::Player => {
            let start_match = utils::get_regression_starting_id(&ch_client).await?;
            let all_player_mmrs = utils::get_all_player_mmrs(&ch_client, start_match).await?;
            info!("Loaded {} mmrs", all_player_mmrs.len());
            let mut all_player_mmrs: HashMap<_, _> = all_player_mmrs
                .into_iter()
                .map(|mmr| ((mmr.account_id, 0), mmr))
                .collect();

            let mut interval = tokio::time::interval(Duration::from_secs(300));
            loop {
                interval.tick().await;
                regression(&ch_client, &mut all_player_mmrs).await?;
            }
        }
        MMRType::Hero => {
            let start_match = utils::get_hero_regression_starting_id(&ch_client).await?;
            let all_player_mmrs = utils::get_all_player_hero_mmrs(&ch_client, start_match).await?;
            info!("Loaded {} mmrs", all_player_mmrs.len());
            let mut all_player_mmrs: HashMap<_, _> = all_player_mmrs
                .into_iter()
                .map(|mmr| ((mmr.account_id, mmr.hero_id), mmr))
                .collect();

            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                hero_regression(&ch_client, &mut all_player_mmrs).await?;
            }
        }
    }
}
