#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

use crate::cli::run_cli;

mod active_matches;
mod cli;
mod cmd;
mod easy_poll;
mod hltv;

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("Failed to initialize metrics server")]
    InitMetrics(#[source] telemetry::MetricsError),
    #[error(transparent)]
    ScrapeHltv(#[from] cmd::scrape_hltv::ScrapeHltvError),
    #[error(transparent)]
    SpectateBot(#[from] cmd::run_spectate_bot::SpectateBotError),
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let _otel_guard = telemetry::init_tracing(env!("CARGO_PKG_NAME"));
    tracing::info!("Starting processing!");
    let result = run_cli().await;
    if let Err(e) = &result {
        tracing::error!("Command failed: {}", service_utils::ErrorChain(e));
    }
    result
}
