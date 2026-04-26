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
use std::collections::HashSet;
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

use models::{DemoPlayer, MatchWithReplay};
use streaming_demo::StreamingDemoFile;
use visitor::{DemoAnalyzerVisitor, SharedState, VisitorError};

const STEAM_ID_64_IDENT: u64 = 76_561_197_960_265_728;

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
    common::init_tracing();
    common::init_metrics()?;

    let cli = Cli::parse();
    let ch_client = common::get_ch_client()?;
    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_mins(2))
        .build()?;

    let mut failed_matches: HashSet<u64> = HashSet::new();

    loop {
        let mut matches = fetch_pending_matches(&ch_client).await?;
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

        let mut pending_rows: Vec<DemoPlayer> = Vec::new();
        let mut stream = futures::stream::iter(matches)
            .map(|m| {
                let http = &http_client;
                async move {
                    let match_id = m.match_id;
                    match process_demo(http, &m).await {
                        Ok(rows) => {
                            counter!("demo_analyzer.demo_processed.success").increment(1);
                            Ok(rows)
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
                Ok(rows) => pending_rows.extend(rows),
                Err(match_id) => {
                    failed_matches.insert(match_id);
                }
            }
            if pending_rows.len() >= cli.batch_size {
                info!("Inserting {} rows into ClickHouse", pending_rows.len());
                if let Err(e) = insert_batch(&ch_client, &pending_rows).await {
                    error!("Failed to insert batch: {e}");
                }
                pending_rows.clear();
            }
        }

        if !pending_rows.is_empty() {
            info!(
                "Inserting {} remaining rows into ClickHouse",
                pending_rows.len()
            );
            if let Err(e) = insert_batch(&ch_client, &pending_rows).await {
                error!("Failed to insert batch: {e}");
            }
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
            "SELECT ms.match_id, ms.cluster_id, ms.replay_salt \
             FROM match_salts ms FINAL \
             INNER JOIN match_info mi ON ms.match_id = mi.match_id \
             WHERE ms.created_at > now() - INTERVAL 30 DAY \
               AND ms.replay_salt IS NOT NULL \
               AND ms.replay_salt > 0 \
               AND ms.cluster_id IS NOT NULL \
               AND ms.cluster_id > 0 \
               AND mi.game_mode = 'Normal' \
               AND ms.match_id NOT IN ( \
                 SELECT DISTINCT match_id FROM demo_player \
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
) -> anyhow::Result<Vec<DemoPlayer>> {
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
    let rows = correlate(match_id, &state);

    info!(
        "Match {match_id}: extracted {} player rows, {} bans",
        rows.len(),
        state.banned_hero_ids.len()
    );
    Ok(rows)
}

fn correlate(match_id: u64, state: &SharedState) -> Vec<DemoPlayer> {
    let mut rows = Vec::new();
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

        let account_id = if steam_id >= STEAM_ID_64_IDENT {
            steam_id - STEAM_ID_64_IDENT
        } else {
            steam_id
        };
        let Ok(account_id) = u32::try_from(account_id) else {
            continue;
        };

        rows.push(DemoPlayer {
            match_id,
            account_id,
            hero_build_id,
            banned_hero_ids: state.banned_hero_ids.clone(),
        });
    }
    rows
}

async fn insert_batch(ch_client: &clickhouse::Client, rows: &[DemoPlayer]) -> anyhow::Result<()> {
    common::retry_fn_with_backoff("insert_batch", || async {
        let mut inserter = ch_client.insert::<DemoPlayer>("demo_player").await?;
        for row in rows {
            inserter.write(row).await?;
        }
        inserter.end().await?;
        Ok::<_, clickhouse::error::Error>(())
    })
    .await?;
    Ok(())
}
