use tracing_subscriber::EnvFilter;
use tracing_subscriber::prelude::*;

use crate::cli::run_cli;

mod active_matches;
mod cli;
mod cmd;
mod easy_poll;
mod hltv;

#[tokio::main]
async fn main() {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("debug,h2=warn,hyper_util=warn,reqwest=warn,rustls=warn,steam_vent=info")
    });
    let fmt_layer = tracing_subscriber::fmt::layer();

    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(env_filter)
        .init();

    tracing::info!("Starting processing!");

    // cli
    run_cli().await;
}
