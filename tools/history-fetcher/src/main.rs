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
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use futures::StreamExt;
use metrics::{counter, gauge};
use sqlx::{Pool, Postgres};
use tokio::sync::RwLock;
use tokio::time::Instant;
use tracing::{debug, error, info, instrument, warn};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response::EResult;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, EgcCitadelClientMessages,
};

use crate::types::PlayerMatchHistoryEntry;

static HISTORY_COOLDOWN_MILLIS: LazyLock<u64> = LazyLock::new(|| {
    std::env::var("HISTORY_COOLDOWN_MILLIS").map_or(24 * 60 * 60 * 1000 / 100, |x| {
        x.parse().expect("HISTORY_COOLDOWN_MILLIS must be a number")
    })
});

/// Interval in seconds to refresh the prioritized accounts list from the database.
/// Default: 300 seconds (5 minutes).
static PRIORITIZATION_REFRESH_SECS: LazyLock<u64> = LazyLock::new(|| {
    std::env::var("PRIORITIZATION_REFRESH_SECS").map_or(300, |x| {
        x.parse()
            .expect("PRIORITIZATION_REFRESH_SECS must be a number")
    })
});

/// Time window in seconds within which prioritized accounts should be fetched.
/// Accounts not fetched within this window are considered due for fetching.
/// Default: 1800 seconds (30 minutes).
static PRIORITIZATION_WINDOW_SECS: LazyLock<u64> = LazyLock::new(|| {
    std::env::var("PRIORITIZATION_WINDOW_SECS").map_or(1800, |x| {
        x.parse()
            .expect("PRIORITIZATION_WINDOW_SECS must be a number")
    })
});

/// Maximum number of retry attempts for prioritized account fetches.
/// Uses exponential backoff: 1s, 2s, 4s, 8s, 16s, etc.
/// Default: 10 retries.
static PRIORITIZATION_MAX_RETRIES: LazyLock<u32> = LazyLock::new(|| {
    std::env::var("PRIORITIZATION_MAX_RETRIES").map_or(10, |x| {
        x.parse()
            .expect("PRIORITIZATION_MAX_RETRIES must be a number")
    })
});

/// Tracks prioritized Steam accounts, their bot username, and last fetch timestamps.
/// Key: `steam_id3` (as i64), Value: (`bot_id`, `Option<Instant>` where None = never fetched).
type PrioritizedAccountsMap = Arc<RwLock<HashMap<i64, (String, Option<Instant>)>>>;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;

    // Initialize PostgreSQL connection pool for prioritization queries
    let pg_pool = match common::get_pg_client().await {
        Ok(pool) => {
            info!("PostgreSQL connection pool initialized successfully");
            pool
        }
        Err(e) => {
            error!("Failed to initialize PostgreSQL connection pool: {e:?}");
            return Err(e);
        }
    };

    // Initialize prioritized accounts tracking from database
    let prioritized_accounts = initialize_prioritized_accounts(&pg_pool).await;

    // Spawn background task to periodically refresh prioritized accounts
    spawn_prioritization_refresh_task(pg_pool.clone(), prioritized_accounts.clone());

    let mut interval = tokio::time::interval(Duration::from_secs(20));

    loop {
        interval.tick().await;

        let due = get_due_prioritized_accounts(&prioritized_accounts).await;
        if due.is_empty() {
            continue;
        }

        info!(
            count = due.len(),
            "Processing prioritized accounts due for fetching"
        );

        futures::stream::iter(due)
            .map(|(account, bot_id)| {
                let ch_client = ch_client.clone();
                let http_client = http_client.clone();
                let prioritized_accounts = prioritized_accounts.clone();
                async move {
                    update_prioritized_account(
                        &ch_client,
                        &http_client,
                        account,
                        &bot_id,
                        &prioritized_accounts,
                    )
                    .await;
                }
            })
            .buffer_unordered(2)
            .collect::<Vec<_>>()
            .await;
    }
}

/// Updates a prioritized account's match history with retry logic.
/// Uses exponential backoff for retries. On success, updates `last_fetched_at`.
/// If all retries fail, sets `last_fetched_at` to 30 minutes ago to re-queue for next cycle.
#[instrument(skip(http_client, ch_client, prioritized_accounts))]
async fn update_prioritized_account(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
    account: u32,
    bot_id: &str,
    prioritized_accounts: &PrioritizedAccountsMap,
) {
    info!(
        account = account,
        bot_id = bot_id,
        "Fetching prioritized account match history"
    );

    let max_retries = *PRIORITIZATION_MAX_RETRIES;
    let attempt = core::sync::atomic::AtomicU32::new(0);

    let result = common::retry_with_backoff_configurable(max_retries, || {
        let current = attempt.fetch_add(1, core::sync::atomic::Ordering::Relaxed);
        if current > 0 {
            counter!("history_fetcher.prioritized_fetch.retry").increment(1);
        }
        async {
            if update_account(ch_client, http_client, account, Some(bot_id)).await {
                Ok(())
            } else {
                Err(format!("Failed to fetch prioritized account {account}"))
            }
        }
    })
    .await;

    let mut map = prioritized_accounts.write().await;
    let steam_id3 = i64::from(account);

    if result.is_ok() {
        counter!("history_fetcher.prioritized_fetch.success").increment(1);
        if let Some(entry) = map.get_mut(&steam_id3) {
            entry.1 = Some(Instant::now());
        }
    } else {
        counter!("history_fetcher.prioritized_fetch.failure").increment(1);
        let window = Duration::from_secs(*PRIORITIZATION_WINDOW_SECS);
        if let Some(entry) = map.get_mut(&steam_id3) {
            entry.1 = Some(Instant::now() - window);
            warn!(
                account = account,
                "All retries exhausted for prioritized account, re-queuing for next cycle"
            );
        }
    }
}

#[instrument(skip(http_client, ch_client))]
async fn update_account(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
    account: u32,
    bot_username: Option<&str>,
) -> bool {
    let match_history = match fetch_account_match_history(http_client, account, bot_username).await
    {
        Ok((_, r)) => r,
        Err(e) => {
            counter!("history_fetcher.fetch_match_history.failure").increment(1);
            warn!("Failed to fetch match history for account {account}, error: {e:?}, skipping",);
            return false;
        }
    };
    counter!("history_fetcher.fetch_match_history.status", "status" => match_history.result.unwrap_or_default().to_string()).increment(1);
    if match_history
        .result
        .is_none_or(|r| r != EResult::KEResultSuccess as i32)
    {
        counter!("history_fetcher.fetch_match_history.failure").increment(1);
        warn!(
            "Failed to fetch match history, result: {:?}, skipping",
            match_history.result
        );
        return false;
    }
    let match_history = match_history.matches;
    if match_history.is_empty() {
        debug!("No new matches {account}");
        return true;
    }
    let match_history = match_history
        .into_iter()
        .filter_map(|r| PlayerMatchHistoryEntry::from_protobuf(account, r));
    match insert_match_history(ch_client, match_history).await {
        Ok(()) => {
            counter!("history_fetcher.insert_match_history.success").increment(1);
            info!("Inserted new matches");
            true
        }
        Err(e) => {
            counter!("history_fetcher.insert_match_history.failure").increment(1);
            error!("Failed to insert match history: {e:?}");
            false
        }
    }
}

async fn fetch_account_match_history(
    http_client: &reqwest::Client,
    account: u32,
    bot_username: Option<&str>,
) -> anyhow::Result<(String, CMsgClientToGcGetMatchHistoryResponse)> {
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: account.into(),
        ..Default::default()
    };
    let job_cooldown = Duration::from_millis(*HISTORY_COOLDOWN_MILLIS);
    common::call_steam_proxy(
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
        &msg,
        Some(&["GetMatchHistory"]),
        None,
        job_cooldown,
        Some(job_cooldown),
        Duration::from_secs(5),
        bot_username,
    )
    .await
}

async fn insert_match_history(
    ch_client: &clickhouse::Client,
    match_history: impl IntoIterator<Item = PlayerMatchHistoryEntry>,
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client
        .insert::<PlayerMatchHistoryEntry>("player_match_history")
        .await?;
    for entry in match_history {
        inserter.write(&entry).await?;
    }
    inserter.end().await
}

/// Initializes the prioritized accounts map by fetching all prioritized accounts
/// that are friends with a bot from the database.
/// All accounts start with `last_fetched_at = None` to indicate they haven't been fetched yet.
async fn initialize_prioritized_accounts(pg_pool: &Pool<Postgres>) -> PrioritizedAccountsMap {
    let accounts = match common::get_all_prioritized_accounts_with_bots(pg_pool).await {
        Ok(accounts) => {
            info!(
                count = accounts.len(),
                "Initialized prioritized accounts from database"
            );
            accounts
        }
        Err(e) => {
            error!(error = %e, "Failed to fetch prioritized accounts on startup, starting with empty set");
            Vec::new()
        }
    };

    let map: HashMap<i64, (String, Option<Instant>)> = accounts
        .into_iter()
        .map(|(id, bot_id)| (id, (bot_id, None)))
        .collect();
    gauge!("history_fetcher.prioritized_accounts").set(map.len() as f64);
    Arc::new(RwLock::new(map))
}

/// Spawns a background task that periodically refreshes the prioritized accounts list.
/// - Adds new accounts when they become prioritized and have a bot friend
/// - Removes accounts when they are no longer prioritized or lose their bot friend
fn spawn_prioritization_refresh_task(pg_pool: Pool<Postgres>, accounts: PrioritizedAccountsMap) {
    let refresh_interval = Duration::from_secs(*PRIORITIZATION_REFRESH_SECS);
    info!(
        interval_secs = *PRIORITIZATION_REFRESH_SECS,
        "Starting prioritized accounts refresh task"
    );

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(refresh_interval);
        // Skip the first immediate tick since we just initialized
        interval.tick().await;

        loop {
            interval.tick().await;
            refresh_prioritized_accounts(&pg_pool, &accounts).await;
        }
    });
}

/// Returns a list of prioritized accounts (with their `bot_id`) that are due for fetching.
/// An account is due if it has never been fetched or was last fetched more than
/// `PRIORITIZATION_WINDOW_SECS` ago.
/// Also logs warnings for SLA breaches (accounts that have exceeded the fetch window).
async fn get_due_prioritized_accounts(accounts: &PrioritizedAccountsMap) -> Vec<(u32, String)> {
    let window = Duration::from_secs(*PRIORITIZATION_WINDOW_SECS);
    let now = Instant::now();
    let map = accounts.read().await;

    map.iter()
        .filter_map(|(&steam_id3, (bot_id, last_fetched))| {
            let is_due = match last_fetched {
                None => true,
                Some(last) => now.duration_since(*last) > window,
            };
            if is_due {
                if let Some(last) = last_fetched {
                    let overdue_secs = now
                        .duration_since(*last)
                        .as_secs()
                        .saturating_sub(window.as_secs());
                    warn!(
                        steam_id3 = steam_id3,
                        overdue_secs = overdue_secs,
                        window_secs = window.as_secs(),
                        "SLA breach: prioritized account hasn't been fetched within the guaranteed window"
                    );
                    counter!("history_fetcher.prioritized_fetch.sla_breach").increment(1);
                }
                #[allow(clippy::cast_sign_loss)]
                Some((steam_id3 as u32, bot_id.clone()))
            } else {
                None
            }
        })
        .collect()
}

/// Refreshes the prioritized accounts map from the database.
/// Adds new accounts with `last_fetched_at = None` and removes accounts
/// that are no longer prioritized or no longer friends with a bot.
async fn refresh_prioritized_accounts(pg_pool: &Pool<Postgres>, accounts: &PrioritizedAccountsMap) {
    let current_prioritized = match common::get_all_prioritized_accounts_with_bots(pg_pool).await {
        Ok(accounts) => accounts,
        Err(e) => {
            error!(error = %e, "Failed to refresh prioritized accounts, keeping existing set");
            return;
        }
    };

    let current_map: HashMap<i64, String> = current_prioritized.into_iter().collect();

    let mut map = accounts.write().await;

    // Remove accounts that are no longer prioritized or lost their bot friend
    let to_remove: Vec<i64> = map
        .keys()
        .filter(|id| !current_map.contains_key(id))
        .copied()
        .collect();
    for id in &to_remove {
        map.remove(id);
        debug!(steam_id3 = id, "Removed account from prioritized tracking");
    }

    // Add new accounts and update bot_id for existing ones
    let mut added_count = 0;
    for (id, bot_id) in &current_map {
        match map.entry(*id) {
            std::collections::hash_map::Entry::Vacant(e) => {
                e.insert((bot_id.clone(), None));
                added_count += 1;
                debug!(steam_id3 = id, "Added new account to prioritized tracking");
            }
            std::collections::hash_map::Entry::Occupied(mut e) => {
                // Update bot_id if it changed, preserve last_fetched_at
                if e.get().0 != *bot_id {
                    e.get_mut().0.clone_from(bot_id);
                    debug!(
                        steam_id3 = id,
                        bot_id = bot_id,
                        "Updated bot_id for prioritized account"
                    );
                }
            }
        }
    }

    gauge!("history_fetcher.prioritized_accounts").set(map.len() as f64);
    info!(
        total = map.len(),
        added = added_count,
        removed = to_remove.len(),
        "Refreshed prioritized accounts"
    );
}
