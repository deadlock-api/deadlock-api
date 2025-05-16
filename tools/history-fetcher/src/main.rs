mod types;

use crate::types::{PlayerMatchHistory, PlayerMatchHistoryEntry};
use arl::RateLimiter;
use clickhouse::Row;
use metrics::{counter, gauge};
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
    common::init_tracing();
    common::init_metrics()?;

    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;

    let limiter = RateLimiter::new(10, Duration::from_secs(60));

    loop {
        let accounts = match fetch_accounts(&ch_client).await {
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
        futures::future::join_all(
            accounts
                .iter()
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
            "Failed to fetch match history, result: {:?}, skipping",
            match_history.result
        );
        return;
    }
    let match_history = match_history.matches;
    if match_history.is_empty() {
        debug!("No new matches {}", account.id);
        return;
    }
    let match_history: PlayerMatchHistory = match_history
        .into_iter()
        .filter_map(|r| PlayerMatchHistoryEntry::from_protobuf(account.id, r))
        .collect();
    match insert_match_history(ch_client, &match_history).await {
        Ok(_) => {
            counter!("history_fetcher.insert_match_history.success").increment(1);
            info!("Inserted new matches {}", match_history.len(),)
        }
        Err(e) => {
            counter!("history_fetcher.insert_match_history.failure").increment(1);
            error!("Failed to insert match history: {:?}", e)
        }
    }
}

async fn fetch_accounts(ch_client: &clickhouse::Client) -> clickhouse::error::Result<Vec<Account>> {
    ch_client
        .query(
            r#"
WITH players AS (SELECT DISTINCT account_id
                 FROM match_player
                 ORDER BY match_id DESC
                 LIMIT 10000)
SELECT account_id as id, NULL AS max_match_id
FROM players
ORDER BY rand()
LIMIT 1000

UNION ALL

SELECT account_id AS id, toNullable(max(match_id)) AS max_match_id
FROM match_player
WHERE account_id > 0
  AND match_id > 31247321
  AND (match_id, account_id) NOT IN (SELECT match_id, account_id FROM player_match_history WHERE match_id > 31247321)
GROUP BY account_id
HAVING COUNT(DISTINCT match_id) > 50
ORDER BY COUNT(DISTINCT match_id) DESC
LIMIT 100
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
