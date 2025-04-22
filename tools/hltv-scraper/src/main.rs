use crate::cli::run_cli;

mod active_matches;
mod cli;
mod cmd;
mod easy_poll;
mod hltv;

#[tokio::main]
async fn main() {
    common::init_tracing();
    tracing::info!("Starting processing!");
    run_cli().await;
}
