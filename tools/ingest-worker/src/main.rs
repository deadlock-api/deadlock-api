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

use anyhow::bail;
use bytes::Bytes;
use clap::Parser;
use futures::StreamExt;
use metrics::{counter, gauge};
use object_store::path::Path;
use object_store::{GetResult, ObjectStore, ObjectStoreExt};
use prost::Message;
use tokio::sync::mpsc;
use tokio::time::timeout;
use tracing::{debug, error, info, instrument};
use valveprotos::deadlock::c_msg_match_meta_data_contents::{EMatchOutcome, MatchInfo};
use valveprotos::deadlock::{
    CMsgMatchMetaData, CMsgMatchMetaDataContents, CMsgMatchMetaDataContentsPatched,
};

use crate::models::clickhouse_match_metadata::{ClickhouseMatchInfo, ClickhouseMatchPlayer};
use crate::models::clickhouse_player_match_history::PlayerMatchHistoryEntry;

mod models;

#[derive(Parser)]
#[command(about = "Deadlock match metadata ingest worker")]
struct Cli {
    /// Path to a file containing match IDs (one per line) to re-ingest
    /// from the processed/failed S3 folders.
    #[arg(long)]
    reingest_file: Option<String>,

    /// Number of concurrent re-ingestion tasks (default: 50)
    #[arg(long, default_value_t = 50)]
    reingest_parallelism: usize,

    /// Number of matches to batch per ``ClickHouse`` insert during re-ingestion (default: 500)
    #[arg(long, default_value_t = 500)]
    reingest_batch_size: usize,
}

/// Parsed match data ready for ``ClickHouse`` insertion.
struct ParsedMatch {
    match_info: ClickhouseMatchInfo,
    players: Vec<ClickhouseMatchPlayer>,
    history: Vec<PlayerMatchHistoryEntry>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let cli = Cli::parse();

    let ch_client = common::get_ch_client()?;
    let store = common::get_store()?;

    if let Some(ref file_path) = cli.reingest_file {
        return reingest_from_file(
            &store,
            &ch_client,
            file_path,
            cli.reingest_parallelism,
            cli.reingest_batch_size,
        )
        .await;
    }

    run_ingest_loop(&store, &ch_client).await
}

async fn run_ingest_loop(
    store: &impl ObjectStore,
    ch_client: &clickhouse::Client,
) -> anyhow::Result<()> {
    let mut interval = tokio::time::interval(Duration::from_secs(10));

    loop {
        interval.tick().await;
        let objs_to_ingest = match list_ingest_objects(store).await {
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

        futures::stream::iter(&objs_to_ingest)
            .map(|key| async {
                match timeout(
                    Duration::from_secs(30),
                    ingest_object(store, ch_client, key),
                )
                .await
                {
                    Ok(Ok(key)) => {
                        counter!("ingest_worker.ingest_object.success").increment(1);
                        info!("Ingested object: {key}");
                        gauge!("ingest_worker.objs_to_ingest").decrement(1);
                    }
                    Ok(Err(e)) => {
                        counter!("ingest_worker.ingest_object.failure").increment(1);
                        error!("Error ingesting object: {e}");
                    }
                    Err(_) => {
                        counter!("ingest_worker.ingest_object.timeout").increment(1);
                        error!("Ingest object timed out");
                    }
                }
            })
            .buffer_unordered(10)
            .collect::<Vec<_>>()
            .await;
        info!("Ingested all objects");
    }
}

/// Known file extensions for match metadata files.
const MATCH_EXTENSIONS: &[&str] = &[".meta", ".meta.bz2", ".meta_hltv.bz2"];

async fn reingest_from_file(
    store: &impl ObjectStore,
    ch_client: &clickhouse::Client,
    file_path: &str,
    parallelism: usize,
    batch_size: usize,
) -> anyhow::Result<()> {
    let content = tokio::fs::read_to_string(file_path).await?;
    let match_ids: Vec<String> = content
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();

    let total = match_ids.len();
    info!("Re-ingesting {total} matches with parallelism {parallelism}, batch size {batch_size}");

    let success_count = AtomicUsize::new(0);
    let failure_count = AtomicUsize::new(0);

    let (tx, rx) = mpsc::channel::<ParsedMatch>(parallelism * 2);

    // Spawn the batch inserter task
    let ch_client_owned = ch_client.clone();
    let insert_handle =
        tokio::spawn(async move { batch_inserter(ch_client_owned, rx, batch_size).await });

    // Fetch, decompress, parse concurrently — send results to inserter
    futures::stream::iter(match_ids)
        .map(|match_id| {
            let tx = tx.clone();
            let success_count = &success_count;
            let failure_count = &failure_count;
            async move {
                match fetch_and_parse_match(store, &match_id).await {
                    Ok(parsed) => {
                        if tx.send(parsed).await.is_err() {
                            error!("Insert channel closed prematurely");
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

    // Drop sender to signal inserter to flush and finish
    drop(tx);

    // Wait for inserter to complete
    match insert_handle.await {
        Ok(Ok(inserted)) => info!("Inserter finished: {inserted} matches inserted"),
        Ok(Err(e)) => error!("Inserter error: {e}"),
        Err(e) => error!("Inserter task panicked: {e}"),
    }

    let ok = success_count.load(Ordering::Relaxed);
    let fail = failure_count.load(Ordering::Relaxed);
    info!("Re-ingestion complete: {ok} parsed, {fail} failed out of {total}");

    Ok(())
}

/// Batch-inserts parsed matches from the channel into ``ClickHouse``.
async fn batch_inserter(
    client: clickhouse::Client,
    mut rx: mpsc::Receiver<ParsedMatch>,
    batch_size: usize,
) -> anyhow::Result<usize> {
    let mut total_inserted: usize = 0;
    let mut batch_count: usize = 0;

    let mut match_info_insert = client.insert::<ClickhouseMatchInfo>("match_info").await?;
    let mut match_player_insert = client
        .insert::<ClickhouseMatchPlayer>("match_player")
        .await?;
    let mut history_insert = client
        .insert::<PlayerMatchHistoryEntry>("player_match_history")
        .await?;

    while let Some(parsed) = rx.recv().await {
        match_info_insert.write(&parsed.match_info).await?;
        for player in &parsed.players {
            match_player_insert.write(player).await?;
        }
        for entry in &parsed.history {
            history_insert.write(entry).await?;
        }

        batch_count += 1;
        if batch_count >= batch_size {
            match_info_insert.end().await?;
            match_player_insert.end().await?;
            history_insert.end().await?;

            total_inserted += batch_count;
            info!("Flushed batch of {batch_count} matches ({total_inserted} total)");

            match_info_insert = client.insert::<ClickhouseMatchInfo>("match_info").await?;
            match_player_insert = client
                .insert::<ClickhouseMatchPlayer>("match_player")
                .await?;
            history_insert = client
                .insert::<PlayerMatchHistoryEntry>("player_match_history")
                .await?;
            batch_count = 0;
        }
    }

    // Flush remaining
    if batch_count > 0 {
        match_info_insert.end().await?;
        match_player_insert.end().await?;
        history_insert.end().await?;
        total_inserted += batch_count;
        info!("Flushed final batch of {batch_count} matches ({total_inserted} total)");
    }

    Ok(total_inserted)
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

    let ch_match_info: ClickhouseMatchInfo = match_info.clone().into();
    let ch_players: Vec<ClickhouseMatchPlayer> = match_info
        .players
        .iter()
        .cloned()
        .map(|p| {
            (
                match_info.match_id.unwrap(),
                match_info
                    .winning_team
                    .and_then(|t| p.team.map(|pt| pt == t))
                    .unwrap(),
                p,
            )
                .into()
        })
        .collect();
    let history: Vec<PlayerMatchHistoryEntry> = match_info
        .players
        .iter()
        .filter_map(|p| PlayerMatchHistoryEntry::from_info_and_player(&match_info, p))
        .collect();

    Ok(ParsedMatch {
        match_info: ch_match_info,
        players: ch_players,
        history,
    })
}

/// Try to find a match file in processed/ first, then failed/, across all known extensions.
/// Fires all lookups concurrently for lower latency.
async fn find_match_object(
    store: &impl ObjectStore,
    match_id: &str,
) -> anyhow::Result<(Path, GetResult)> {
    let mut paths = Vec::with_capacity(6);
    for folder in &["processed/metadata", "failed/metadata"] {
        for ext in MATCH_EXTENSIONS {
            paths.push(Path::from(format!("{folder}/{match_id}{ext}")));
        }
    }

    let results = futures::future::join_all(paths.iter().map(|p| store.get(p))).await;

    for (path, result) in paths.into_iter().zip(results) {
        if let Ok(result) = result {
            debug!("Found match {match_id} at {path}");
            return Ok((path, result));
        }
    }
    bail!("Match {match_id} not found in processed or failed folders")
}

#[instrument(skip(store, ch_client))]
async fn ingest_object(
    store: &impl ObjectStore,
    ch_client: &clickhouse::Client,
    key: &Path,
) -> anyhow::Result<String> {
    // Fetch Data
    let obj = get_object(store, key).await?;

    // Decompress Data
    let data = obj.bytes().await?;
    let data = if key
        .extension()
        .is_some_and(|f| f.eq_ignore_ascii_case("bz2"))
    {
        bzip_decompress(data).await?
    } else {
        data.to_vec()
    };

    // Ingest to Clickhouse
    let match_info = parse_match_data(&data);
    let match_info = match match_info {
        Ok(m)
            if m.match_outcome
                .is_some_and(|m| m == EMatchOutcome::KEOutcomeError as i32) =>
        {
            let new_path = Path::from(format!("failed/metadata/{}", key.filename().unwrap()));
            move_object(store, key, &new_path).await?;
            bail!(
                "[{:?}] Match outcome is error moved to fail folder",
                m.match_id
            );
        }
        Err(e) => {
            let new_path = Path::from(format!("failed/metadata/{}", key.filename().unwrap()));
            move_object(store, key, &new_path).await?;
            bail!(
                "[{:?}] Error parsing match data: {e}",
                key.filename().unwrap()
            );
        }
        Ok(m) => m,
    };
    match insert_match(ch_client, &match_info).await {
        Ok(()) => {
            counter!("ingest_worker.insert_match.success").increment(1);
            debug!("Inserted match data");
        }
        Err(e) => {
            counter!("ingest_worker.insert_match.failure").increment(1);
            bail!("Error inserting match data: {e}");
        }
    }

    // Move Object to processed folder
    let new_path = Path::from(format!("processed/metadata/{}", key.filename().unwrap()));
    move_object(store, key, &new_path).await?;
    Ok(key.to_string())
}

async fn list_ingest_objects(store: &impl ObjectStore) -> object_store::Result<Vec<Path>> {
    let exts = [".meta", ".meta.bz2", ".meta_hltv.bz2"];
    let p = Path::from("ingest/metadata/");

    let mut metas = vec![];
    let mut list_stream = store.list(Some(&p));
    while let Some(meta) = list_stream.next().await.transpose()? {
        debug!("Found object: {:?}", meta.location);
        let filename = meta.location.filename();
        if filename.is_some_and(|name| exts.iter().any(|a| name.ends_with(a))) {
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
    .expect("bzip2 decompress task panicked")
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

async fn insert_match(client: &clickhouse::Client, match_info: &MatchInfo) -> anyhow::Result<()> {
    let ch_match_metadata: ClickhouseMatchInfo = match_info.clone().into();
    let ch_players = match_info
        .players
        .iter()
        .cloned()
        .map::<ClickhouseMatchPlayer, _>(|p| {
            (
                match_info.match_id.unwrap(),
                match_info
                    .winning_team
                    .and_then(|t| p.team.map(|pt| pt == t))
                    .unwrap(),
                p,
            )
                .into()
        });

    let mut match_info_insert = client.insert::<ClickhouseMatchInfo>("match_info").await?;
    let mut match_player_insert = client
        .insert::<ClickhouseMatchPlayer>("match_player")
        .await?;
    match_info_insert.write(&ch_match_metadata).await?;
    for player in ch_players {
        match_player_insert.write(&player).await?;
    }
    match_info_insert.end().await?;
    match_player_insert.end().await?;

    let mut player_match_history_insert = client
        .insert::<PlayerMatchHistoryEntry>("player_match_history")
        .await?;
    for p in &match_info.players {
        if let Some(entry) = PlayerMatchHistoryEntry::from_info_and_player(match_info, p) {
            player_match_history_insert.write(&entry).await?;
        }
    }
    player_match_history_insert.end().await?;
    Ok(())
}

async fn move_object(
    store: &impl ObjectStore,
    old_key: &Path,
    new_key: &Path,
) -> object_store::Result<()> {
    if old_key == new_key {
        return Ok(());
    }
    match tryhard::retry_fn(|| store.rename(old_key, new_key))
        .retries(5)
        .exponential_backoff(Duration::from_millis(10))
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
