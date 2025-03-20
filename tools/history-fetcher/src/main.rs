mod types;

use crate::types::{PlayerMatchHistory, PlayerMatchHistoryEntry};
use arl::RateLimiter;
use clickhouse::Compression;
use metrics::{counter, gauge};
use metrics_exporter_prometheus::PrometheusBuilder;
use once_cell::sync::Lazy;
use rand::prelude::SliceRandom;
use rand::rng;
use std::net::SocketAddrV4;
use std::time::Duration;
use tracing::{debug, error, info, instrument};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response::EResult;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, EgcCitadelClientMessages,
};

static CLICKHOUSE_URL: Lazy<String> =
    Lazy::new(|| std::env::var("CLICKHOUSE_URL").unwrap_or("http://127.0.0.1:8123".to_string()));
static CLICKHOUSE_USER: Lazy<String> = Lazy::new(|| std::env::var("CLICKHOUSE_USER").unwrap());
static CLICKHOUSE_PASSWORD: Lazy<String> =
    Lazy::new(|| std::env::var("CLICKHOUSE_PASSWORD").unwrap());
static CLICKHOUSE_DB: Lazy<String> = Lazy::new(|| std::env::var("CLICKHOUSE_DB").unwrap());

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new(
        "debug,h2=warn,hyper_util=warn,reqwest=warn,rustls=warn,sqlx=warn",
    ));
    let fmt_layer = tracing_subscriber::fmt::layer();

    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(env_filter)
        .init();

    let builder =
        PrometheusBuilder::new().with_http_listener("0.0.0.0:9002".parse::<SocketAddrV4>()?);
    builder
        .install()
        .expect("failed to install recorder/exporter");

    debug!("Creating HTTP client");
    let http_client = reqwest::Client::new();

    debug!("Creating Clickhouse client");
    let ch_client = clickhouse::Client::default()
        .with_url(CLICKHOUSE_URL.clone())
        .with_user(CLICKHOUSE_USER.clone())
        .with_password(CLICKHOUSE_PASSWORD.clone())
        .with_database(CLICKHOUSE_DB.clone())
        .with_compression(Compression::None);

    let limiter = RateLimiter::new(20, Duration::from_secs(60));

    loop {
        let mut accounts = match fetch_accounts(&ch_client).await {
            Ok(accounts) => {
                gauge!("history_fetcher.fetched_accounts").set(accounts.len() as f64);
                counter!("history_fetcher.fetch_accounts.success").increment(1);
                info!("Fetched {} accounts", accounts.len());
                accounts
            }
            Err(e) => {
                gauge!("history_fetcher.fetched_accounts").set(0);
                counter!("history_fetcher.fetch_accounts.failure").increment(1);
                error!("Failed to fetch accounts: {:?}", e);
                tokio::time::sleep(Duration::from_secs(10)).await;
                continue;
            }
        };
        accounts.shuffle(&mut rng());
        futures::future::join_all(accounts.iter().map(|account_id| {
            update_account_limited(&limiter, &ch_client, &http_client, *account_id)
        }))
        .await;
    }
}

#[instrument(skip(http_client, ch_client))]
async fn update_account(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
    account_id: u32,
) {
    let match_history = match fetch_account_match_history(http_client, account_id).await {
        Ok(match_history) => match_history,
        Err(e) => {
            counter!("history_fetcher.fetch_match_history.failure", "account_id" => account_id.to_string()).increment(1);
            error!(
                "Failed to fetch match history for account {}, error: {:?}, skipping",
                account_id, e
            );
            return;
        }
    };
    counter!("history_fetcher.fetch_match_history.status", "status" => match_history.result.unwrap_or_default().to_string()).increment(1);
    if match_history
        .result
        .is_none_or(|r| r != EResult::KEResultSuccess as i32)
    {
        error!(
            "Failed to fetch match history for account {}, result: {:?}, skipping",
            account_id, match_history.result
        );
        return;
    }
    let match_history = match_history.matches;
    if match_history.is_empty() {
        debug!("No new matches for account {}", account_id);
        return;
    }
    let match_history: PlayerMatchHistory = match_history
        .into_iter()
        .filter_map(|r| PlayerMatchHistoryEntry::from_protobuf(account_id, r))
        .collect();
    match insert_match_history(ch_client, &match_history).await {
        Ok(_) => {
            counter!("history_fetcher.insert_match_history.success", "account_id" => account_id.to_string()).increment(1);
            info!(
                "Inserted {} new matches for account {}",
                match_history.len(),
                account_id
            )
        }
        Err(e) => {
            counter!("history_fetcher.insert_match_history.failure", "account_id" => account_id.to_string()).increment(1);
            error!(
                "Failed to insert match history for account {}: {:?}",
                account_id, e
            )
        }
    }
}

async fn fetch_accounts(ch_client: &clickhouse::Client) -> clickhouse::error::Result<Vec<u32>> {
    ch_client
        .query(
            r#"
    SELECT DISTINCT account_id
    FROM player
    WHERE account_id NOT IN (SELECT account_id FROM player_match_history)

    UNION DISTINCT

    SELECT DISTINCT account_id
    FROM match_player
    INNER JOIN match_info mi USING (match_id)
    WHERE mi.start_time > now() - INTERVAL 2 WEEK
    "#,
        )
        .fetch_all()
        .await
}

async fn fetch_account_match_history(
    http_client: &reqwest::Client,
    account_id: u32,
) -> reqwest::Result<CMsgClientToGcGetMatchHistoryResponse> {
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: account_id.into(),
        ..Default::default()
    };
    common::utils::call_steam_proxy(
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
        msg,
        Some(&["GetMatchHistory"]),
        None,
        Duration::from_secs(10 * 60),
        Duration::from_secs(5),
    )
    .await
}

async fn insert_match_history(
    ch_client: &clickhouse::Client,
    match_history: &PlayerMatchHistory,
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client.insert("player_match_history")?;
    for entry in match_history {
        inserter.write(entry).await?;
    }
    inserter.end().await
}

async fn update_account_limited(
    limiter: &RateLimiter,
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
    account_id: u32,
) {
    if account_id == 0 {
        return;
    }
    limiter.wait().await;
    update_account(ch_client, http_client, account_id).await
}
