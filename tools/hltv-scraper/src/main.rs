use indicatif::ProgressStyle;
use tracing_indicatif::{
    filter::{hide_indicatif_span_fields, IndicatifFilter},
    IndicatifLayer,
};
use tracing_subscriber::prelude::*;
use tracing_subscriber::{fmt::format::DefaultFields, EnvFilter};

use crate::cli::run_cli;

mod active_matches;
mod cli;
mod cmd;
mod easy_poll;
mod hltv;

fn main() {
    let pb_style = ProgressStyle::with_template(
        "{spinner:.green} {span_name:.green}{span_fields} - [{elapsed_precise}] {bar:40.cyan/blue} {pos:>7}/{len:7} ({percent}%) {per_sec} (ETA {eta}) {msg}",
    )
    .unwrap();
    let indicatif_layer = IndicatifLayer::new()
        .with_span_field_formatter(hide_indicatif_span_fields(DefaultFields::new()))
        .with_progress_style(pb_style);

    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("debug,h2=warn,hyper_util=warn,reqwest=warn,rustls=warn,steam_vent=info")
    });
    let fmt_layer =
        tracing_subscriber::fmt::layer().with_writer(indicatif_layer.get_stderr_writer());

    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(env_filter)
        .with(indicatif_layer.with_filter(IndicatifFilter::new(false)))
        .init();

    tracing::info!("Starting processing!");

    // cli

    run_cli();
}
