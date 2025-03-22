use crate::cli::run_cli;

mod active_matches;
mod cli;
mod cmd;
mod easy_poll;
mod hltv;

#[tokio::main]
async fn main() {
    let _guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    tracing::info!("Starting processing!");
    run_cli().await;
}
