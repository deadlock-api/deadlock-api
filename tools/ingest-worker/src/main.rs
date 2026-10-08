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
#![expect(clippy::cast_sign_loss)]
#![expect(clippy::cast_precision_loss)]
#![expect(clippy::cast_possible_truncation)]

use core::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use core::time::Duration;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use anyhow::{Context, bail};
use bytes::Bytes;
use clap::Parser;
use common::{BatchInserter, BatchInserterConfig};
use futures::StreamExt;
use metrics::{counter, gauge};
use object_store::path::Path;
use object_store::{GetResult, ObjectStore, ObjectStoreExt};
use prost::Message;
use tokio::sync::Semaphore;
use tokio::time::timeout;
use tokio_util::task::TaskTracker;
use tracing::{debug, error, info, warn};
use valveprotos::deadlock::c_msg_match_meta_data_contents::{EMatchOutcome, MatchInfo};
use valveprotos::deadlock::{
    CMsgMatchMetaData, CMsgMatchMetaDataContents, CMsgMatchMetaDataContentsPatched,
};

use crate::models::clickhouse_match_metadata::{ClickhouseMatchPlayer, MatchShared};
use crate::models::clickhouse_player_match_history::PlayerMatchHistoryEntry;

mod models;

/// Current season's placement length, 0 until the first refresh succeeds. Needed to
/// turn metadata's "placement games remaining" into the GC's match position.
static CALIBRATION_MATCHES: AtomicU32 = AtomicU32::new(0);

fn calibration_matches() -> Option<u32> {
    Some(CALIBRATION_MATCHES.load(Ordering::Relaxed)).filter(|v| *v > 0)
}

/// Seasons turn over on the order of months; the first tick fires immediately.
fn spawn_season_refresh_task() {
    tokio::spawn(async move {
        let http_client = common::http_client();
        let mut interval = tokio::time::interval(Duration::from_hours(1));
        loop {
            interval.tick().await;
            match common::fetch_current_season(&http_client).await {
                Ok(Some(s)) => {
                    debug!(
                        calibration_matches = s.calibration_matches,
                        "Refreshed season"
                    );
                    CALIBRATION_MATCHES.store(s.calibration_matches, Ordering::Relaxed);
                }
                Ok(None) => debug!("No ranked season in progress"),
                Err(e) => warn!("Failed to refresh ranked season: {e:?}"),
            }
        }
    });
}

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

/// Rough number of players per match, to size row batches from the match-count settings.
const ROWS_PER_MATCH: usize = 12;

/// Batch inserters for the two tables every match is written to.
struct Inserters {
    players: BatchInserter<ClickhouseMatchPlayer>,
    history: BatchInserter<PlayerMatchHistoryEntry>,
}

impl Inserters {
    fn spawn(
        client: &clickhouse::Client,
        matches_per_batch: usize,
        flush_interval: Option<Duration>,
        workers: usize,
    ) -> Self {
        let config = |table: &str| BatchInserterConfig {
            table: table.to_owned(),
            metrics_prefix: "ingest_worker".to_owned(),
            max_rows: matches_per_batch.saturating_mul(ROWS_PER_MATCH),
            flush_interval,
            workers,
            queue_capacity: matches_per_batch.max(1).saturating_mul(2),
        };
        Self {
            players: BatchInserter::spawn(client, config("match_player")),
            history: BatchInserter::spawn(client, config("player_match_history")),
        }
    }

    /// Queues one match's rows into both tables, or into neither: room in both queues is
    /// reserved before anything is queued, so a cancellation (e.g. the fetch timeout)
    /// cannot leave a match half queued. The returned future resolves to whether both
    /// tables got the rows; `None` if the inserters are shut down.
    async fn insert(
        &self,
        parsed: ParsedMatch,
    ) -> Option<impl Future<Output = bool> + Send + 'static> {
        let players = self.players.reserve().await?;
        let history = self.history.reserve().await?;
        let players = players.insert(parsed.players);
        let history = history.insert(parsed.history);
        Some(async move {
            let (players, history) = tokio::join!(players.flushed(), history.flushed());
            players && history
        })
    }

    fn has_failed(&self) -> bool {
        self.players.has_failed() || self.history.has_failed()
    }

    /// Flushes everything queued and stops the inserters.
    async fn shutdown(&self) {
        tokio::join!(self.players.shutdown(), self.history.shutdown());
    }
}

/// Shared handles for moving objects once their rows are flushed.
struct PostFlush<S> {
    store: Arc<S>,
    inflight: InflightSet,
    total_ingested: AtomicUsize,
    move_permits: Semaphore,
    tasks: TaskTracker,
}

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

    spawn_season_refresh_task();

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

    let inserters = Inserters::spawn(ch_client, batch_size, Some(flush_interval), num_inserters);
    let post_flush = Arc::new(PostFlush {
        store: Arc::clone(&store),
        inflight: Arc::new(Mutex::new(HashSet::new())),
        total_ingested: AtomicUsize::new(0),
        move_permits: Semaphore::new(POST_FLUSH_MOVE_CONCURRENCY),
        tasks: TaskTracker::new(),
    });

    let mut interval = tokio::time::interval(Duration::from_secs(10));
    let shutdown = common::shutdown_token();

    loop {
        tokio::select! {
            _ = interval.tick() => {}
            () = shutdown.cancelled() => break,
        }
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
        info!(
            "Queue: {} objects to ingest, {} matches ingested so far",
            objs_to_ingest.len(),
            post_flush.total_ingested.load(Ordering::Relaxed)
        );

        if objs_to_ingest.is_empty() {
            info!("No files to fetch");
            tokio::select! {
                () = tokio::time::sleep(Duration::from_secs(30)) => {}
                () = shutdown.cancelled() => break,
            }
            continue;
        }

        let new_keys: Vec<Path> = {
            let mut guard = lock_inflight(&post_flush.inflight);
            objs_to_ingest
                .into_iter()
                .filter(|k| guard.insert(k.clone()))
                .collect()
        };

        if new_keys.is_empty() {
            debug!("All listed objects are already in flight; skipping");
            continue;
        }

        // On shutdown, finish the objects in progress but start no new ones.
        futures::stream::iter(new_keys)
            .take_until(shutdown.cancelled())
            .map(|key| ingest_key(&post_flush, &inserters, key))
            .buffer_unordered(parallelism)
            .collect::<Vec<_>>()
            .await;
        info!("Producer drained current listing");
    }

    info!("Shutting down: flushing queued matches");
    inserters.shutdown().await;
    post_flush.tasks.close();
    post_flush.tasks.wait().await;
    info!(
        "Shut down after ingesting {} matches",
        post_flush.total_ingested.load(Ordering::Relaxed)
    );
    Ok(())
}

/// Runs [`fetch_parse_and_send`] for one key with a timeout, and releases the key
/// unless it stays in flight until its rows are flushed.
async fn ingest_key<S: ObjectStore + 'static>(
    post_flush: &Arc<PostFlush<S>>,
    inserters: &Inserters,
    key: Path,
) {
    match timeout(
        Duration::from_secs(30),
        fetch_parse_and_send(post_flush, inserters, &key),
    )
    .await
    {
        Ok(Ok(true)) => {
            counter!("ingest_worker.fetch_parse.success").increment(1);
        }
        Ok(Ok(false)) => {
            counter!("ingest_worker.fetch_parse.success").increment(1);
            lock_inflight(&post_flush.inflight).remove(&key);
        }
        Ok(Err(e)) => {
            counter!("ingest_worker.fetch_parse.failure").increment(1);
            error!("Error fetching/parsing object {key}: {e:#}");
            lock_inflight(&post_flush.inflight).remove(&key);
        }
        Err(_) => {
            counter!("ingest_worker.fetch_parse.timeout").increment(1);
            error!("Fetch+parse timed out for {key}");
            lock_inflight(&post_flush.inflight).remove(&key);
        }
    }
}

/// Fetch + decompress + parse a single object, then either:
/// - move it to `failed/` if it can't be parsed or has an error outcome, or
/// - queue its rows for batched insertion; once they are flushed the object is moved to
///   `processed/` (on a failed flush it stays in `ingest/` and is re-listed later).
///
/// Returns `true` if the key stays in flight until its rows are flushed.
async fn fetch_parse_and_send<S: ObjectStore + 'static>(
    post_flush: &Arc<PostFlush<S>>,
    inserters: &Inserters,
    key: &Path,
) -> anyhow::Result<bool> {
    let store = &*post_flush.store;
    let obj = match get_object(store, key).await {
        Ok(obj) => obj,
        // Another worker already processed and moved this object between our
        // listing and this fetch. Benign race — skip without erroring.
        Err(object_store::Error::NotFound { .. }) => return Ok(false),
        Err(e) => return Err(e.into()),
    };

    let data = obj.bytes().await?;
    let parsed = decompress_and_parse(data).await?;

    let filename = key
        .filename()
        .with_context(|| format!("Missing filename for key {key}"))?
        .to_owned();

    let match_info = match parsed {
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

    let Some(flushed) = inserters.insert(build_parsed_match(&match_info)).await else {
        bail!("Batch inserters have shut down");
    };
    let post_flush = Arc::clone(post_flush);
    let key = key.clone();
    post_flush.tasks.clone().spawn(async move {
        if flushed.await {
            counter!("ingest_worker.batch_flush.matches").increment(1);
            post_flush.total_ingested.fetch_add(1, Ordering::Relaxed);
            let new_path = Path::from(format!("{PROCESSED_PREFIX}/{filename}"));
            let _permit = post_flush.move_permits.acquire().await;
            match move_object(&*post_flush.store, &key, &new_path).await {
                Ok(()) => gauge!("ingest_worker.objs_to_ingest").decrement(1),
                Err(e) => error!("Failed to move {key} to processed/: {e}"),
            }
        } else {
            warn!("Rows of {key} were not flushed, leaving it in ingest/ for retry");
        }
        lock_inflight(&post_flush.inflight).remove(&key);
    });
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

    // Flushes only on size and at the end; a permanently failed flush stops the producers.
    let inserters = Inserters::spawn(ch_client, batch_size, None, num_inserters);

    // Fetch, decompress, parse concurrently — send results to inserters. On shutdown,
    // stop fetching and flush what was parsed.
    futures::stream::iter(match_ids)
        .take_until(common::shutdown_token().cancelled_owned())
        .map(|match_id| {
            let inserters = &inserters;
            let success_count = &success_count;
            let failure_count = &failure_count;
            async move {
                if inserters.has_failed() {
                    return;
                }
                match fetch_and_parse_match(store, &match_id).await {
                    Ok(parsed) => {
                        if inserters.insert(parsed).await.is_none() {
                            warn!("Batch inserters have shut down — stopping producers");
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

    // Flush what is left and wait for the inserters.
    inserters.shutdown().await;
    if inserters.has_failed() {
        error!("A batch flush failed permanently; re-ingestion stopped early");
    }
    info!(
        "All inserters finished: {} match_player and {} player_match_history rows inserted",
        inserters.players.flushed_rows(),
        inserters.history.flushed_rows()
    );

    let ok = success_count.load(Ordering::Relaxed);
    let fail = failure_count.load(Ordering::Relaxed);
    info!("Re-ingestion complete: {ok} parsed, {fail} failed out of {total}");

    Ok(())
}

/// Fetch a match from S3, decompress, parse, and convert to ``ClickHouse`` types.
async fn fetch_and_parse_match(
    store: &impl ObjectStore,
    match_id: &str,
) -> anyhow::Result<ParsedMatch> {
    let (_, obj) = find_match_object(store, match_id).await?;

    let data = obj.bytes().await?;
    let match_info = decompress_and_parse(data).await??;
    Ok(build_parsed_match(&match_info))
}

fn build_parsed_match(match_info: &MatchInfo) -> ParsedMatch {
    let players = build_ch_players(match_info);
    let history: Vec<PlayerMatchHistoryEntry> = match_info
        .players
        .iter()
        .filter_map(|p| {
            PlayerMatchHistoryEntry::from_info_and_player(match_info, p, calibration_matches())
        })
        .collect();
    ParsedMatch { players, history }
}

/// Build the per-player Clickhouse rows for a parsed match.
fn build_ch_players(match_info: &MatchInfo) -> Vec<ClickhouseMatchPlayer> {
    let shared = MatchShared::new(match_info);
    match_info
        .players
        .iter()
        .filter(|p| p.hero_id.is_some_and(|h| h > 0))
        .map(|p| {
            (
                &shared,
                match_info
                    .winning_team
                    .and_then(|t| p.team.map(|pt| pt == t))
                    .unwrap_or(false),
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
        Err(e @ object_store::Error::NotFound { .. }) => {
            counter!("ingest_worker.fetch_object.not_found").increment(1);
            debug!("Object {key} already moved by another worker, skipping");
            Err(e)
        }
        Err(e) => {
            counter!("ingest_worker.fetch_object.failure").increment(1);
            error!("Error getting object: {e}");
            Err(e)
        }
    }
}

/// Decompress and parse an object on a blocking thread to avoid starving the async runtime.
///
/// The outer error is a decompression (or join) failure; the inner one is a protobuf
/// parse failure, which callers treat differently.
async fn decompress_and_parse(data: Bytes) -> std::io::Result<anyhow::Result<MatchInfo>> {
    tokio::task::spawn_blocking(move || decompress(&data).map(|d| parse_match_data(&d)))
        .await
        .map_err(std::io::Error::other)?
}

/// The container is sniffed from the magic bytes rather than taken from the key's extension:
/// Valve kept the `.meta.bz2` name but switched the actual compression to zstd for newer
/// matches. Data matching neither magic is passed through as already-plain protobuf.
fn decompress(data: &[u8]) -> std::io::Result<Vec<u8>> {
    use std::io::Read;

    const ZSTD_MAGIC: [u8; 4] = [0x28, 0xb5, 0x2f, 0xfd];
    const BZIP2_MAGIC: [u8; 3] = *b"BZh";

    let mut decompressed = vec![];
    if data.starts_with(&ZSTD_MAGIC) {
        zstd::stream::read::Decoder::new(data)?.read_to_end(&mut decompressed)?;
    } else if data.starts_with(&BZIP2_MAGIC) {
        bzip2::read::BzDecoder::new(data).read_to_end(&mut decompressed)?;
    } else {
        decompressed = data.to_vec();
    }
    counter!("ingest_worker.decompress_object.success").increment(1);
    debug!("Decompressed object");
    Ok(decompressed)
}

fn parse_match_data(buf: &[u8]) -> anyhow::Result<MatchInfo> {
    let data = match CMsgMatchMetaData::decode(buf) {
        Ok(m) => m.match_details.unwrap_or_else(|| buf.to_owned()),
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
    match common::retry_with_backoff("move_object", common::Backoff::SHORT, || {
        store.rename(old_key, new_key)
    })
    .await
    {
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
