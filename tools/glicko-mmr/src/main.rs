use clap::Parser;
use glicko_mmr::config::Config;
use glicko_mmr::update_single_rating_period;
use tracing::{error, info};

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
        match update_single_rating_period(&config, &ch_client).await {
            Ok(true) => info!("Updated ratings"),
            Ok(false) => {
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
