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

use core::time::Duration;

use anyhow::bail;
use async_compression::tokio::bufread::BzDecoder;
use futures::StreamExt;
use metrics::{counter, gauge};
use object_store::path::Path;
use object_store::{GetResult, ObjectStore, ObjectStoreExt};
use prost::Message;
use tokio::io::AsyncReadExt;
use tokio::time::timeout;
use tracing::{debug, error, info, instrument};
use valveprotos::deadlock::c_msg_match_meta_data_contents::{EMatchOutcome, MatchInfo};
use valveprotos::deadlock::{
    CMsgMatchMetaData, CMsgMatchMetaDataContents, CMsgMatchMetaDataContentsPatched,
};

use crate::models::clickhouse_match_metadata::{ClickhouseMatchInfo, ClickhouseMatchPlayer};
use crate::models::clickhouse_player_match_history::PlayerMatchHistoryEntry;

mod models;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let ch_client = common::get_ch_client()?;
    let store = common::get_store()?;
    let mut interval = tokio::time::interval(Duration::from_secs(10));

    loop {
        interval.tick().await;
        let objs_to_ingest = match list_ingest_objects(&store).await {
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
                    ingest_object(&store, &ch_client, key),
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
        bzip_decompress(&data).await?
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

async fn bzip_decompress(data: &[u8]) -> std::io::Result<Vec<u8>> {
    let mut decompressed = vec![];
    match BzDecoder::new(data).read_to_end(&mut decompressed).await {
        Ok(_) => {
            counter!("ingest_worker.decompress_object.success").increment(1);
            debug!("Decompressed object");
            Ok(decompressed)
        }
        Err(e) => {
            counter!("ingest_worker.decompress_object.failure").increment(1);
            error!("Error decompressing object: {e}");
            Err(e)
        }
    }
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
