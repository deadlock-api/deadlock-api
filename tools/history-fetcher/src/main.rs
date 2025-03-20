mod types;

use crate::types::{PlayerMatchHistory, PlayerMatchHistoryEntry};
use arl::RateLimiter;
use clickhouse::Compression;
use log::{debug, error, info};
use once_cell::sync::Lazy;
use rand::prelude::SliceRandom;
use rand::rng;
use std::time::Duration;
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

async fn update_account(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
    account_id: u32,
) {
    let Ok(match_history) = fetch_account_match_history(http_client, account_id).await else {
        error!(
            "Failed to fetch match history for account {}, skipping",
            account_id
        );
        return;
    };
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
        Ok(_) => info!(
            "Inserted {} new matches for account {}",
            match_history.len(),
            account_id
        ),
        Err(e) => error!(
            "Failed to insert match history for account {}: {:?}",
            account_id, e
        ),
    }
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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();

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
        let Ok(mut accounts) = fetch_accounts(&ch_client).await else {
            error!("Failed to fetch accounts, retrying in 10s");
            tokio::time::sleep(Duration::from_secs(10)).await;
            continue;
        };
        accounts.shuffle(&mut rng());
        futures::future::join_all(accounts.iter().map(|account_id| {
            update_account_limited(&limiter, &ch_client, &http_client, *account_id)
        }))
        .await;
    }
}
