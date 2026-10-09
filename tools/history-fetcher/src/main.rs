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
#![expect(clippy::cast_precision_loss)]
#![expect(clippy::cast_possible_truncation)]

use core::time::Duration;
use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LazyLock};

use common::{BatchInserter, BatchInserterConfig, InsertAck};
use futures::StreamExt;
use metrics::{counter, gauge};
use sqlx::{Pool, Postgres};
use tokio::sync::RwLock;
use tokio::time::Instant;
use tracing::{debug, error, info, instrument, warn};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response::EResult;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, ECitadelGameMode,
    ECitadelMatchMode, EgcCitadelClientMessages,
};

use player_match_history::PlayerMatchHistoryEntry;

static HISTORY_COOLDOWN_MILLIS: LazyLock<u64> =
    LazyLock::new(|| common::env_or("HISTORY_COOLDOWN_MILLIS", 24 * 60 * 60 * 1000 / 50));

/// Ranked interval to request alongside each account's plain match history.
/// `None` until the first refresh succeeds, and between seasons.
static RANK_INTERVAL: std::sync::RwLock<Option<u32>> = std::sync::RwLock::new(None);

/// Interval in seconds to refresh the prioritized accounts list from the database.
/// Default: 300 seconds (5 minutes).
static PRIORITIZATION_REFRESH_SECS: LazyLock<u64> =
    LazyLock::new(|| common::env_or("PRIORITIZATION_REFRESH_SECS", 300));

/// Time window in seconds within which prioritized accounts should be fetched.
/// Accounts not fetched within this window are considered due for fetching.
/// Default: 1800 seconds (30 minutes).
static PRIORITIZATION_WINDOW_SECS: LazyLock<u64> =
    LazyLock::new(|| common::env_or("PRIORITIZATION_WINDOW_SECS", 1800));

/// Maximum number of retry attempts for prioritized account fetches.
/// Uses exponential backoff: 1s, 2s, 4s, 8s, 16s, then 30s each (see
/// `common::Backoff::long`). Default: 10 retries.
static PRIORITIZATION_MAX_RETRIES: LazyLock<u32> =
    LazyLock::new(|| common::env_or("PRIORITIZATION_MAX_RETRIES", 10));

/// Number of `PlayerMatchHistoryEntry` rows to accumulate before flushing a
/// batched ``ClickHouse`` insert. Default: 500.
static HISTORY_BATCH_SIZE: LazyLock<usize> =
    LazyLock::new(|| common::env_or("HISTORY_BATCH_SIZE", 500));

/// Maximum time (in milliseconds) to wait before flushing a partial batch
/// when the size threshold has not been reached. Default: 5000 ms.
static HISTORY_FLUSH_INTERVAL_MS: LazyLock<u64> =
    LazyLock::new(|| common::env_or("HISTORY_FLUSH_INTERVAL_MS", 5000));

/// Number of concurrent batch inserter tasks. Default: 1.
static HISTORY_INSERTERS: LazyLock<usize> =
    LazyLock::new(|| common::env_or("HISTORY_INSERTERS", 1));

/// Tracks prioritized Steam accounts, their bot username, and last fetch timestamps.
/// Key: `steam_id3` (as i64), Value: (`bot_id`, `Option<Instant>` where None = never fetched).
type PrioritizedAccountsMap = Arc<RwLock<HashMap<i64, (String, Option<Instant>)>>>;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;

    let http_client = common::http_client();
    let ch_client = common::get_ch_client()?;

    // Initialize PostgreSQL connection pool for prioritization queries
    let pg_pool = common::get_pg_client()
        .await
        .inspect_err(|e| error!("Failed to initialize PostgreSQL connection pool: {e:?}"))?;
    info!("PostgreSQL connection pool initialized successfully");

    // Initialize prioritized accounts tracking from database
    let prioritized_accounts = initialize_prioritized_accounts(&pg_pool).await;

    // Spawn background task to periodically refresh prioritized accounts
    spawn_prioritization_refresh_task(pg_pool.clone(), prioritized_accounts.clone());

    spawn_rank_interval_refresh_task();

    // All fetchers queue their entries here; they are flushed in one CH insert once
    // HISTORY_BATCH_SIZE rows are pending or HISTORY_FLUSH_INTERVAL_MS elapsed.
    let batch_size = *HISTORY_BATCH_SIZE;
    let inserter = BatchInserter::<PlayerMatchHistoryEntry>::spawn(
        &ch_client,
        BatchInserterConfig {
            table: "player_match_history".to_owned(),
            metrics_prefix: "history_fetcher".to_owned(),
            max_rows: batch_size,
            flush_interval: Some(Duration::from_millis(*HISTORY_FLUSH_INTERVAL_MS)),
            workers: *HISTORY_INSERTERS,
            queue_capacity: batch_size.max(1).saturating_mul(2),
        },
    );

    let mut interval = tokio::time::interval(Duration::from_secs(20));
    let shutdown = common::shutdown_token();

    loop {
        tokio::select! {
            _ = interval.tick() => {}
            () = shutdown.cancelled() => break,
        }

        let due = get_due_prioritized_accounts(&prioritized_accounts).await;
        if due.is_empty() {
            continue;
        }

        info!(
            count = due.len(),
            "Processing prioritized accounts due for fetching"
        );

        let fetch_due = futures::stream::iter(due)
            .map(|(account, bot_id)| {
                let (inserter, http_client, prioritized_accounts) =
                    (&inserter, &http_client, &prioritized_accounts);
                async move {
                    update_prioritized_account(
                        inserter,
                        http_client,
                        account,
                        &bot_id,
                        prioritized_accounts,
                    )
                    .await;
                }
            })
            .buffer_unordered(2)
            .collect::<Vec<_>>();
        // Queued entries are flushed below even if their accounts' futures are dropped.
        tokio::select! {
            _ = fetch_due => {}
            () = shutdown.cancelled() => break,
        }
    }

    info!("Shutting down: flushing queued match history");
    inserter.shutdown().await;
    Ok(())
}

/// Keeps [`RANK_INTERVAL`] current.
fn spawn_rank_interval_refresh_task() {
    common::spawn_season_refresh_task(|season| {
        let interval = season.map(|s| s.interval);
        debug!(rank_interval = ?interval, "Refreshed ranked interval");
        *RANK_INTERVAL
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = interval;
    });
}

fn rank_interval() -> Option<u32> {
    *RANK_INTERVAL
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Updates a prioritized account's match history with retry logic.
/// Uses exponential backoff for retries of the fetch. Once the entries are queued for
/// insertion, `last_fetched_at` is set and the account's slot is freed; the flush ack is
/// awaited in the background and re-queues the account if the insert failed. If all fetch
/// retries fail, sets `last_fetched_at` to one window ago to re-queue for next cycle.
#[instrument(skip(http_client, inserter, prioritized_accounts))]
async fn update_prioritized_account(
    inserter: &BatchInserter<PlayerMatchHistoryEntry>,
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

    let mut attempts = 0u32;
    let result = common::retry_with_backoff(
        "prioritized history fetch",
        common::Backoff::long(*PRIORITIZATION_MAX_RETRIES),
        || {
            if attempts > 0 {
                counter!("history_fetcher.prioritized_fetch.retry").increment(1);
            }
            attempts += 1;
            async {
                update_account(inserter, http_client, account, Some(bot_id))
                    .await
                    .ok_or_else(|| format!("Failed to fetch prioritized account {account}"))
            }
        },
    )
    .await;

    let Ok(ack) = result else {
        counter!("history_fetcher.prioritized_fetch.failure").increment(1);
        if requeue(prioritized_accounts, account).await {
            warn!(
                account = account,
                "All retries exhausted for prioritized account, re-queuing for next cycle"
            );
        }
        return;
    };
    counter!("history_fetcher.prioritized_fetch.success").increment(1);
    if let Some(entry) = prioritized_accounts
        .write()
        .await
        .get_mut(&i64::from(account))
    {
        entry.1 = Some(Instant::now());
    }
    if let Some(ack) = ack {
        let prioritized_accounts = Arc::clone(prioritized_accounts);
        tokio::spawn(async move {
            if !confirm_insert(ack, account).await {
                requeue(&prioritized_accounts, account).await;
            }
        });
    }
}

/// Marks `account` as last fetched one window ago, so the next cycle picks it up again.
/// `false` if it is no longer tracked.
async fn requeue(prioritized_accounts: &PrioritizedAccountsMap, account: u32) -> bool {
    let window = Duration::from_secs(*PRIORITIZATION_WINDOW_SECS);
    let mut map = prioritized_accounts.write().await;
    let Some(entry) = map.get_mut(&i64::from(account)) else {
        return false;
    };
    entry.1 = Some(Instant::now() - window);
    true
}

/// Fetches an account's match history and queues its entries for insertion. `None` if the
/// fetch failed; otherwise the ack of the queued insert, if there was anything to insert.
#[instrument(skip(http_client, inserter))]
async fn update_account(
    inserter: &BatchInserter<PlayerMatchHistoryEntry>,
    http_client: &reqwest::Client,
    account: u32,
    bot_username: Option<&str>,
) -> Option<Option<InsertAck>> {
    let rank_interval = rank_interval();
    let match_history = match fetch_account_match_history(http_client, account, bot_username, None)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            counter!("history_fetcher.fetch_match_history.failure").increment(1);
            warn!("Failed to fetch match history for account {account}, error: {e:?}, skipping",);
            return None;
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
        return None;
    }
    // Ranked entries first: they are a field-wise superset, so the dedup below keeps
    // their ranked_* values. Failing here only costs those fields.
    let mut matches = Vec::new();
    if let Some(interval) = rank_interval {
        match fetch_account_match_history(http_client, account, bot_username, Some(interval)).await
        {
            Ok(r) if r.result == Some(EResult::KEResultSuccess as i32) => {
                matches = r.matches;
            }
            Ok(r) => warn!("Ranked match history for {account} failed: {:?}", r.result),
            Err(e) => warn!("Failed to fetch ranked match history for {account}: {e:?}"),
        }
    }
    matches.extend(match_history.matches);
    if matches.is_empty() {
        debug!("No new matches {account}");
        return Some(None);
    }
    let mut seen = HashSet::new();
    let entries: Vec<PlayerMatchHistoryEntry> = matches
        .into_iter()
        .filter(|m| m.match_id.is_some_and(|id| seen.insert(id)))
        .filter_map(|r| PlayerMatchHistoryEntry::from_protobuf(account, r))
        .collect();
    if entries.is_empty() {
        return Some(None);
    }

    let n_entries = entries.len();
    let Some(ack) = inserter.insert(entries).await else {
        counter!("history_fetcher.insert_match_history.failure").increment(1);
        error!("Batch inserter shut down; cannot insert history for account {account}");
        return None;
    };
    debug!(
        account,
        count = n_entries,
        "Queued new matches for insertion"
    );
    Some(Some(ack))
}

/// Waits for a queued insert's flush and records the outcome.
async fn confirm_insert(ack: InsertAck, account: u32) -> bool {
    if ack.flushed().await {
        counter!("history_fetcher.insert_match_history.success").increment(1);
        info!(account, "Inserted new matches via batch");
        true
    } else {
        counter!("history_fetcher.insert_match_history.failure").increment(1);
        error!("Batch insert failed for account {account}, re-queuing it for next cycle");
        false
    }
}

/// With `rank_interval` set the GC returns only that interval's ranked matches, but
/// each entry then carries the ranked_* fields. It gates them on all three of
/// `game_mode`, `match_mode` and `rank_interval`; with any one unset it omits them.
async fn fetch_account_match_history(
    http_client: &reqwest::Client,
    account: u32,
    bot_username: Option<&str>,
    rank_interval: Option<u32>,
) -> anyhow::Result<CMsgClientToGcGetMatchHistoryResponse> {
    let msg = CMsgClientToGcGetMatchHistory {
        account_id: account.into(),
        game_mode: rank_interval
            .is_some()
            .then_some(ECitadelGameMode::KECitadelGameModeNormal as i32),
        match_mode: rank_interval
            .is_some()
            .then_some(ECitadelMatchMode::KECitadelMatchModeRanked as i32),
        rank_interval,
        ..Default::default()
    };
    let job_cooldown = Duration::from_millis(*HISTORY_COOLDOWN_MILLIS);
    common::call_steam_proxy(
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory,
        &msg,
        common::SteamProxyOptions {
            in_all_groups: Some(&["GetMatchHistory"]),
            in_any_groups: None,
            cooldown: job_cooldown,
            soft_cooldown: Some(job_cooldown),
            request_timeout: Duration::from_secs(5),
            username: bot_username,
        },
    )
    .await
    .map(|(_, response)| response)
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
            if let Some(last) = last_fetched {
                let since = now.duration_since(*last);
                if since <= window {
                    return None;
                }
                warn!(
                    steam_id3 = steam_id3,
                    overdue_secs = since.as_secs().saturating_sub(window.as_secs()),
                    window_secs = window.as_secs(),
                    "SLA breach: prioritized account hasn't been fetched within the guaranteed window"
                );
                counter!("history_fetcher.prioritized_fetch.sla_breach").increment(1);
            }
            #[expect(clippy::cast_sign_loss)]
            Some((steam_id3 as u32, bot_id.clone()))
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
    let before = map.len();
    map.retain(|id, _| {
        let keep = current_map.contains_key(id);
        if !keep {
            debug!(steam_id3 = id, "Removed account from prioritized tracking");
        }
        keep
    });
    let removed_count = before - map.len();

    // Add new accounts and update bot_id for existing ones
    let mut added_count = 0;
    for (id, bot_id) in current_map {
        match map.entry(id) {
            Entry::Vacant(e) => {
                e.insert((bot_id, None));
                added_count += 1;
                debug!(steam_id3 = id, "Added new account to prioritized tracking");
            }
            Entry::Occupied(mut e) => {
                // Update bot_id if it changed, preserve last_fetched_at
                if e.get().0 != bot_id {
                    debug!(
                        steam_id3 = id,
                        bot_id = bot_id,
                        "Updated bot_id for prioritized account"
                    );
                    e.get_mut().0 = bot_id;
                }
            }
        }
    }

    gauge!("history_fetcher.prioritized_accounts").set(map.len() as f64);
    info!(
        total = map.len(),
        added = added_count,
        removed = removed_count,
        "Refreshed prioritized accounts"
    );
}
