#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

use core::time::Duration;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use async_compression::tokio::bufread::{BzDecoder, ZstdDecoder};
use clap::Parser;
use futures::{StreamExt as _, TryStreamExt as _};
use haste::async_demofile::AsyncDemoFile;
use haste::demofile::DemoHeaderError;
use haste::parser::{AsyncStreamingParser, ParserError};
use metrics::{counter, gauge};
use steam_id::SteamId;
use tokio::io::AsyncReadExt as _;
use tokio_util::io::StreamReader;
use tracing::{debug, error, info, warn};

use crate::models::{
    DemoPlayer, MatchUpdate, MatchWithReplay, ObservedSteamName, ObservedSteamNameChange,
};
use crate::visitor::{DemoAnalyzerVisitor, SharedState, VisitorError};

mod hashes;
mod models;
mod visitor;

const ZSTD_MAGIC: [u8; 4] = [0x28, 0xb5, 0x2f, 0xfd];

/// `FINAL` over the whole `match_salts` table costs ~10 CPU-seconds however few rows the
/// `created_at` filter keeps, so between full scans only salts created within
/// [`INCREMENTAL_WINDOW`] are merged, which prunes by primary key. Matches whose metadata lands
/// later than that, and matches whose update failed, are picked up by the next full scan.
const FULL_SCAN_INTERVAL: Duration = Duration::from_mins(30);
const INCREMENTAL_WINDOW: &str = "2 HOUR";
/// `created_at` is not in the `match_salts` key, so even a 2-hour window scans the whole table
/// (~27M rows), and the old matches whose salts arrive late spread its match ids over ~80
/// `match_player` partitions. Incremental polls therefore only look at matches started within
/// this age, a `match_id` bound both tables prune on (60M rows read → 2M); older matches are
/// left to the full scan, which also refreshes the bound.
const INCREMENTAL_MAX_MATCH_AGE: &str = "7 DAY";
/// A failed match is retried after this, doubling per failure up to [`MAX_RETRY_DELAY`]:
/// most failures (demo not uploaded yet, relay hiccup) are transient.
const BASE_RETRY_DELAY: Duration = Duration::from_mins(10);
const MAX_RETRY_DELAY: Duration = Duration::from_hours(12);
/// Concurrent `UPDATE`s when applying a batch.
const UPDATE_CONCURRENCY: usize = 4;

/// Matches whose processing failed, with how often and when they last failed.
#[derive(Default)]
struct FailedMatches(HashMap<u64, (u32, Instant)>);

impl FailedMatches {
    fn record_failure(&mut self, match_id: u64, now: Instant) {
        let attempts = self
            .0
            .get(&match_id)
            .map_or(1, |(a, _)| a.saturating_add(1));
        self.0.insert(match_id, (attempts, now));
    }

    fn is_backing_off(&self, match_id: u64, now: Instant) -> bool {
        self.0.get(&match_id).is_some_and(|&(attempts, failed_at)| {
            let delay = BASE_RETRY_DELAY
                .saturating_mul(2u32.saturating_pow(attempts.saturating_sub(1).min(16)))
                .min(MAX_RETRY_DELAY);
            now.saturating_duration_since(failed_at) < delay
        })
    }

    fn len(&self) -> usize {
        self.0.len()
    }
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error(transparent)]
    Metrics(#[from] telemetry::MetricsError),
    #[error(transparent)]
    Env(#[from] std::env::VarError),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    ClickHouse(#[from] clickhouse::error::Error),
}

/// Why a demo could not be turned into a [`MatchUpdate`].
#[derive(Debug, thiserror::Error)]
enum DemoError {
    #[error("missing cluster_id for match {0}")]
    MissingClusterId(u64),
    #[error("missing replay_salt for match {0}")]
    MissingReplaySalt(u64),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    DemoHeader(#[from] DemoHeaderError),
    #[error(transparent)]
    Parse(#[from] ParserError<VisitorError>),
    #[error("{0}")]
    LockPoisoned(String),
}

#[derive(Parser)]
#[command(about = "Analyze Deadlock demo files to extract player hero build data")]
struct Cli {
    /// Number of demos to process concurrently
    #[arg(long, env, default_value_t = 5)]
    parallelism: usize,

    /// Batch size for `ClickHouse` inserts
    #[arg(long, env, default_value_t = 100)]
    batch_size: usize,

    /// Run once and exit (no loop)
    #[arg(long, env)]
    once: bool,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let _otel_guard = telemetry::init_tracing(env!("CARGO_PKG_NAME"));
    telemetry::init_metrics()?;

    let cli = Cli::parse();
    let ch_client = db_clients::get_ch_client()?;
    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_mins(2))
        .connect_timeout(Duration::from_secs(5))
        .build()?;

    let mut failed_matches = FailedMatches::default();
    let mut last_full_scan: Option<Instant> = None;
    let mut incremental_min_match_id = 0;

    // Not `run_until_shutdown`: a shutdown must not drop the parsed updates `process_matches`
    // has not applied yet. It stops that batch, applies them, and the loop exits here.
    let shutdown = service_utils::shutdown_token();
    async {
        while !shutdown.is_cancelled() {
            let full_scan = last_full_scan.is_none_or(|t| t.elapsed() >= FULL_SCAN_INTERVAL);
            // A failed query must not end the process: log it and poll again later.
            let pending = async {
                if full_scan {
                    incremental_min_match_id = clickhouse_utils::fetch_min_match_id_started_within(
                        &ch_client,
                        INCREMENTAL_MAX_MATCH_AGE,
                        "demo_analyzer_fetch_incremental_min_match_id",
                    )
                    .await?;
                }
                fetch_pending_matches(&ch_client, full_scan, incremental_min_match_id).await
            };
            let mut matches = match pending.await {
                Ok(matches) => matches,
                Err(e) => {
                    counter!("demo_analyzer.fetch_pending_matches.failure").increment(1);
                    error!(
                        "Failed to fetch pending matches: {}",
                        service_utils::ErrorChain(&e)
                    );
                    if cli.once {
                        return Err(e);
                    }
                    shutdown
                        .run_until_cancelled(tokio::time::sleep(Duration::from_mins(1)))
                        .await;
                    continue;
                }
            };
            if full_scan {
                last_full_scan = Some(Instant::now());
                // Prune failed_matches for ids that have aged out of the 30-day SQL window,
                // otherwise the set grows unboundedly over the process lifetime.
                let valid_ids: HashSet<u64> = matches.iter().map(|m| m.match_id).collect();
                failed_matches.0.retain(|id, _| valid_ids.contains(id));
            }
            let now = Instant::now();
            matches.retain(|m| !failed_matches.is_backing_off(m.match_id, now));

            if matches.is_empty() {
                info!("No pending matches to process");
                if cli.once {
                    return Ok(());
                }
                shutdown
                    .run_until_cancelled(tokio::time::sleep(Duration::from_mins(1)))
                    .await;
                continue;
            }

            info!(
                "Processing {} matches ({} have failed before)",
                matches.len(),
                failed_matches.len()
            );
            #[expect(
                clippy::cast_precision_loss,
                reason = "match counts stay far below 2^53"
            )]
            {
                gauge!("demo_analyzer.pending_matches").set(matches.len() as f64);
                gauge!("demo_analyzer.failed_matches").set(failed_matches.len() as f64);
            }

            let failed = process_matches(
                &http_client,
                &ch_client,
                matches,
                cli.parallelism,
                cli.batch_size,
            )
            .await;
            let now = Instant::now();
            for match_id in failed {
                failed_matches.record_failure(match_id, now);
            }

            if cli.once {
                return Ok(());
            }

            shutdown
                .run_until_cancelled(tokio::time::sleep(Duration::from_mins(1)))
                .await;
        }
        info!("Shutting down");
        Ok::<_, clickhouse::error::Error>(())
    }
    .await?;
    Ok(())
}

/// Processes `matches` and applies their updates in batches; returns the failed match ids.
///
/// A shutdown drops the demos still downloading or parsing (they stay pending and are picked
/// up again) and applies the updates already parsed.
async fn process_matches(
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    matches: Vec<MatchWithReplay>,
    parallelism: usize,
    batch_size: usize,
) -> Vec<u64> {
    let mut failed = Vec::new();
    let mut pending_updates: Vec<MatchUpdate> = Vec::new();
    let stream = futures::stream::iter(matches)
        .map(|m| async move {
            let match_id = m.match_id;
            match process_demo(http_client, &m).await {
                Ok(update) => {
                    counter!("demo_analyzer.demo_processed.success").increment(1);
                    Ok(update)
                }
                Err(e) => {
                    counter!("demo_analyzer.demo_processed.failure").increment(1);
                    warn!("Failed to process match {match_id}: {e}");
                    Err(match_id)
                }
            }
        })
        .buffer_unordered(parallelism)
        .take_until(service_utils::shutdown_token().cancelled_owned());
    let mut stream = core::pin::pin!(stream);

    while let Some(result) = stream.next().await {
        match result {
            Ok(update) => pending_updates.push(update),
            Err(match_id) => failed.push(match_id),
        }
        if pending_updates.len() >= batch_size {
            info!(
                "Applying {} match updates to ClickHouse",
                pending_updates.len()
            );
            if let Err(match_ids) = apply_updates(ch_client, &pending_updates).await {
                failed.extend(match_ids);
            }
            pending_updates.clear();
        }
    }

    if !pending_updates.is_empty() {
        info!(
            "Applying {} remaining match updates to ClickHouse",
            pending_updates.len()
        );
        if let Err(match_ids) = apply_updates(ch_client, &pending_updates).await {
            failed.extend(match_ids);
        }
    }
    failed
}

async fn fetch_pending_matches(
    ch_client: &clickhouse::Client,
    full_scan: bool,
    incremental_min_match_id: u64,
) -> clickhouse::error::Result<Vec<MatchWithReplay>> {
    let (window, min_match_id) = if full_scan {
        ("30 DAY", 0)
    } else {
        (INCREMENTAL_WINDOW, incremental_min_match_id)
    };
    // The salts side folds each key group by hand rather than with FINAL (~9x faster): a
    // merge keeps the last inserted value, and insert order is the part's max block number.
    //
    // Only a match with a replay salt can qualify, and most matches touched in the window have
    // none (or no `match_player` rows at all), so `replayable` narrows `recent` before either
    // side reads by it: the `match_player` side would otherwise read every granule of every
    // match whose salts changed in the window (~1.9M matches over 30 days, 1 GiB of memory).
    let matches = ch_client
        .query(&format!(
            "WITH recent AS ( \
                 SELECT match_id FROM match_salts \
                 WHERE match_id >= {min_match_id} AND created_at > now() - INTERVAL {window} \
             ), \
             replayable AS ( \
                 SELECT match_id FROM match_salts \
                 WHERE match_id IN recent AND cluster_id > 0 AND replay_salt > 0 \
             ) \
             SELECT ms.match_id, mp.start_time, ms.cluster_id, ms.replay_salt \
             FROM ( \
                 SELECT match_id, cluster_id, replay_salt \
                 FROM ( \
                     SELECT match_id, cluster_id, metadata_salt, \
                         max(replay_salt) AS replay_salt, \
                         argMax(created_at, toUInt64(splitByChar('_', _part)[3])) AS created_at, \
                         max(verified_at) AS verified_at, \
                         max(failed_at) AS failed_at \
                     FROM match_salts \
                     WHERE match_id IN replayable AND cluster_id > 0 \
                     GROUP BY match_id, cluster_id, metadata_salt \
                 ) \
                 WHERE created_at > now() - INTERVAL {window} \
                   AND replay_salt > 0 \
                   AND failed_at IS NULL \
                 ORDER BY verified_at IS NOT NULL DESC \
                 LIMIT 1 BY match_id \
             ) ms \
             INNER JOIN ( \
                 SELECT match_id, any(start_time) AS start_time, max(demo_processed) AS demo_processed \
                 FROM match_player \
                 WHERE match_id IN replayable \
                 AND game_mode = 'Normal' \
                 GROUP BY match_id \
             ) mp ON mp.match_id = ms.match_id \
             WHERE mp.demo_processed = 0 \
             ORDER BY ms.match_id DESC \
             LIMIT 1000 \
             SETTINGS log_comment = 'demo_analyzer_fetch_pending_matches'"
        ))
        .fetch_all::<MatchWithReplay>()
        .await?;
    Ok(matches)
}

async fn process_demo(
    http_client: &reqwest::Client,
    match_info: &MatchWithReplay,
) -> Result<MatchUpdate, DemoError> {
    let cluster_id = match_info
        .cluster_id
        .ok_or(DemoError::MissingClusterId(match_info.match_id))?;
    let replay_salt = match_info
        .replay_salt
        .ok_or(DemoError::MissingReplaySalt(match_info.match_id))?;
    let url = format!(
        "http://replay{cluster_id}.valve.net/1422450/{}_{replay_salt}.dem.bz2",
        match_info.match_id
    );

    let match_id = match_info.match_id;
    debug!(match_id, %url, "Downloading demo");
    let response = http_client.get(&url).send().await?.error_for_status()?;

    // Stream HTTP → decompress → async parser. Nothing is fully buffered.
    let byte_stream = response.bytes_stream().map_err(std::io::Error::other);
    let mut stream_reader = tokio::io::BufReader::new(StreamReader::new(byte_stream));

    // Valve kept the `.dem.bz2` name but switched newer matches to zstd, so the container
    // is sniffed from the magic bytes. The consumed magic is spliced back in front of the
    // stream so the decoder still sees a complete frame.
    let mut magic = [0u8; 4];
    stream_reader.read_exact(&mut magic).await?;
    let body = tokio::io::BufReader::new((&magic[..]).chain(stream_reader));

    let decoder: Box<dyn tokio::io::AsyncRead + Unpin + Send> = if magic == ZSTD_MAGIC {
        Box::new(ZstdDecoder::new(body))
    } else {
        Box::new(BzDecoder::new(body))
    };

    let state = Arc::new(Mutex::new(SharedState::default()));
    debug!(match_id, "Starting parser");
    let demo_file = AsyncDemoFile::start_reading(decoder).await?;
    let visitor = DemoAnalyzerVisitor::new(Arc::clone(&state), 12);
    let mut parser = AsyncStreamingParser::from_stream_with_visitor(demo_file, visitor)?;

    // AllDataCollected is the expected early-exit signal, not an error.
    match parser.run_to_end().await {
        Ok(()) | Err(ParserError::Visitor(VisitorError::AllDataCollected)) => {}
        Err(e) => return Err(e.into()),
    }

    let update = correlate(
        match_info,
        &*state
            .lock()
            .map_err(|e| DemoError::LockPoisoned(e.to_string()))?,
    );

    info!(
        "Match {match_id}: extracted {} players, {} bans",
        update.players.len(),
        update.banned_hero_ids.len()
    );
    Ok(update)
}

fn correlate(match_info: &MatchWithReplay, state: &SharedState) -> MatchUpdate {
    let mut players = Vec::new();
    for pawn in state.pawns.values() {
        let Some(ctrl_idx) = pawn.controller_index else {
            continue;
        };
        let Some(ctrl) = state.controllers.get(&ctrl_idx) else {
            continue;
        };
        let (Some(steam_id), Some(hero_build_id)) = (ctrl.steam_id, pawn.hero_build_id) else {
            continue;
        };

        let Ok(steam_id) = SteamId::from_account_or_steam64(steam_id) else {
            continue;
        };
        let account_id = steam_id.account_id();

        players.push(DemoPlayer {
            account_id,
            hero_build_id,
            pregame_hero_id: ctrl.pregame_hero_id,
            observed_name: ctrl.steam_name.as_deref().and_then(normalize_observed_name),
        });
    }
    MatchUpdate {
        match_id: match_info.match_id,
        start_time: match_info.start_time,
        banned_hero_ids: state.banned_hero_ids.clone(),
        players,
    }
}

/// Applies `updates`, failing with the matches whose update failed: they are still unprocessed,
/// so they must back off like failed demos instead of being downloaded again on the next pass.
async fn apply_updates(
    ch_client: &clickhouse::Client,
    updates: &[MatchUpdate],
) -> Result<(), Vec<u64>> {
    let failed: Vec<u64> = futures::stream::iter(updates)
        .map(|update| async move {
            match apply_update(ch_client, update).await {
                Ok(()) => {
                    counter!("demo_analyzer.update.success").increment(1);
                    None
                }
                Err(e) => {
                    error!("Failed to apply update for match {}: {e}", update.match_id);
                    counter!("demo_analyzer.update.failure").increment(1);
                    Some(update.match_id)
                }
            }
        })
        .buffer_unordered(UPDATE_CONCURRENCY)
        .filter_map(core::future::ready)
        .collect()
        .await;
    if failed.is_empty() {
        Ok(())
    } else {
        Err(failed)
    }
}

async fn apply_update(
    ch_client: &clickhouse::Client,
    update: &MatchUpdate,
) -> clickhouse::error::Result<()> {
    let bans = format_array(update.banned_hero_ids.iter().copied());
    let accounts = format_array(update.players.iter().map(|p| p.account_id));
    let builds = format_array(update.players.iter().map(|p| p.hero_build_id));
    let pregame_heroes = format_array(update.players.iter().map(|p| {
        p.pregame_hero_id
            .map_or_else(|| "NULL".to_owned(), |h| h.to_string())
    }));
    let match_id = update.match_id;

    // transform(account_id, [accounts], [builds], NULL) maps each player's
    // account_id to its build_id; rows with no match (or empty input) get NULL.
    let query = format!(
        "UPDATE match_player \
         SET banned_hero_ids = {bans}, \
             hero_build_id = transform(account_id, {accounts}, CAST({builds}, 'Array(Nullable(UInt64))'), NULL), \
             pregame_hero_id = transform(account_id, {accounts}, CAST({pregame_heroes}, 'Array(Nullable(UInt32))'), NULL), \
             demo_processed = 1 \
         WHERE match_id = {match_id}"
    );

    service_utils::retry_with_backoff("apply_update", service_utils::Backoff::SHORT, || {
        ch_client.query(&query).execute()
    })
    .await?;

    if let Err(e) = insert_observed_name_changes(ch_client, update).await {
        warn!(
            "Failed to insert Steam name change observations for match {}: {e}",
            update.match_id
        );
        counter!("demo_analyzer.observed_name_change_insert.failure").increment(1);
    }

    Ok(())
}

async fn insert_observed_name_changes(
    ch_client: &clickhouse::Client,
    update: &MatchUpdate,
) -> clickhouse::error::Result<()> {
    let observed_names: HashMap<u32, &str> = update
        .players
        .iter()
        .filter_map(|p| {
            p.observed_name
                .as_deref()
                .map(|observed_name| (p.account_id, observed_name))
        })
        .collect();
    if observed_names.is_empty() {
        return Ok(());
    }

    let account_ids = observed_names.keys().copied().collect::<Vec<_>>();
    let previous_names = ch_client
        .query(
            "SELECT account_id, observed_name \
             FROM steam_profile_observed_names \
             WHERE account_id IN ? \
             ORDER BY account_id, observed_at DESC \
             LIMIT 1 BY account_id \
             SETTINGS log_comment = 'demo_analyzer_get_observed_steam_names'",
        )
        .bind(&account_ids)
        .fetch_all::<ObservedSteamName>()
        .await?;
    let previous_names = previous_names
        .into_iter()
        .map(|row| (row.account_id, row.observed_name))
        .collect::<HashMap<_, _>>();

    let name_changes = observed_names
        .into_iter()
        .filter(|(account_id, observed_name)| {
            previous_names
                .get(account_id)
                .is_none_or(|previous_name| previous_name != observed_name)
        })
        .map(|(account_id, observed_name)| ObservedSteamNameChange {
            account_id,
            observed_name: observed_name.to_owned(),
            match_id: update.match_id,
            observed_at: update.start_time,
        })
        .collect::<Vec<_>>();

    if name_changes.is_empty() {
        return Ok(());
    }

    clickhouse_utils::insert_rows(ch_client, "steam_profile_observed_names", &name_changes).await?;

    counter!("demo_analyzer.observed_name_change_insert.success")
        .increment(name_changes.len() as u64);
    Ok(())
}

fn normalize_observed_name(name: &str) -> Option<String> {
    let name = name.trim_end_matches('\0');
    (!name.is_empty()).then(|| name.to_owned())
}

fn format_array<T: core::fmt::Display>(values: impl IntoIterator<Item = T>) -> String {
    let values: Vec<String> = values.into_iter().map(|v| v.to_string()).collect();
    format!("[{}]", values.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_matches_back_off_exponentially_up_to_the_cap() {
        let mut failed = FailedMatches::default();
        let start = Instant::now();
        failed.record_failure(1, start);
        assert!(failed.is_backing_off(1, start + BASE_RETRY_DELAY / 2));
        assert!(!failed.is_backing_off(1, start + BASE_RETRY_DELAY));

        failed.record_failure(1, start);
        assert!(failed.is_backing_off(1, start + BASE_RETRY_DELAY));
        assert!(!failed.is_backing_off(1, start + BASE_RETRY_DELAY * 2));

        for _ in 0..40 {
            failed.record_failure(1, start);
        }
        assert!(!failed.is_backing_off(1, start + MAX_RETRY_DELAY));
        assert!(!failed.is_backing_off(2, start));
    }
}
