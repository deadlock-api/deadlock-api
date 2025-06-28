#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::pedantic)]
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_wrap)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::too_many_lines)]
#![allow(clippy::unreadable_literal)]

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
