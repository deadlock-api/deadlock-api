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
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::struct_field_names)]

use core::time::Duration;
use std::collections::{HashMap, HashSet};
use std::io::BufReader;
use std::sync::{Arc, Mutex};

use async_compression::tokio::bufread::BzDecoder;
use clap::Parser;
use futures::{StreamExt, TryStreamExt};
use metrics::{counter, gauge};
use tokio_util::io::StreamReader;
use tracing::{debug, error, info, warn};

mod hashes;
mod models;
mod streaming_demo;
mod visitor;

use models::{
    DemoPlayer, MatchUpdate, MatchWithReplay, ObservedSteamName, ObservedSteamNameChange,
};
use streaming_demo::StreamingDemoFile;
use visitor::{DemoAnalyzerVisitor, SharedState, VisitorError};

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
async fn main() -> anyhow::Result<()> {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;

    let cli = Cli::parse();
    let ch_client = common::get_ch_client()?;
    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_mins(2))
        .build()?;

    let mut failed_matches: HashSet<u64> = HashSet::new();

    loop {
        let mut matches = fetch_pending_matches(&ch_client).await?;
        // Prune failed_matches for ids that have aged out of the 30-day SQL window,
        // otherwise the set grows unboundedly over the process lifetime.
        let valid_ids: HashSet<u64> = matches.iter().map(|m| m.match_id).collect();
        failed_matches.retain(|id| valid_ids.contains(id));
        matches.retain(|m| !failed_matches.contains(&m.match_id));

        if matches.is_empty() {
            info!("No pending matches to process");
            if cli.once {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_mins(1)).await;
            continue;
        }

        info!(
            "Processing {} matches ({} previously failed, skipped)",
            matches.len(),
            failed_matches.len()
        );
        gauge!("demo_analyzer.pending_matches").set(matches.len() as f64);
        gauge!("demo_analyzer.failed_matches").set(failed_matches.len() as f64);

        let mut pending_updates: Vec<MatchUpdate> = Vec::new();
        let mut stream = futures::stream::iter(matches)
            .map(|m| {
                let http = &http_client;
                async move {
                    let match_id = m.match_id;
                    match process_demo(http, &m).await {
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
                }
            })
            .buffer_unordered(cli.parallelism);

        while let Some(result) = stream.next().await {
            match result {
                Ok(update) => pending_updates.push(update),
                Err(match_id) => {
                    failed_matches.insert(match_id);
                }
            }
            if pending_updates.len() >= cli.batch_size {
                info!(
                    "Applying {} match updates to ClickHouse",
                    pending_updates.len()
                );
                apply_updates(&ch_client, &pending_updates).await;
                pending_updates.clear();
            }
        }

        if !pending_updates.is_empty() {
            info!(
                "Applying {} remaining match updates to ClickHouse",
                pending_updates.len()
            );
            apply_updates(&ch_client, &pending_updates).await;
        }

        if cli.once {
            return Ok(());
        }

        tokio::time::sleep(Duration::from_mins(1)).await;
    }
}

async fn fetch_pending_matches(
    ch_client: &clickhouse::Client,
) -> anyhow::Result<Vec<MatchWithReplay>> {
    let matches = ch_client
        .query(
            "SELECT ms.match_id, mp.start_time, ms.cluster_id, ms.replay_salt \
             FROM ( \
                 SELECT match_id, cluster_id, replay_salt \
                 FROM match_salts FINAL \
                 WHERE created_at > now() - INTERVAL 30 DAY \
                   AND replay_salt IS NOT NULL AND replay_salt > 0 \
                   AND cluster_id IS NOT NULL AND cluster_id > 0 \
             ) ms \
             INNER JOIN ( \
                 SELECT match_id, any(start_time) AS start_time \
                 FROM match_player \
                 WHERE match_id IN ( \
                     SELECT match_id FROM match_salts FINAL \
                     WHERE created_at > now() - INTERVAL 30 DAY \
                       AND replay_salt IS NOT NULL AND replay_salt > 0 \
                       AND cluster_id IS NOT NULL AND cluster_id > 0 \
                 ) \
                 AND game_mode = 'Normal' \
                 GROUP BY match_id \
             ) mp ON mp.match_id = ms.match_id \
             WHERE ms.match_id NOT IN ( \
                 SELECT match_id FROM match_player WHERE demo_processed = 1 \
             ) \
             ORDER BY ms.match_id DESC \
             LIMIT 1000 \
             SETTINGS log_comment = 'demo_analyzer_fetch_pending_matches'",
        )
        .fetch_all::<MatchWithReplay>()
        .await?;
    Ok(matches)
}

async fn process_demo(
    http_client: &reqwest::Client,
    match_info: &MatchWithReplay,
) -> anyhow::Result<MatchUpdate> {
    let cluster_id = match_info
        .cluster_id
        .ok_or_else(|| anyhow::anyhow!("missing cluster_id for match {}", match_info.match_id))?;
    let replay_salt = match_info
        .replay_salt
        .ok_or_else(|| anyhow::anyhow!("missing replay_salt for match {}", match_info.match_id))?;
    let url = format!(
        "http://replay{cluster_id}.valve.net/1422450/{}_{replay_salt}.dem.bz2",
        match_info.match_id
    );

    let match_id = match_info.match_id;
    debug!(match_id, %url, "Downloading demo");
    let response = http_client.get(&url).send().await?.error_for_status()?;

    // Stream HTTP → bz2 decompress → pipe to sync reader → parser.
    // Neither compressed nor decompressed data is fully buffered.
    let byte_stream = response.bytes_stream().map_err(std::io::Error::other);
    let stream_reader = StreamReader::new(byte_stream);
    let decoder = BzDecoder::new(tokio::io::BufReader::new(stream_reader));

    // Bridge async decompressor → sync reader via an OS pipe.
    // The parser thread is fully outside the tokio runtime so there's no
    // "block_on inside runtime" conflict.
    let (pipe_reader, pipe_writer) = os_pipe::pipe()?;

    // Spawn a task that copies decompressed bytes into the pipe.
    let copy_handle = tokio::spawn(async move {
        let mut decoder = decoder;
        let std_file = std::fs::File::from(std::os::fd::OwnedFd::from(pipe_writer));
        let mut async_writer = tokio::fs::File::from_std(std_file);
        tokio::io::copy(&mut decoder, &mut async_writer).await
    });

    // Parse on a real OS thread (not spawn_blocking) to avoid tokio runtime nesting.
    let state = Arc::new(Mutex::new(SharedState::default()));
    let state_clone = Arc::clone(&state);
    debug!(match_id, "Starting parser thread");
    let parse_handle = std::thread::spawn(move || -> anyhow::Result<()> {
        let reader = BufReader::new(pipe_reader);
        let demo_file = StreamingDemoFile::start_reading(reader)?;
        let visitor = DemoAnalyzerVisitor::new(state_clone, 12);
        let mut parser = haste::parser::Parser::from_stream_with_visitor(demo_file, visitor)?;

        // The visitor's async methods are actually sync (just HashMap ops),
        // so a minimal single-threaded runtime is fine here.
        let result = tokio::runtime::Builder::new_current_thread()
            .build()?
            .block_on(parser.run_to_end());

        // AllPlayersCollected is the expected early-exit signal, not an error.
        match result {
            Ok(()) => Ok(()),
            Err(e)
                if e.downcast_ref::<VisitorError>()
                    .is_some_and(|ve| matches!(ve, VisitorError::AllDataCollected)) =>
            {
                Ok(())
            }
            Err(e) => Err(e),
        }
    });

    // Wait for the parser thread first, then cancel/join the copy task.
    // When the parser exits early, dropping the pipe_reader causes the copy
    // task's write to get a broken pipe error, which is expected.
    let parse_result = parse_handle
        .join()
        .map_err(|_| anyhow::anyhow!("parser thread panicked"))?;
    parse_result?;

    // The copy task may have ended with a broken pipe if the parser exited early.
    // That's fine — we only care about the parse result.
    match copy_handle.await? {
        Ok(_) => {}
        #[allow(clippy::std_instead_of_core)]
        Err(e) if e.kind() == std::io::ErrorKind::BrokenPipe => {
            debug!(match_id, "Copy task ended (parser stopped early)");
        }
        Err(e) => return Err(e.into()),
    }

    let state = state.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
    let update = correlate(match_info, &state);

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

        let account_id = if steam_id >= common::STEAM_ID_IDENT {
            common::steam_id64_to_account_id(steam_id)
        } else {
            let Ok(id) = u32::try_from(steam_id) else {
                continue;
            };
            id
        };

        players.push(DemoPlayer {
            account_id,
            hero_build_id,
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

async fn apply_updates(ch_client: &clickhouse::Client, updates: &[MatchUpdate]) {
    for update in updates {
        if let Err(e) = apply_update(ch_client, update).await {
            error!("Failed to apply update for match {}: {e}", update.match_id);
            counter!("demo_analyzer.update.failure").increment(1);
        } else {
            counter!("demo_analyzer.update.success").increment(1);
        }
    }
}

async fn apply_update(ch_client: &clickhouse::Client, update: &MatchUpdate) -> anyhow::Result<()> {
    let bans = format_array(update.banned_hero_ids.iter().copied());
    let accounts = format_array(update.players.iter().map(|p| p.account_id));
    let builds = format_array(update.players.iter().map(|p| p.hero_build_id));
    let match_id = update.match_id;

    // transform(account_id, [accounts], [builds], 0) maps each player's
    // account_id to its build_id; rows with no match (or empty input) get 0.
    let query = format!(
        "UPDATE match_player \
         SET banned_hero_ids = {bans}, \
             hero_build_id = transform(account_id, {accounts}, {builds}, toUInt64(0)), \
             demo_processed = 1 \
         WHERE match_id = {match_id}"
    );

    common::retry_fn_with_backoff("apply_update", || {
        let q = query.clone();
        async move {
            ch_client.query(&q).execute().await?;
            Ok::<_, clickhouse::error::Error>(())
        }
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
) -> anyhow::Result<()> {
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

    let mut inserter = ch_client
        .insert::<ObservedSteamNameChange>("steam_profile_observed_names")
        .await?;
    for name_change in &name_changes {
        inserter.write(name_change).await?;
    }
    inserter.end().await?;

    counter!("demo_analyzer.observed_name_change_insert.success")
        .increment(name_changes.len() as u64);
    Ok(())
}

fn normalize_observed_name(name: &str) -> Option<String> {
    let name = name.trim_end_matches('\0');
    (!name.is_empty()).then(|| name.to_owned())
}

fn format_array<T: core::fmt::Display>(values: impl IntoIterator<Item = T>) -> String {
    let mut out = String::from("[");
    let mut first = true;
    for v in values {
        if !first {
            out.push(',');
        }
        first = false;
        out.push_str(&v.to_string());
    }
    out.push(']');
    out
}
