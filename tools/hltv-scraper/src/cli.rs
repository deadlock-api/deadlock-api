use std::net::SocketAddrV4;

use clap::{Parser, Subcommand};
use metrics_exporter_prometheus::PrometheusBuilder;
use tracing::error;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
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
    },
}

pub async fn run_cli() {
    let cli = Cli::parse();

    match cli.command {
        Commands::ScrapeHltvMatches {
            spectate_bot_url: spectate_server_url,
        } => {
            let builder = PrometheusBuilder::new()
                .with_http_listener("0.0.0.0:9002".parse::<SocketAddrV4>().unwrap());
            builder
                .install()
                .expect("failed to install recorder/exporter");
            if let Err(e) = crate::cmd::scrape_hltv::run(spectate_server_url).await {
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
