use clap::{Parser, Subcommand};
use tracing::error;

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
        #[arg(long, env = "MAX_CONCURRENT_SCRAPING")]
        max_concurrent_scraping: Option<usize>,
    },
    /// Run spectate bot v2
    RunSpectateBot {
        #[arg(long, env = "PROXY_API_TOKEN")]
        proxy_api_token: String,

        #[arg(long, env = "PROXY_URL")]
        proxy_url: String,
    },
}

pub(crate) async fn run_cli() {
    let cli = Cli::parse();

    match cli.command {
        Commands::ScrapeHltvMatches {
            spectate_bot_url: spectate_server_url,
            max_concurrent_scraping,
        } => {
            common::init_metrics().expect("Failed to initialize metrics server");
            if let Err(e) = crate::cmd::scrape_hltv::run(spectate_server_url, max_concurrent_scraping).await {
                error!("Command failed: {:#?}", e);
            }
        }
        Commands::RunSpectateBot {
            proxy_url,
            proxy_api_token,
        } => {
            if let Err(e) = crate::cmd::run_spectate_bot::run_bot(proxy_url, proxy_api_token).await
            {
                error!("Command failed: {:#?}", e);
            }
        }
    }
}
