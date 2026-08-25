#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::correctness)]
#![deny(clippy::suspicious)]
#![deny(clippy::style)]
#![deny(clippy::complexity)]
#![deny(clippy::perf)]
#![deny(clippy::pedantic)]
#![deny(clippy::std_instead_of_core)]
#![expect(clippy::cast_precision_loss)]
#![expect(clippy::cast_sign_loss)]
#![expect(clippy::cast_possible_truncation)]
#![expect(clippy::too_many_lines)]
#![expect(clippy::unreadable_literal)]

use crate::cli::run_cli;

mod active_matches;
mod cli;
mod cmd;
mod easy_poll;
mod hltv;

#[tokio::main]
async fn main() {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    tracing::info!("Starting processing!");
    run_cli().await;
}
