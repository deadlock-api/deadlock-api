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

use cached::UnboundCache;
use cached::proc_macro::cached;
use futures::StreamExt;
use metrics::{counter, gauge};
use models::MatchSalts;
use object_store::path::Path;
use object_store::{ObjectStore, ObjectStoreExt, PutPayload};
use tokio::time::sleep;
use tokio_util::bytes::Bytes;
use tracing::{debug, error, info, instrument};

mod models;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let ch_client = common::get_ch_client()?;
    let store = common::get_store()?;
    let cache_store = common::get_cache_store()?;

    let mut failed = HashSet::new();
    let mut uploaded = HashSet::new();

    loop {
        info!("Fetching match ids to download");
        let query = "
WITH t_salts AS (SELECT match_id,
                        cluster_id,
                        metadata_salt
                 FROM match_salts FINAL
                 WHERE created_at > now() - INTERVAL 2 DAY
                 ORDER BY created_at),
     t_matches AS (SELECT match_id
                   FROM match_info
                   WHERE match_id IN (SELECT match_id FROM t_salts))
SELECT match_id, cluster_id, metadata_salt
FROM t_salts
WHERE match_id NOT IN t_matches
        ";
        let match_ids_to_fetch = ch_client
            .query(query)
            .fetch_all::<MatchSalts>()
            .await?
            .into_iter()
            .filter(|salts| !failed.contains(&salts.match_id))
            .filter(|salts| !uploaded.contains(&salts.match_id))
            .filter(|salts| salts.cluster_id.is_some() && salts.metadata_salt.is_some())
            .collect::<Vec<_>>();

        gauge!("matchdata_downloader.matches_to_download").set(match_ids_to_fetch.len() as f64);

        if match_ids_to_fetch.is_empty() {
            info!("No matches to download, sleeping for 10s");
            sleep(Duration::from_secs(10)).await;
            continue;
        }

        let results = futures::stream::iter(match_ids_to_fetch.iter())
            .map(|salts| async {
                match download_match(&store, &cache_store, salts).await {
                    Ok(()) => {
                        gauge!("matchdata_downloader.matches_to_download").decrement(1);
                        Ok(())
                    }
                    Err(e) => {
                        error!("Failed to download match: {e}");
                        Err(e)
                    }
                }
            })
            .buffer_unordered(10)
            .collect::<Vec<_>>()
            .await;
        for (salts, result) in match_ids_to_fetch.iter().zip(results) {
            if result.is_ok() {
                uploaded.insert(salts.match_id)
            } else {
                failed.insert(salts.match_id)
            };
        }
    }
}

#[instrument(skip(bucket, cache_bucket))]
async fn download_match(
    bucket: &impl ObjectStore,
    cache_bucket: &impl ObjectStore,
    salts: &MatchSalts,
) -> anyhow::Result<()> {
    let key = Path::from(format!("/ingest/metadata/{}.meta.bz2", salts.match_id));
    let cache_key = Path::from(format!("{}.meta.bz2", salts.match_id));
    let outdated_hltv_meta_key = Path::from(format!(
        "/processed/metadata/{}.meta_hltv.bz2",
        salts.match_id
    ));

    // Check if metadata already exists
    if key_exists(bucket, &key).await {
        return Ok(());
    }

    // Download metadata
    let bytes = fetch_metadata(salts).await?;

    // Upload to S3
    upload_object(bucket, &key, bytes.clone()).await?;
    upload_object(cache_bucket, &cache_key, bytes).await?;

    // Delete outdated HLTV metadata
    delete_object(bucket, &outdated_hltv_meta_key).await?;
    delete_object(cache_bucket, &outdated_hltv_meta_key).await?;

    info!("Match downloaded");
    Ok(())
}

async fn fetch_metadata(salts: &MatchSalts) -> reqwest::Result<Bytes> {
    let metadata_url = format!(
        "http://replay{}.valve.net/1422450/{}_{}.meta.bz2",
        salts.cluster_id.unwrap(),
        salts.match_id,
        salts.metadata_salt.unwrap()
    );
    match reqwest::get(&metadata_url)
        .await
        .and_then(reqwest::Response::error_for_status)?
        .bytes()
        .await
    {
        Ok(bytes) => {
            counter!("matchdata_downloader.fetch_metadata.successful").increment(1);
            debug!("Metadata fetched");
            Ok(bytes)
        }
        Err(e) => {
            counter!("matchdata_downloader.fetch_metadata.failure").increment(1);
            error!("Failed to fetch metadata from {metadata_url}: {e}");
            Err(e)
        }
    }
}

#[instrument(skip(store, bytes))]
async fn upload_object(
    store: &impl ObjectStore,
    key: &Path,
    bytes: Bytes,
) -> object_store::Result<()> {
    let payload = PutPayload::from_bytes(bytes);
    match store.put(key, payload).await {
        Ok(_) => {
            counter!("matchdata_downloader.upload_object.successful").increment(1);
            debug!("Uploaded object");
            Ok(())
        }
        Err(e) => {
            counter!("matchdata_downloader.upload_object.failure").increment(1);
            error!("Failed to upload object: {e}");
            Err(e)
        }
    }
}

#[instrument(skip(store))]
async fn delete_object(store: &impl ObjectStore, key: &Path) -> object_store::Result<()> {
    if !key_exists(store, key).await {
        return Ok(());
    }
    match store.delete(key).await {
        Ok(()) => {
            counter!("matchdata_downloader.delete_object.successful").increment(1);
            debug!("Deleted object");
            Ok(())
        }
        Err(e) => {
            counter!("matchdata_downloader.delete_object.failure").increment(1);
            error!("Failed to delete object: {e}");
            Err(e)
        }
    }
}

#[cached(
    ty = "UnboundCache<String, bool>",
    create = "{ UnboundCache::new() }",
    convert = r#"{ format!("{file_path}") }"#
)]
#[instrument(skip(store))]
async fn key_exists(store: &impl ObjectStore, file_path: &Path) -> bool {
    debug!("Checking if key exists");
    store.head(file_path).await.is_ok()
}
