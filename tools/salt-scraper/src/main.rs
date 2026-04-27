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

/// Upper bound for valid `match_ids`. `match_salts` has historical garbage values up to
/// ~3.7e18 which otherwise force the anti-join set to cover a huge key range. Real
/// `match_ids` fit in `u32`.
const MAX_VALID_MATCH_ID: &str = "4294967295";

static SALTS_COOLDOWN_MILLIS: LazyLock<u64> =
    LazyLock::new(|| common::env_or("SALTS_COOLDOWN_MILLIS", 24 * 60 * 60 * 1000 / 100));
static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_default()
});
/// Maximum retry attempts for prioritized match salt fetches (default: 5).
static PRIORITIZATION_MAX_RETRIES: LazyLock<u32> =
    LazyLock::new(|| common::env_or("PRIORITIZATION_MAX_RETRIES", 5));

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
        let prioritized_account_ids = common::get_all_prioritized_accounts(&pg_pool)
            .await
            .unwrap_or_else(|e| {
                warn!("Failed to fetch prioritized accounts: {e:?}");
                Vec::new()
            });

        // Convert prioritized account IDs for ClickHouse (u32)
        let account_ids_u32: Vec<u32> = prioritized_account_ids
            .iter()
            .filter_map(|&id| u32::try_from(id).ok())
            .collect();

        // Prio scans full history via LEFT ANTI JOIN against a merged, bounded anti-set.
        // The `match_id < MAX_VALID_MATCH_ID` bound on match_salts strips garbage sentinels
        // so the join side stays dense.
        let prio_fut = async {
            if account_ids_u32.is_empty() {
                return Ok(Vec::new());
            }
            info!(
                "Fetching full history for {} prioritized accounts",
                account_ids_u32.len()
            );
            let prio_query = format!(
                r"
            SELECT pmh.match_id, groupArray(pmh.account_id) AS participants
            FROM player_match_history pmh
            LEFT ANTI JOIN (
                SELECT match_id FROM match_salts WHERE match_id >= 31247321 AND match_id < {MAX_VALID_MATCH_ID}
                UNION DISTINCT
                SELECT match_id FROM match_player WHERE match_id >= 31247321
            ) ex ON ex.match_id = pmh.match_id
            WHERE pmh.account_id IN ?
              AND pmh.match_mode IN ('Ranked', 'Unranked')
              AND pmh.start_time < now() - INTERVAL 2 HOUR
              AND pmh.match_id >= 31247321
            GROUP BY pmh.match_id
            ORDER BY pmh.match_id DESC
            SETTINGS log_comment = 'salt_scraper_prio_pending_matches'
            "
            );
            ch_client
                .query(&prio_query)
                .bind(&account_ids_u32)
                .fetch_all::<PendingMatch>()
                .await
        };

        // Fast path for regular queries: narrow match_id floor via PK lookup on recent data.
        // If these return empty (scraper caught up or fell behind past the window),
        // fall back to the full-range LEFT ANTI JOIN version below.
        let pmh_fast = format!(
            r"
        WITH (SELECT max(match_id) - toUInt64(2000000) FROM match_player) AS mid_floor
        SELECT match_id, groupArray(account_id) AS participants
        FROM player_match_history
        WHERE match_mode IN ('Ranked', 'Unranked')
          AND start_time >= now() - INTERVAL 7 DAY
          AND start_time < now() - INTERVAL 2 HOUR
          AND match_id >= mid_floor
          AND match_id NOT IN (
            SELECT match_id FROM match_salts WHERE match_id >= mid_floor AND match_id < {MAX_VALID_MATCH_ID}
            UNION DISTINCT
            SELECT match_id FROM match_player WHERE match_id >= mid_floor
          )
        GROUP BY match_id
        ORDER BY match_id DESC
        LIMIT 100
        SETTINGS log_comment = 'salt_scraper_pmh_fast_pending_matches'
        "
        );
        let pmh_fut = ch_client.query(&pmh_fast).fetch_all::<PendingMatch>();

        let active_fast = format!(
            r"
        WITH (SELECT max(match_id) - toUInt64(5000000) FROM active_matches) AS mid_floor
        SELECT match_id, players.account_id AS participants
        FROM active_matches
        WHERE match_mode IN ('Ranked', 'Unranked')
          AND match_id >= mid_floor
          AND start_time < now() - INTERVAL 2 HOUR
          AND match_id NOT IN (
            SELECT match_id FROM match_salts WHERE match_id >= mid_floor AND match_id < {MAX_VALID_MATCH_ID}
            UNION DISTINCT
            SELECT match_id FROM match_player WHERE match_id >= mid_floor
          )
        ORDER BY match_id DESC
        LIMIT 100
        SETTINGS log_comment = 'salt_scraper_active_fast_pending_matches'
        "
        );
        let active_fut = ch_client.query(&active_fast).fetch_all::<PendingMatch>();

        let (prio_res, pmh_res, active_res) = tokio::join!(prio_fut, pmh_fut, active_fut);

        let mut pending_matches: Vec<PendingMatch> = Vec::new();
        match prio_res {
            Ok(matches) => {
                if !matches.is_empty() {
                    info!("Found {} matches for prioritized accounts", matches.len());
                }
                pending_matches.extend(matches);
            }
            Err(e) => warn!("Failed to fetch prioritized account matches: {e:?}"),
        }

        let mut pmh_empty = false;
        match pmh_res {
            Ok(matches) => {
                pmh_empty = matches.is_empty();
                pending_matches.extend(matches);
            }
            Err(e) => warn!("Failed to fetch pmh pending matches: {e:?}"),
        }
        let mut active_empty = false;
        match active_res {
            Ok(matches) => {
                active_empty = matches.is_empty();
                pending_matches.extend(matches);
            }
            Err(e) => warn!("Failed to fetch active_matches pending matches: {e:?}"),
        }

        // Fallback: when the recent-window fast path returns no rows, scan the full range
        // via LEFT ANTI JOIN. Only hit in catch-up / cold-start scenarios.
        if pmh_empty || active_empty {
            let pmh_full_fut = async {
                if !pmh_empty {
                    return Ok(Vec::new());
                }
                info!("pmh fast path empty; falling back to full range");
                let q = format!(
                    r"
                SELECT pmh.match_id, groupArray(pmh.account_id) AS participants
                FROM player_match_history pmh
                LEFT ANTI JOIN (
                    SELECT match_id FROM match_salts WHERE match_id >= 31247321 AND match_id < {MAX_VALID_MATCH_ID}
                    UNION DISTINCT
                    SELECT match_id FROM match_player WHERE match_id >= 31247321
                ) ex ON ex.match_id = pmh.match_id
                WHERE pmh.match_mode IN ('Ranked', 'Unranked')
                  AND pmh.start_time < now() - INTERVAL 2 HOUR
                  AND pmh.match_id >= 31247321
                GROUP BY pmh.match_id
                ORDER BY pmh.match_id DESC
                LIMIT 100
                SETTINGS log_comment = 'salt_scraper_pmh_full_pending_matches'
                "
                );
                ch_client.query(&q).fetch_all::<PendingMatch>().await
            };
            let active_full_fut = async {
                if !active_empty {
                    return Ok(Vec::new());
                }
                info!("active_matches fast path empty; falling back to full range");
                let q = format!(
                    r"
                SELECT am.match_id, am.players.account_id AS participants
                FROM active_matches am
                LEFT ANTI JOIN (
                    SELECT match_id FROM match_salts WHERE match_id >= 31247321 AND match_id < {MAX_VALID_MATCH_ID}
                    UNION DISTINCT
                    SELECT match_id FROM match_player WHERE match_id >= 31247321
                ) ex ON ex.match_id = am.match_id
                WHERE am.match_mode IN ('Ranked', 'Unranked')
                  AND am.start_time < now() - INTERVAL 2 HOUR
                ORDER BY am.match_id DESC
                LIMIT 100
                SETTINGS log_comment = 'salt_scraper_active_full_pending_matches'
                "
                );
                ch_client.query(&q).fetch_all::<PendingMatch>().await
            };
            let (pmh_full_res, active_full_res) = tokio::join!(pmh_full_fut, active_full_fut);
            match pmh_full_res {
                Ok(matches) => pending_matches.extend(matches),
                Err(e) => warn!("Failed pmh full-range fallback: {e:?}"),
            }
            match active_full_res {
                Ok(matches) => pending_matches.extend(matches),
                Err(e) => warn!("Failed active_matches full-range fallback: {e:?}"),
            }
        }

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
                        match fetch_prioritized_match(&ch_client, match_id).await {
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
                        match fetch_match(&ch_client, match_id).await {
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
async fn fetch_prioritized_match(ch_client: &Client, match_id: u64) -> anyhow::Result<()> {
    info!("Fetching prioritized match {match_id}");

    // Use exponential backoff for prioritized matches
    let max_retries = *PRIORITIZATION_MAX_RETRIES;
    let attempt = core::sync::atomic::AtomicU32::new(0);

    common::retry_with_backoff_configurable(max_retries, || {
        let current = attempt.fetch_add(1, core::sync::atomic::Ordering::Relaxed);
        if current > 0 {
            counter!("salt_scraper.prioritized_fetch.retry").increment(1);
        }
        async { fetch_match_internal(ch_client, match_id).await }
    })
    .await
}

/// Internal match fetch logic used by both regular and prioritized fetches.
async fn fetch_match_internal(ch_client: &Client, match_id: u64) -> anyhow::Result<()> {
    // Fetch Salts
    let salts = fetch_salts(match_id, true).await;
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
async fn fetch_match(ch_client: &Client, match_id: u64) -> anyhow::Result<()> {
    // Fetch Salts with fixed 30 retries and 1s interval for regular matches
    let salts = tryhard::retry_fn(|| fetch_salts(match_id, false))
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
    is_prioritized: bool,
) -> anyhow::Result<(String, CMsgClientToGcGetMatchMetaDataResponse)> {
    let msg = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        ..Default::default()
    };
    let job_cooldown = Duration::from_millis(*SALTS_COOLDOWN_MILLIS);
    let soft_cooldown = if is_prioritized {
        Some(job_cooldown / 2)
    } else {
        None
    };
    common::call_steam_proxy(
        &HTTP_CLIENT,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData,
        &msg,
        Some(&["GetMatchMetaData"]),
        None,
        job_cooldown,
        soft_cooldown,
        Duration::from_secs(5),
        None,
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
            PrioritizedMatch {
                match_id: m.match_id,
                is_prioritized,
            }
        })
        .collect()
}
