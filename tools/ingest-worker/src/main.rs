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

use core::sync::atomic::{AtomicUsize, Ordering};
use core::time::Duration;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use anyhow::{Context, bail};
use bytes::Bytes;
use clap::Parser;
use futures::StreamExt;
use metrics::{counter, gauge};
use object_store::path::Path;
use object_store::{GetResult, ObjectStore, ObjectStoreExt};
use prost::Message;
use tokio::sync::mpsc;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};
use valveprotos::deadlock::c_msg_match_meta_data_contents::{EMatchOutcome, MatchInfo};
use valveprotos::deadlock::{
    CMsgMatchMetaData, CMsgMatchMetaDataContents, CMsgMatchMetaDataContentsPatched,
};

use crate::models::clickhouse_match_metadata::ClickhouseMatchPlayer;
use crate::models::clickhouse_player_match_history::PlayerMatchHistoryEntry;

mod models;

#[derive(Parser)]
#[command(about = "Deadlock match metadata ingest worker")]
struct Cli {
    /// Path to a file containing match IDs (one per line) to re-ingest
    /// from the processed/failed S3 folders.
    #[arg(long)]
    reingest_file: Option<String>,

    /// Number of concurrent S3 fetch / parse tasks for re-ingestion (default: 50)
    #[arg(long, default_value_t = 50)]
    reingest_parallelism: usize,

    /// Number of matches to batch per ``ClickHouse`` insert during re-ingestion (default: 500)
    #[arg(long, default_value_t = 500)]
    reingest_batch_size: usize,

    /// Number of concurrent ``ClickHouse`` inserter tasks for re-ingestion (default: 2)
    #[arg(long, default_value_t = 2)]
    reingest_inserters: usize,

    /// Number of concurrent S3 fetch / parse tasks for the live ingest loop (default: 10)
    #[arg(long, default_value_t = 10, env = "INGEST_PARALLELISM")]
    ingest_parallelism: usize,

    /// Number of matches to batch per ``ClickHouse`` insert during live ingestion (default: 10000)
    #[arg(long, default_value_t = 10_000, env = "INGEST_BATCH_SIZE")]
    ingest_batch_size: usize,

    /// Number of concurrent ``ClickHouse`` inserter tasks for live ingestion (default: 1)
    #[arg(long, default_value_t = 1, env = "INGEST_INSERTERS")]
    ingest_inserters: usize,

    /// Maximum time (in milliseconds) to wait before flushing a partial batch (default: 60000)
    #[arg(long, default_value_t = 60_000, env = "INGEST_FLUSH_INTERVAL_MS")]
    ingest_flush_interval_ms: u64,
}

/// Parsed match data ready for ``ClickHouse`` insertion.
struct ParsedMatch {
    players: Vec<ClickhouseMatchPlayer>,
    history: Vec<PlayerMatchHistoryEntry>,
}

type InflightSet = Arc<Mutex<HashSet<Path>>>;

fn lock_inflight(inflight: &InflightSet) -> std::sync::MutexGuard<'_, HashSet<Path>> {
    inflight
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;

    let cli = Cli::parse();

    let ch_client = common::get_ch_client()?;
    let store = Arc::new(common::get_store()?);

    if let Some(ref file_path) = cli.reingest_file {
        return reingest_from_file(
            &*store,
            &ch_client,
            file_path,
            cli.reingest_parallelism,
            cli.reingest_batch_size,
            cli.reingest_inserters,
        )
        .await;
    }

    run_ingest_loop(
        store,
        &ch_client,
        cli.ingest_parallelism,
        cli.ingest_batch_size,
        cli.ingest_inserters,
        Duration::from_millis(cli.ingest_flush_interval_ms),
    )
    .await
}

async fn run_ingest_loop<S>(
    store: Arc<S>,
    ch_client: &clickhouse::Client,
    parallelism: usize,
    batch_size: usize,
    num_inserters: usize,
    flush_interval: Duration,
) -> anyhow::Result<()>
where
    S: ObjectStore + 'static,
{
    info!(
        "Starting live ingest loop: parallelism={parallelism}, batch_size={batch_size}, \
         inserters={num_inserters}, flush_interval_ms={}",
        flush_interval.as_millis()
    );

    let (tx, rx) = mpsc::channel::<(Path, ParsedMatch)>(batch_size.max(1).saturating_mul(2));
    let rx = Arc::new(tokio::sync::Mutex::new(rx));
    let inflight: InflightSet = Arc::new(Mutex::new(HashSet::new()));

    for i in 0..num_inserters {
        let client = ch_client.clone();
        let rx = Arc::clone(&rx);
        let store = Arc::clone(&store);
        let inflight = Arc::clone(&inflight);
        tokio::spawn(async move {
            live_batch_inserter(client, store, rx, inflight, batch_size, flush_interval, i).await;
        });
    }

    let mut interval = tokio::time::interval(Duration::from_secs(10));

    loop {
        interval.tick().await;
        let objs_to_ingest = match list_ingest_objects(&*store).await {
            Ok(value) => {
                counter!("ingest_worker.list_ingest_objects.success").increment(1);
                debug!("Listed {} objects", value.len());
                value
            }
            Err(e) => {
                counter!("ingest_worker.list_ingest_objects.failure").increment(1);
                error!("Error listing objects: {:?}", e);
                continue;
            }
        };

        gauge!("ingest_worker.objs_to_ingest").set(objs_to_ingest.len() as f64);

        if objs_to_ingest.is_empty() {
            info!("No files to fetch");
            tokio::time::sleep(Duration::from_secs(30)).await;
            continue;
        }

        let new_keys: Vec<Path> = {
            let mut guard = lock_inflight(&inflight);
            objs_to_ingest
                .into_iter()
                .filter(|k| guard.insert(k.clone()))
                .collect()
        };

        if new_keys.is_empty() {
            debug!("All listed objects are already in flight; skipping");
            continue;
        }

        futures::stream::iter(new_keys)
            .map(|key| {
                let store = Arc::clone(&store);
                let tx = tx.clone();
                let inflight = Arc::clone(&inflight);
                async move {
                    match timeout(
                        Duration::from_secs(30),
                        fetch_parse_and_send(&*store, &key, &tx),
                    )
                    .await
                    {
                        Ok(Ok(true)) => {
                            counter!("ingest_worker.fetch_parse.success").increment(1);
                        }
                        Ok(Ok(false)) => {
                            counter!("ingest_worker.fetch_parse.success").increment(1);
                            lock_inflight(&inflight).remove(&key);
                        }
                        Ok(Err(e)) => {
                            counter!("ingest_worker.fetch_parse.failure").increment(1);
                            error!("Error fetching/parsing object {key}: {e:#}");
                            lock_inflight(&inflight).remove(&key);
                        }
                        Err(_) => {
                            counter!("ingest_worker.fetch_parse.timeout").increment(1);
                            error!("Fetch+parse timed out for {key}");
                            lock_inflight(&inflight).remove(&key);
                        }
                    }
                }
            })
            .buffer_unordered(parallelism)
            .collect::<Vec<_>>()
            .await;
        info!("Producer drained current listing");
    }
}

/// Long-running batch inserter for the live ingest loop.
///
/// Pulls `(key, ParsedMatch)` items off the shared receiver, accumulates up to
/// `batch_size` items (or until `flush_interval` elapses with a non-empty batch),
/// and flushes them in a single `ClickHouse` insert per table. On flush success,
/// the corresponding S3 keys are moved to `processed/`. On persistent failure,
/// the batch is dropped (objects stay in `ingest/` and will be re-listed next tick).
async fn live_batch_inserter<S>(
    client: clickhouse::Client,
    store: Arc<S>,
    rx: Arc<tokio::sync::Mutex<mpsc::Receiver<(Path, ParsedMatch)>>>,
    inflight: InflightSet,
    batch_size: usize,
    flush_interval: Duration,
    inserter_id: usize,
) where
    S: ObjectStore + 'static,
{
    let mut batch: Vec<(Path, ParsedMatch)> = Vec::with_capacity(batch_size);
    let mut flush_timer = tokio::time::interval(flush_interval);
    flush_timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    flush_timer.tick().await;

    loop {
        let recv_fut = async {
            let mut guard = rx.lock().await;
            guard.recv().await
        };

        tokio::select! {
            biased;
            _ = flush_timer.tick(), if !batch.is_empty() => {
                flush_live_batch(&client, &*store, &inflight, &mut batch, inserter_id).await;
            }
            opt = recv_fut => {
                let Some(item) = opt else {
                    if !batch.is_empty() {
                        flush_live_batch(&client, &*store, &inflight, &mut batch, inserter_id).await;
                    }
                    return;
                };
                batch.push(item);
                {
                    let mut guard = rx.lock().await;
                    while batch.len() < batch_size {
                        match guard.try_recv() {
                            Ok(item) => batch.push(item),
                            Err(_) => break,
                        }
                    }
                }
                if batch.len() >= batch_size {
                    flush_live_batch(&client, &*store, &inflight, &mut batch, inserter_id).await;
                }
            }
        }
    }
}

/// Flush a live-loop batch to ``ClickHouse`` (with retry); on success move
/// the underlying S3 keys to `processed/`. On persistent failure, drop the
/// batch — objects remain in `ingest/` and will be re-listed next tick.
async fn flush_live_batch<S: ObjectStore>(
    client: &clickhouse::Client,
    store: &S,
    inflight: &InflightSet,
    batch: &mut Vec<(Path, ParsedMatch)>,
    inserter_id: usize,
) {
    if batch.is_empty() {
        return;
    }
    let n = batch.len();
    let parsed: Vec<&ParsedMatch> = batch.iter().map(|(_, p)| p).collect();
    let result =
        common::retry_fn_with_backoff("Live batch flush", || write_parsed_refs(client, &parsed))
            .await;

    match result {
        Ok(()) => {
            counter!("ingest_worker.batch_flush.success").increment(1);
            counter!("ingest_worker.batch_flush.matches").increment(n as u64);
            info!("[inserter {inserter_id}] Flushed batch of {n} matches");
            let keys: Vec<Path> = batch.drain(..).map(|(k, _)| k).collect();
            futures::stream::iter(keys)
                .map(|key| {
                    let inflight = Arc::clone(inflight);
                    async move {
                        let Some(filename) = key.filename().map(str::to_owned) else {
                            warn!("Missing filename for key {key}, leaving in ingest/");
                            lock_inflight(&inflight).remove(&key);
                            return;
                        };
                        let new_path = Path::from(format!("{PROCESSED_PREFIX}/{filename}"));
                        if let Err(e) = move_object(store, &key, &new_path).await {
                            error!("Failed to move {key} to processed/: {e}");
                        } else {
                            gauge!("ingest_worker.objs_to_ingest").decrement(1);
                        }
                        lock_inflight(&inflight).remove(&key);
                    }
                })
                .buffer_unordered(POST_FLUSH_MOVE_CONCURRENCY)
                .collect::<Vec<_>>()
                .await;
        }
        Err(e) => {
            counter!("ingest_worker.batch_flush.failure").increment(1);
            error!(
                "[inserter {inserter_id}] Batch flush of {n} matches failed permanently, \
                 leaving objects in ingest/ for retry: {e:#}"
            );
            {
                let mut guard = lock_inflight(inflight);
                for (k, _) in batch.drain(..) {
                    guard.remove(&k);
                }
            }
        }
    }
}

/// Fetch + decompress + parse a single object, then either:
/// - move it to `failed/` if it can't be parsed or has an error outcome, or
/// - send the parsed result through `tx` for batched insertion downstream.
async fn fetch_parse_and_send<S: ObjectStore>(
    store: &S,
    key: &Path,
    tx: &mpsc::Sender<(Path, ParsedMatch)>,
) -> anyhow::Result<bool> {
    let obj = get_object(store, key).await?;

    let data = obj.bytes().await?;
    let data = if key
        .extension()
        .is_some_and(|f| f.eq_ignore_ascii_case("bz2"))
    {
        bzip_decompress(data).await?
    } else {
        data.to_vec()
    };

    let filename = key
        .filename()
        .with_context(|| format!("Missing filename for key {key}"))?
        .to_owned();

    let match_info = match parse_match_data(&data) {
        Ok(m)
            if m.match_outcome
                .is_some_and(|o| o == EMatchOutcome::KEOutcomeError as i32) =>
        {
            let new_path = Path::from(format!("{FAILED_PREFIX}/{filename}"));
            move_object(store, key, &new_path).await?;
            counter!("ingest_worker.match_outcome_error").increment(1);
            warn!(
                "[{:?}] Match outcome is error, moved to failed/",
                m.match_id
            );
            gauge!("ingest_worker.objs_to_ingest").decrement(1);
            return Ok(false);
        }
        Err(e) => {
            let new_path = Path::from(format!("{FAILED_PREFIX}/{filename}"));
            move_object(store, key, &new_path).await?;
            warn!("[{filename}] Error parsing match data: {e}");
            gauge!("ingest_worker.objs_to_ingest").decrement(1);
            return Ok(false);
        }
        Ok(m) => m,
    };

    let players = build_ch_players(&match_info);
    let history: Vec<PlayerMatchHistoryEntry> = match_info
        .players
        .iter()
        .filter_map(|p| PlayerMatchHistoryEntry::from_info_and_player(&match_info, p))
        .collect();

    let parsed = ParsedMatch { players, history };
    if tx.send((key.clone(), parsed)).await.is_err() {
        bail!("Insert channel closed; inserter tasks have exited");
    }
    Ok(true)
}

/// Known file extensions for match metadata files.
const MATCH_EXTENSIONS: &[&str] = &[".meta", ".meta.bz2", ".meta_hltv.bz2"];

const PROCESSED_PREFIX: &str = "processed/metadata";
const FAILED_PREFIX: &str = "failed/metadata";

/// Concurrency for S3 moves after a successful batch flush.
const POST_FLUSH_MOVE_CONCURRENCY: usize = 16;

async fn reingest_from_file(
    store: &impl ObjectStore,
    ch_client: &clickhouse::Client,
    file_path: &str,
    parallelism: usize,
    batch_size: usize,
    num_inserters: usize,
) -> anyhow::Result<()> {
    let content = tokio::fs::read_to_string(file_path).await?;
    let match_ids: Vec<String> = content
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();

    let total = match_ids.len();
    info!(
        "Re-ingesting {total} matches with parallelism {parallelism}, \
         batch size {batch_size}, {num_inserters} inserter(s)"
    );

    let success_count = AtomicUsize::new(0);
    let failure_count = AtomicUsize::new(0);

    let (tx, rx) = mpsc::channel::<ParsedMatch>(parallelism * 2);
    let rx = Arc::new(tokio::sync::Mutex::new(rx));
    let cancel = CancellationToken::new();

    // Spawn N concurrent inserter tasks
    let mut insert_handles = Vec::with_capacity(num_inserters);
    for i in 0..num_inserters {
        let client = ch_client.clone();
        let rx = Arc::clone(&rx);
        let cancel = cancel.clone();
        insert_handles.push(tokio::spawn(async move {
            let result = batch_inserter(client, rx, batch_size, cancel).await;
            (i, result)
        }));
    }

    // Fetch, decompress, parse concurrently — send results to inserters
    futures::stream::iter(match_ids)
        .map(|match_id| {
            let tx = tx.clone();
            let cancel = cancel.clone();
            let success_count = &success_count;
            let failure_count = &failure_count;
            async move {
                if cancel.is_cancelled() {
                    return;
                }
                match fetch_and_parse_match(store, &match_id).await {
                    Ok(parsed) => {
                        if tx.send(parsed).await.is_err() {
                            // All inserters have exited — stop producing.
                            // The actual error will be reported from insert_handles.
                            warn!(
                                "Insert channel closed, inserters likely failed — stopping producers"
                            );
                            return;
                        }
                        let done = success_count.fetch_add(1, Ordering::Relaxed) + 1;
                        let failed = failure_count.load(Ordering::Relaxed);
                        info!("[{done}/{total} ok, {failed} failed] Parsed match {match_id}");
                    }
                    Err(e) => {
                        let failed = failure_count.fetch_add(1, Ordering::Relaxed) + 1;
                        let done = success_count.load(Ordering::Relaxed);
                        error!("[{done}/{total} ok, {failed} failed] Failed match {match_id}: {e}");
                    }
                }
            }
        })
        .buffer_unordered(parallelism)
        .collect::<Vec<_>>()
        .await;

    // Drop sender to signal inserters to flush and finish
    drop(tx);

    // Wait for all inserters to complete
    let mut total_inserted = 0usize;
    for handle in insert_handles {
        match handle.await {
            Ok((i, Ok(inserted))) => {
                total_inserted += inserted;
                info!("Inserter {i} finished: {inserted} matches inserted");
            }
            Ok((i, Err(e))) => error!("Inserter {i} failed: {e:#}"),
            Err(e) => error!("Inserter task panicked: {e}"),
        }
    }
    info!("All inserters finished: {total_inserted} matches inserted total");

    let ok = success_count.load(Ordering::Relaxed);
    let fail = failure_count.load(Ordering::Relaxed);
    info!("Re-ingestion complete: {ok} parsed, {fail} failed out of {total}");

    Ok(())
}

/// Open fresh insert handles for both tables.
async fn open_inserters(
    client: &clickhouse::Client,
) -> anyhow::Result<(
    clickhouse::insert::Insert<ClickhouseMatchPlayer>,
    clickhouse::insert::Insert<PlayerMatchHistoryEntry>,
)> {
    Ok((
        client
            .insert::<ClickhouseMatchPlayer>("match_player")
            .await?,
        client
            .insert::<PlayerMatchHistoryEntry>("player_match_history")
            .await?,
    ))
}

/// Write all batch data into fresh inserters and flush them.
async fn write_and_flush_batch(
    client: &clickhouse::Client,
    batch: &[ParsedMatch],
) -> anyhow::Result<()> {
    let refs: Vec<&ParsedMatch> = batch.iter().collect();
    write_parsed_refs(client, &refs).await
}

/// Open fresh inserters, write each parsed match, and flush.
async fn write_parsed_refs(
    client: &clickhouse::Client,
    parsed: &[&ParsedMatch],
) -> anyhow::Result<()> {
    let (mut mp, mut hi) = open_inserters(client).await?;
    for p in parsed {
        for player in &p.players {
            mp.write(player).await?;
        }
        for entry in &p.history {
            hi.write(entry).await?;
        }
    }
    mp.end().await?;
    hi.end().await?;
    Ok(())
}

/// Batch-inserts parsed matches from the channel into ``ClickHouse``.
///
/// Multiple instances run concurrently, each competing to receive from the
/// shared channel. On unrecoverable failure the cancellation token is triggered
/// so producers stop fetching new matches.
async fn batch_inserter(
    client: clickhouse::Client,
    rx: Arc<tokio::sync::Mutex<mpsc::Receiver<ParsedMatch>>>,
    batch_size: usize,
    cancel: CancellationToken,
) -> anyhow::Result<usize> {
    let mut total_inserted: usize = 0;
    let mut batch: Vec<ParsedMatch> = Vec::with_capacity(batch_size);

    loop {
        // Hold the lock and drain as many items as available up to batch_size
        {
            let mut rx_guard = rx.lock().await;
            let remaining = batch_size - batch.len();
            // Block on at least one item (or channel close)
            let Some(parsed) = rx_guard.recv().await else {
                break;
            };
            batch.push(parsed);
            // Then drain any already-buffered items without blocking
            for _ in 1..remaining {
                match rx_guard.try_recv() {
                    Ok(parsed) => batch.push(parsed),
                    Err(_) => break,
                }
            }
        }

        if batch.len() >= batch_size {
            match flush_batch(&client, &batch).await {
                Ok(()) => {
                    total_inserted += batch.len();
                    info!(
                        "Flushed batch of {} matches ({total_inserted} total on this inserter)",
                        batch.len()
                    );
                }
                Err(e) => {
                    error!("Batch flush failed permanently, cancelling: {e:#}");
                    cancel.cancel();
                    return Err(e);
                }
            }
            batch.clear();
        }
    }

    // Flush remaining
    if !batch.is_empty() {
        match flush_batch(&client, &batch).await {
            Ok(()) => {
                total_inserted += batch.len();
                info!(
                    "Flushed final batch of {} matches ({total_inserted} total on this inserter)",
                    batch.len()
                );
            }
            Err(e) => {
                error!("Final batch flush failed permanently: {e:#}");
                return Err(e);
            }
        }
    }

    Ok(total_inserted)
}

/// Flush a batch with retries and exponential backoff using `tryhard`.
async fn flush_batch(client: &clickhouse::Client, batch: &[ParsedMatch]) -> anyhow::Result<()> {
    common::retry_fn_with_backoff("Batch flush", || write_and_flush_batch(client, batch)).await
}

/// Fetch a match from S3, decompress, parse, and convert to ``ClickHouse`` types.
async fn fetch_and_parse_match(
    store: &impl ObjectStore,
    match_id: &str,
) -> anyhow::Result<ParsedMatch> {
    let (path, obj) = find_match_object(store, match_id).await?;

    let data = obj.bytes().await?;
    let data = if path
        .extension()
        .is_some_and(|f| f.eq_ignore_ascii_case("bz2"))
    {
        bzip_decompress(data).await?
    } else {
        data.to_vec()
    };

    let match_info = parse_match_data(&data)?;

    let players = build_ch_players(&match_info);
    let history: Vec<PlayerMatchHistoryEntry> = match_info
        .players
        .iter()
        .filter_map(|p| PlayerMatchHistoryEntry::from_info_and_player(&match_info, p))
        .collect();

    Ok(ParsedMatch { players, history })
}

/// Build the per-player Clickhouse rows for a parsed match.
fn build_ch_players(match_info: &MatchInfo) -> Vec<ClickhouseMatchPlayer> {
    match_info
        .players
        .iter()
        .filter(|p| p.hero_id.is_some_and(|h| h > 0))
        .cloned()
        .map(|p| {
            (
                match_info,
                match_info
                    .winning_team
                    .and_then(|t| p.team.map(|pt| pt == t))
                    .unwrap_or(false),
                match_info
                    .match_paths
                    .as_ref()
                    .and_then(|path| path.paths.iter().find(|pp| pp.player_slot == p.player_slot)),
                p,
            )
                .into()
        })
        .collect()
}

/// Try to find a match file in processed/ first, then failed/, across all known extensions.
async fn find_match_object(
    store: &impl ObjectStore,
    match_id: &str,
) -> anyhow::Result<(Path, GetResult)> {
    for folder in &["processed/metadata", "failed/metadata"] {
        for ext in MATCH_EXTENSIONS {
            let path = Path::from(format!("{folder}/{match_id}{ext}"));
            if let Ok(result) = store.get(&path).await {
                debug!("Found match {match_id} at {path}");
                return Ok((path, result));
            }
        }
    }
    bail!("Match {match_id} not found in processed or failed folders")
}

async fn list_ingest_objects(store: &impl ObjectStore) -> object_store::Result<Vec<Path>> {
    let p = Path::from("ingest/metadata/");

    let mut metas = vec![];
    let mut list_stream = store.list(Some(&p));
    while let Some(meta) = list_stream.next().await.transpose()? {
        debug!("Found object: {:?}", meta.location);
        let filename = meta.location.filename();
        if filename.is_some_and(|name| MATCH_EXTENSIONS.iter().any(|a| name.ends_with(a))) {
            metas.push(meta.location);
        }
    }
    Ok(metas)
}

async fn get_object(store: &impl ObjectStore, key: &Path) -> object_store::Result<GetResult> {
    match store.get(key).await {
        Ok(data) => {
            counter!("ingest_worker.fetch_object.success").increment(1);
            debug!("Fetched object");
            Ok(data)
        }
        Err(e) => {
            counter!("ingest_worker.fetch_object.failure").increment(1);
            error!("Error getting object: {e}");
            Err(e)
        }
    }
}

/// Decompress bzip2 data on a blocking thread to avoid starving the async runtime.
async fn bzip_decompress(data: Bytes) -> std::io::Result<Vec<u8>> {
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let mut decompressed = vec![];
        bzip2::read::BzDecoder::new(data.as_ref()).read_to_end(&mut decompressed)?;
        counter!("ingest_worker.decompress_object.success").increment(1);
        debug!("Decompressed object");
        Ok(decompressed)
    })
    .await
    .map_err(std::io::Error::other)?
}

fn parse_match_data(buf: &[u8]) -> anyhow::Result<MatchInfo> {
    let data = match CMsgMatchMetaData::decode(buf) {
        Ok(m) => m.match_details.map_or(buf.to_owned(), |m| m.clone()),
        Err(_) => buf.to_owned(),
    };
    let data = data.as_slice();
    let data = if let Ok(m) = CMsgMatchMetaDataContents::decode(data).or_else(|_| {
        CMsgMatchMetaDataContentsPatched::decode(data)
            .or_else(|_| CMsgMatchMetaDataContentsPatched::decode(buf))
            .map(|p| p.encode_to_vec())
            .and_then(|p| CMsgMatchMetaDataContents::decode(p.as_slice()))
    }) {
        m.match_info
    } else {
        MatchInfo::decode(data).ok()
    };
    if let Some(m) = data {
        counter!("ingest_worker.parse_match_data.success").increment(1);
        debug!("Parsed match data");
        Ok(m)
    } else {
        counter!("ingest_worker.parse_match_data.failure").increment(1);
        error!("Error parsing match data");
        Err(anyhow::anyhow!("Error parsing match data"))
    }
}

async fn move_object(
    store: &impl ObjectStore,
    old_key: &Path,
    new_key: &Path,
) -> object_store::Result<()> {
    if old_key == new_key {
        return Ok(());
    }
    match common::retry_fn_with_backoff("move_object", || store.rename(old_key, new_key)).await {
        Ok(()) => {
            counter!("ingest_worker.move_object.success").increment(1);
            debug!("Moved object");
            Ok(())
        }
        Err(e) => {
            counter!("ingest_worker.move_object.failure").increment(1);
            error!("Error moving object: {e}");
            Err(e)
        }
    }
}
