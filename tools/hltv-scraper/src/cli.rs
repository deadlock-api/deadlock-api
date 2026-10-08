use anyhow::Context;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
pub(crate) struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub(crate) enum Commands {
    /// Scrape HLTVs using deadlock-api live-matches with spectators > 0
    /// as the source of truth.
    ScrapeHltvMatches {
        #[arg(long, env = "SPECTATE_BOT_URL")]
        spectate_bot_url: String,
    },
    /// Run spectate bot v2
    RunSpectateBot {
        #[arg(long, env = "PROXY_API_TOKEN")]
        proxy_api_token: String,

        #[arg(long, env = "PROXY_URL")]
        proxy_url: String,

        #[arg(long, env = "MAX_SPECTATING_MATCHES")]
        max_spectating_matches: Option<usize>,
    },
}

pub(crate) async fn run_cli() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::ScrapeHltvMatches {
            spectate_bot_url: spectate_server_url,
        } => {
            common::init_metrics().context("Failed to initialize metrics server")?;
            common::run_until_shutdown(crate::cmd::scrape_hltv::run(spectate_server_url)).await
        }
        Commands::RunSpectateBot {
            proxy_url,
            proxy_api_token,
            max_spectating_matches,
        } => {
            crate::cmd::run_spectate_bot::run_bot(
                proxy_url,
                proxy_api_token,
                max_spectating_matches,
            )
            .await
        }
    }
}
