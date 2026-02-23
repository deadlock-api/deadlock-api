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

use core::time::Duration;
use std::collections::HashSet;
use std::sync::LazyLock;

use anyhow::bail;
use clickhouse::Client;
use futures::StreamExt;
use metrics::{counter, gauge};
use models::{MatchSalt, PendingMatch, PrioritizedMatch};
use tokio::sync::Mutex;
use tracing::{debug, error, info, instrument, warn};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_meta_data_response::EResult::KEResultRateLimited;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse,
    EgcCitadelClientMessages,
};

mod models;

static SALTS_COOLDOWN_MILLIS: LazyLock<u64> = LazyLock::new(|| {
    std::env::var("SALTS_COOLDOWN_MILLIS").map_or(24 * 60 * 60 * 1000 / 100, |x| {
        x.parse().expect("SALTS_COOLDOWN_MILLIS must be a number")
    })
});
static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap()
});
/// Maximum retry attempts for prioritized match salt fetches (default: 5).
static PRIORITIZATION_MAX_RETRIES: LazyLock<u32> = LazyLock::new(|| {
    std::env::var("PRIORITIZATION_MAX_RETRIES").map_or(5, |x| {
        x.parse()
            .expect("PRIORITIZATION_MAX_RETRIES must be a number")
    })
});

#[tokio::main]
#[allow(clippy::too_many_lines)]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

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

    loop {
        // Fetch all prioritized account IDs from PostgreSQL
        let prioritized_account_ids = match common::get_all_prioritized_accounts(&pg_pool).await {
            Ok(ids) => ids,
            Err(e) => {
                warn!("Failed to fetch prioritized accounts: {e:?}");
                Vec::new()
            }
        };

        // Query full match history for prioritized accounts (no LIMIT)
        let mut pending_matches: Vec<PendingMatch> = Vec::new();

        if !prioritized_account_ids.is_empty() {
            info!(
                "Fetching full history for {} prioritized accounts",
                prioritized_account_ids.len()
            );

            // Convert i64 to u32 for ClickHouse query
            let account_ids_u32: Vec<u32> = prioritized_account_ids
                .iter()
                .filter_map(|&id| u32::try_from(id).ok())
                .collect();

            let prio_query = r"
            SELECT match_id, groupArray(account_id) AS participants
            FROM player_match_history
            WHERE account_id IN ?
              AND match_mode IN ('Ranked', 'Unranked')
              AND start_time < now() - INTERVAL 2 HOUR
              AND match_id NOT IN (SELECT match_id FROM match_salts)
              AND match_id NOT IN (SELECT match_id FROM match_info)
            GROUP BY match_id
            ORDER BY match_id DESC
            ";

            match ch_client
                .query(prio_query)
                .bind(account_ids_u32)
                .fetch_all::<PendingMatch>()
                .await
            {
                Ok(matches) => {
                    info!("Found {} matches for prioritized accounts", matches.len());
                    pending_matches.extend(matches);
                }
                Err(e) => {
                    warn!("Failed to fetch prioritized account matches: {e:?}");
                }
            }
        }

        // Query regular pending matches with participant account_ids for prioritization checking
        let query = r"
        SELECT match_id, groupArray(account_id) AS participants
        FROM player_match_history
        WHERE match_mode IN ('Ranked', 'Unranked')
          AND start_time BETWEEN '2025-08-01' AND now() - INTERVAL 2 HOUR
          AND match_id NOT IN (SELECT match_id FROM match_salts)
          AND match_id NOT IN (SELECT match_id FROM match_info)
        GROUP BY match_id
        ORDER BY match_id DESC
        LIMIT 100

        UNION ALL

        SELECT match_id, players.account_id AS participants
        FROM active_matches
        WHERE match_mode IN ('Ranked', 'Unranked')
          AND match_id NOT IN (SELECT match_id FROM match_salts)
          AND match_id NOT IN (SELECT match_id FROM match_info)
          AND start_time BETWEEN '2024-11-15' AND now() - INTERVAL 2 HOUR
        ORDER BY match_id DESC
        LIMIT 100
        ";
        let regular_matches: Vec<PendingMatch> = ch_client.query(query).fetch_all().await?;
        pending_matches.extend(regular_matches);

        // Deduplicate matches by match_id (prioritized matches take precedence)
        let mut seen_matches = HashSet::new();
        pending_matches.retain(|m| seen_matches.insert(m.match_id));

        if pending_matches.is_empty() {
            info!("No new matches to fetch, sleeping 60s...");
            tokio::time::sleep(Duration::from_mins(1)).await;
            continue;
        }
        info!("Found {} total matches to fetch", pending_matches.len());

        // Batch-check participants against prioritized accounts (reuse already-fetched set)
        let prioritized_set: HashSet<i64> = prioritized_account_ids.iter().copied().collect();
        let mut prioritized_matches = mark_prioritized_matches(&prioritized_set, pending_matches);

        // Sort so prioritized matches are processed first
        prioritized_matches.sort_by_key(|b| core::cmp::Reverse(b.is_prioritized));

        // Update gauge for prioritized matches pending processing
        let prioritized_count = prioritized_matches
            .iter()
            .filter(|m| m.is_prioritized)
            .count();
        gauge!("salt_scraper.prioritized_matches_pending").set(prioritized_count as f64);
        if prioritized_count > 0 {
            info!("Processing {prioritized_count} prioritized matches first");
        }

        // Track failed prioritized matches for re-queueing
        let failed_prioritized: std::sync::Arc<Mutex<Vec<u64>>> =
            std::sync::Arc::new(Mutex::new(Vec::new()));

        futures::stream::iter(prioritized_matches)
            .map(|prioritized_match| {
                let ch_client = ch_client.clone();
                let failed_prioritized = std::sync::Arc::clone(&failed_prioritized);
                async move {
                    let match_id = prioritized_match.match_id;
                    if prioritized_match.is_prioritized {
                        // Prioritized match: use exponential backoff retry
                        match fetch_prioritized_match(&ch_client, match_id, prioritized_match.target_account_id).await {
                            Ok(()) => {
                                counter!("salt_scraper.prioritized_fetch.success").increment(1);
                                info!("Fetched prioritized match {match_id}");
                            }
                            Err(e) => {
                                counter!("salt_scraper.prioritized_fetch.failure").increment(1);
                                warn!("Failed to fetch prioritized match {match_id} after all retries: {e:?}");
                                // Re-queue for next cycle by tracking the failure
                                failed_prioritized.lock().await.push(match_id);
                            }
                        }
                    } else {
                        // Regular match: use existing 30 retries with 1s fixed interval
                        match fetch_match(&ch_client, match_id, prioritized_match.target_account_id).await {
                            Ok(()) => info!("Fetched match {match_id}"),
                            Err(e) => warn!("Failed to fetch match {match_id}: {e:?}"),
                        }
                    }
                }
            })
            .buffer_unordered(2)
            .collect::<Vec<_>>()
            .await;

        // Log any failed prioritized matches that will be re-queued
        let failed = failed_prioritized.lock().await;
        if !failed.is_empty() {
            info!(
                "Re-queueing {} failed prioritized matches for next cycle: {:?}",
                failed.len(),
                *failed
            );
        }
    }
}

/// Fetches a prioritized match with exponential backoff retry.
///
/// Uses configurable max retries (default 5) with exponential backoff delays.
/// Logs when fetching a prioritized match and tracks retry attempts.
#[instrument(skip(ch_client))]
async fn fetch_prioritized_match(
    ch_client: &Client,
    match_id: u64,
    target_account_id: Option<u32>,
) -> anyhow::Result<()> {
    info!("Fetching prioritized match {match_id}");

    // Use exponential backoff for prioritized matches
    let max_retries = *PRIORITIZATION_MAX_RETRIES;
    let attempt = core::sync::atomic::AtomicU32::new(0);

    common::retry_with_backoff_configurable(max_retries, || {
        let current = attempt.fetch_add(1, core::sync::atomic::Ordering::Relaxed);
        if current > 0 {
            counter!("salt_scraper.prioritized_fetch.retry").increment(1);
        }
        async { fetch_match_internal(ch_client, match_id, target_account_id).await }
    })
    .await
}

/// Internal match fetch logic used by both regular and prioritized fetches.
async fn fetch_match_internal(
    ch_client: &Client,
    match_id: u64,
    target_account_id: Option<u32>,
) -> anyhow::Result<()> {
    // Fetch Salts
    let salts = fetch_salts(match_id, target_account_id).await;
    let (username, salts) = match salts {
        Ok(r) => {
            counter!("salt_scraper.fetch_salts.success").increment(1);
            debug!("Fetched salts: {:?}", r.1);
            r
        }
        Err(e) => {
            counter!("salt_scraper.fetch_salts.failure").increment(1);
            warn!("Failed to fetch salts: {:?}", e);
            return Err(e);
        }
    };

    // Parse Salts
    if let Some(result) = salts.result
        && result == KEResultRateLimited as i32
    {
        counter!("salt_scraper.parse_salt.failure").increment(1);
        bail!("Got a rate limited response: {salts:?}");
    }
    counter!("salt_scraper.parse_salt.success").increment(1);
    debug!("Parsed salts");

    // Ingest Salts
    match ingest_salts(ch_client, match_id, salts, username.into()).await {
        Ok(()) => {
            counter!("salt_scraper.ingest_salt.success").increment(1);
            debug!("Ingested salts");
            Ok(())
        }
        Err(e) => {
            counter!("salt_scraper.ingest_salt.failure").increment(1);
            warn!("Failed to ingest salts: {:?}", e);
            Err(e.into())
        }
    }
}

#[instrument(skip(ch_client))]
async fn fetch_match(
    ch_client: &Client,
    match_id: u64,
    target_account_id: Option<u32>,
) -> anyhow::Result<()> {
    // Fetch Salts with fixed 30 retries and 1s interval for regular matches
    let salts = tryhard::retry_fn(|| fetch_salts(match_id, target_account_id))
        .retries(30)
        .fixed_backoff(Duration::from_secs(1))
        .await;
    let (username, salts) = match salts {
        Ok(r) => {
            counter!("salt_scraper.fetch_salts.success").increment(1);
            debug!("Fetched salts: {:?}", r.1);
            r
        }
        Err(e) => {
            counter!("salt_scraper.fetch_salts.failure").increment(1);
            warn!("Failed to fetch salts: {:?}", e);
            return Err(e);
        }
    };

    // Parse Salts
    if let Some(result) = salts.result
        && result == KEResultRateLimited as i32
    {
        counter!("salt_scraper.parse_salt.failure").increment(1);
        bail!("Got a rate limited response: {salts:?}");
    }
    counter!("salt_scraper.parse_salt.success").increment(1);
    debug!("Parsed salts");

    // Ingest Salts
    match ingest_salts(ch_client, match_id, salts, username.into()).await {
        Ok(()) => {
            counter!("salt_scraper.ingest_salt.success").increment(1);
            debug!("Ingested salts");
            Ok(())
        }
        Err(e) => {
            counter!("salt_scraper.ingest_salt.failure").increment(1);
            warn!("Failed to ingest salts: {:?}", e);
            Err(e.into())
        }
    }
}

async fn fetch_salts(
    match_id: u64,
    target_account_id: Option<u32>,
) -> anyhow::Result<(String, CMsgClientToGcGetMatchMetaDataResponse)> {
    let msg = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        target_account_id,
        ..Default::default()
    };
    common::call_steam_proxy(
        &HTTP_CLIENT,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData,
        &msg,
        None,
        None,
        Duration::from_millis(*SALTS_COOLDOWN_MILLIS),
        None,
        Duration::from_secs(5),
    )
    .await
}

async fn ingest_salts(
    ch_client: &Client,
    match_id: u64,
    salts: CMsgClientToGcGetMatchMetaDataResponse,
    username: Option<String>,
) -> clickhouse::error::Result<()> {
    let salts = MatchSalt {
        match_id,
        cluster_id: salts.replay_group_id,
        metadata_salt: salts.metadata_salt,
        replay_salt: salts.replay_salt,
        username: Some(format!("salt-scraper:{}", username.unwrap_or_default())),
    };
    let mut inserter = ch_client.insert::<MatchSalt>("match_salts").await?;
    inserter.write(&salts).await?;
    inserter.end().await
}

/// Batch-checks participants against prioritized accounts and marks matches accordingly.
///
/// Takes a pre-fetched set of prioritized account IDs and returns a list of `PrioritizedMatch`
/// entries with the priority flag set based on whether any participant is in the prioritized set.
fn mark_prioritized_matches(
    prioritized_accounts: &HashSet<i64>,
    pending_matches: Vec<PendingMatch>,
) -> Vec<PrioritizedMatch> {
    // Mark matches as prioritized if any participant is in the prioritized set
    pending_matches
        .into_iter()
        .map(|m| {
            let is_prioritized = m
                .participants
                .iter()
                .any(|&id| prioritized_accounts.contains(&i64::from(id)));
            let target_account_id = prioritized_accounts
                .iter()
                .find(|&&id| {
                    m.participants
                        .contains(&u32::try_from(id).unwrap_or_default())
                })
                .copied()
                .and_then(|id| u32::try_from(id).ok());
            PrioritizedMatch {
                match_id: m.match_id,
                target_account_id,
                is_prioritized,
            }
        })
        .collect()
}
