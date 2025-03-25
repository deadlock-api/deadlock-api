mod types;

use crate::types::{PlayerMatchHistory, PlayerMatchHistoryEntry};
use arl::RateLimiter;
use clickhouse::Row;
use itertools::Itertools;
use metrics::{counter, gauge};
use rand::prelude::SliceRandom;
use rand::rng;
use serde::Deserialize;
use std::time::Duration;
use tracing::{debug, error, info, instrument};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response::EResult;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, EgcCitadelClientMessages,
};

#[derive(Debug, Row, Deserialize)]
struct Account {
    id: u32,
    max_match_id: Option<u64>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;

    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;

    let limiter = RateLimiter::new(25, Duration::from_secs(60));

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
        futures::future::join_all(
            accounts
                .iter()
                .sorted_by_key(|a| a.max_match_id.unwrap_or_default())
                .rev()
                .take(10000)
                .map(|account| update_account_limited(&limiter, &ch_client, &http_client, account)),
        )
        .await;
    }
}

#[instrument(skip(http_client, ch_client))]
async fn update_account(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
    account: &Account,
) {
    let match_history = match fetch_account_match_history(http_client, account).await {
        Ok((_, match_history)) => match_history,
        Err(e) => {
            counter!("history_fetcher.fetch_match_history.failure").increment(1);
            error!(
                "Failed to fetch match history for account {}, error: {:?}, skipping",
                account.id, e
            );
            return;
        }
    };
    counter!("history_fetcher.fetch_match_history.status", "status" => match_history.result.unwrap_or_default().to_string()).increment(1);
    if match_history
        .result
        .is_none_or(|r| r != EResult::KEResultSuccess as i32)
    {
        counter!("history_fetcher.fetch_match_history.failure").increment(1);
        error!(
            "Failed to fetch match history for account {}, result: {:?}, skipping",
            account.id, match_history.result
        );
        return;
    }
    let match_history = match_history.matches;
    if match_history.is_empty() {
        debug!("No new matches for account {}", account.id);
        return;
    }
    let match_history: PlayerMatchHistory = match_history
        .into_iter()
        .filter_map(|r| PlayerMatchHistoryEntry::from_protobuf(account.id, r))
        .collect();
    match insert_match_history(ch_client, &match_history).await {
        Ok(_) => {
            counter!("history_fetcher.insert_match_history.success").increment(1);
            info!(
                "Inserted {} new matches for account {}",
                match_history.len(),
                account.id
            )
        }
        Err(e) => {
            counter!("history_fetcher.insert_match_history.failure").increment(1);
            error!(
                "Failed to insert match history for account {}: {:?}",
                account.id, e
            )
        }
    }
}

async fn fetch_accounts(ch_client: &clickhouse::Client) -> clickhouse::error::Result<Vec<Account>> {
    ch_client
        .query(
            r#"
    WITH matches AS (
            SELECT match_id
            FROM match_info
            WHERE
                match_outcome = 'TeamWin'
                AND match_mode IN ('Ranked', 'Unranked')
                AND game_mode = 'Normal'
                AND start_time <= now() - INTERVAL 1 WEEK),
        histories AS (
            SELECT match_id, account_id
            FROM player_match_history
            WHERE match_id IN matches)
    SELECT account_id as id, max(match_id) as max_match_id
    FROM match_player
    WHERE match_id IN matches AND (match_id, account_id) NOT IN histories
    GROUP BY account_id

    UNION DISTINCT

    SELECT account_id as id, NULL as max_match_id
    FROM match_player
    WHERE match_id IN (SELECT match_id FROM match_info WHERE start_time > now() - INTERVAL 1 WEEK)
    "#,
        )
        .fetch_all()
        .await
}

async fn fetch_account_match_history(
    http_client: &reqwest::Client,
    account: &Account,
) -> reqwest::Result<(String, CMsgClientToGcGetMatchHistoryResponse)> {
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: account.id.into(),
        continue_cursor: account.max_match_id.map(|a| a + 1),
        ..Default::default()
    };
    common::call_steam_proxy(
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
        msg,
        Some(&["GetMatchHistory"]),
        None,
        Duration::from_secs(24 * 60 * 60 / 200), // 200 requests per day
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
    account: &Account,
) {
    if account.id == 0 {
        return;
    }
    limiter.wait().await;
    update_account(ch_client, http_client, account).await;
    gauge!("history_fetcher.fetched_accounts").decrement(1);
}
