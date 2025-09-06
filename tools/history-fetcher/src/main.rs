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
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]

mod types;

use core::time::Duration;

use anyhow::bail;
use futures::StreamExt;
use metrics::{counter, gauge};
use tracing::{debug, error, info, instrument, warn};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response::EResult;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, EgcCitadelClientMessages,
};

use crate::types::PlayerMatchHistoryEntry;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;

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

        futures::stream::iter(accounts)
            .map(|account| {
                let ch_client = ch_client.clone();
                let http_client = http_client.clone();
                async move {
                    match update_account(&ch_client, &http_client, account).await {
                        Ok(()) => {
                            info!("Fetched account {account}");
                            counter!("history_fetcher.fetch_match_history.success").increment(1);
                        }
                        Err(e) => {
                            counter!("history_fetcher.fetch_match_history.failure").increment(1);
                            warn!("Failed to fetch account {account}: {e:?}");
                        }
                    }
                }
            })
            .buffer_unordered(2)
            .collect::<Vec<_>>()
            .await;
    }
}

#[instrument(skip(http_client, ch_client))]
async fn update_account(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
    account: u32,
) -> anyhow::Result<()> {
    let (username, match_history) =
        tryhard::retry_fn(|| fetch_account_match_history(http_client, account))
            .retries(30)
            .exponential_backoff(Duration::from_secs(1))
            .await?;
    counter!("history_fetcher.fetch_match_history.status", "status" => match_history.result.unwrap_or_default().to_string()).increment(1);
    if match_history
        .result
        .is_none_or(|r| r != EResult::KEResultSuccess as i32)
    {
        bail!(
            "Failed to fetch match history, result: {:?}, skipping",
            match_history.result
        );
    }
    let match_history = match_history.matches;
    if match_history.is_empty() {
        debug!("No new matches {account}");
        return Ok(());
    }
    let match_history = match_history
        .into_iter()
        .filter_map(|r| PlayerMatchHistoryEntry::from_protobuf(account, r, username.clone()));
    Ok(insert_match_history(ch_client, match_history).await?)
}

async fn fetch_accounts(ch_client: &clickhouse::Client) -> clickhouse::error::Result<Vec<u32>> {
    ch_client
        .query(
            r"
WITH t_matches AS (SELECT match_id
                   FROM match_info
                   WHERE start_time BETWEEN now() - INTERVAL 2 HOUR AND now() - INTERVAL 1 HOUR),
     t_player_histories AS (SELECT account_id, match_id
                            FROM player_match_history
                            WHERE start_time BETWEEN now() - INTERVAL 2 HOUR AND now() - INTERVAL 1 HOUR
                              AND match_id NOT in t_matches)
SELECT DISTINCT account_id
FROM active_matches
         ARRAY JOIN players.account_id as account_id
WHERE account_id > 0
  AND match_mode IN ('Unranked', 'Ranked')
  AND game_mode = 'Normal'
  AND start_time BETWEEN now() - INTERVAL 2 HOUR AND now() - INTERVAL 1 HOUR
  AND match_id NOT IN t_matches
  AND (account_id, match_id) NOT IN t_player_histories
ORDER BY match_id DESC
LIMIT 100

UNION
DISTINCT

WITH t_matches AS (SELECT match_id FROM match_info WHERE start_time > now() - INTERVAL 4 HOUR)
SELECT DISTINCT account_id
FROM match_player
WHERE match_id IN t_matches
  AND account_id > 0
ORDER BY match_id DESC
LIMIT 1000
    ",
        )
        .fetch_all()
        .await
}

async fn fetch_account_match_history(
    http_client: &reqwest::Client,
    account: u32,
) -> anyhow::Result<(String, CMsgClientToGcGetMatchHistoryResponse)> {
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: account.into(),
        ..Default::default()
    };
    common::call_steam_proxy(
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
        &msg,
        Some(&["GetMatchHistory"]),
        None,
        Duration::from_secs(24 * 60 * 60 / 50), // 50requests per day
        Duration::from_secs(5),
    )
    .await
}

async fn insert_match_history(
    ch_client: &clickhouse::Client,
    match_history: impl IntoIterator<Item = PlayerMatchHistoryEntry>,
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client.insert("player_match_history")?;
    for entry in match_history {
        inserter.write(&entry).await?;
    }
    inserter.end().await
}
