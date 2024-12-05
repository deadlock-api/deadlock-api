use std::{collections::HashSet, env, fs};
use std::{num::NonZeroUsize, sync::Arc};
use std::{path::PathBuf, thread::sleep, time::Duration};

use anyhow::Context;
use async_compression::tokio::write::BzEncoder;
use dashmap::DashMap;
use jiff::{Timestamp, ToSpan};
use lru::LruCache;
use metrics::gauge;
use object_store::{aws::AmazonS3Builder, ObjectStore};
use prost::Message;
use reqwest::Url;
use serde_json::json;
use tokio::io::AsyncWriteExt as _;
use tracing::{error, info};
use valveprotos::deadlock::CMsgMatchMetaData;

use crate::cmd::{
    download_single_hltv::download_single_hltv_meta,
    run_spectate_bot::{SpectatedMatchInfo, SpectatedMatchType},
};

pub async fn run(spectate_server_url: String) -> anyhow::Result<()> {
    let spec_client = reqwest::blocking::Client::new();
    let base_url =
        Url::parse(&spectate_server_url).context("Parsing base url for spectate server")?;

    let currently_downloading: Arc<DashMap<u64, bool>> = Arc::new(DashMap::new());

    let mut already_downloaded: LruCache<u64, bool> =
        LruCache::new(NonZeroUsize::new(100).unwrap());

    let root_path = PathBuf::from("./localstore");
    fs::create_dir_all(&root_path)?;

    let aws_store = AmazonS3Builder::new()
        .with_region(env::var("HLTV_S3_AWS_REGION")?)
        .with_bucket_name(env::var("HLTV_S3_AWS_BUCKET")?)
        .with_access_key_id(env::var("HLTV_S3_AWS_ACCESS_KEY_ID")?)
        .with_secret_access_key(env::var("HLTV_S3_AWS_SECRET_ACCESS_KEY")?)
        .with_endpoint(env::var("HLTV_S3_AWS_ENDPOINT")?)
        .with_allow_http(true)
        .build()?;
    let store = Arc::new(aws_store);

    loop {
        let matches_res = match spec_client.get(base_url.join("matches").unwrap()).send() {
            Ok(matches_res) => matches_res,
            Err(e) => {
                error!("Failed to get matches to check against: {:#?}", e);
                sleep(Duration::from_secs(5));
                continue;
            }
        };
        let matches = matches_res.json::<Vec<SpectatedMatchInfo>>()?;
        let spectated_match_ids: HashSet<u64> = matches.iter().map(|x| x.match_id).collect();

        let current_count = currently_downloading.len();

        let total_available_matches = matches.len();
        let chosen_match = matches
            .into_iter()
            .filter(|x| !already_downloaded.contains(&x.match_id))
            .filter(|x| !currently_downloading.contains_key(&x.match_id))
            .filter(|x| {
                if let Some(started) = x.started_at {
                    return started < Timestamp::now().saturating_sub(15.minutes());
                }
                x.updated_at < Timestamp::now().saturating_sub(1.minutes())
            })
            .min_by_key(|x| x.match_id);

        let scraping_not_spectated = currently_downloading
            .iter()
            .filter(|x| !spectated_match_ids.contains(x.key()))
            .count();

        gauge!("hltv.matches_with_spectators").set(total_available_matches as f64);
        gauge!("hltv.scraping_concurrently").set(current_count as f64);
        gauge!("hltv.scraping_not_marked_spectated").set(scraping_not_spectated as f64);

        let Some(smi) = chosen_match else {
            info!("no current match to watch... {current_count} in progress ({total_available_matches} total possible to spectate)");
            sleep(Duration::from_millis(10000));
            continue;
        };

        already_downloaded.put(smi.match_id, true);

        let label = smi.match_type.label();
        let match_id = smi.match_id;

        info!("[{label} {match_id}] Starting to download match");
        download_task(
            base_url.clone(),
            store.clone(),
            currently_downloading.clone(),
            smi,
        );

        sleep(Duration::from_millis(200));
    }
}

fn download_task(
    base_url: Url,
    store: Arc<impl ObjectStore>,
    currently_downloading: Arc<DashMap<u64, bool>>,
    smi: SpectatedMatchInfo,
) {
    currently_downloading.insert(smi.match_id, true);
    tokio::task::spawn(async move {
        let label = smi.match_type.label();
        let match_id = smi.match_id;
        let match_metadata = match download_single_hltv_meta(smi.match_type.clone(), match_id).await
        {
            Ok(x) => x,
            Err(e) => {
                error!("[{label} {match_id}] Got error: {:?}", e);
                None
            }
        };
        let did_finish_match = match_metadata.is_some();

        let c = reqwest::blocking::Client::new();
        if let Err(e) = c
            .post(base_url.join("match-ended").unwrap())
            .json(&json!({"match_id": match_id}))
            .send()
        {
            error!("[{label} {match_id}] Error marking match ended: {:?}", e)
        }
        // info!("[{}] Finished and marked match as ended", match_id);
        currently_downloading.remove(&smi.match_id);

        if did_finish_match {
            let match_metadata = match_metadata.unwrap();
            if let Err(e) =
                push_meta_to_object_store(store, &match_metadata, smi.match_type, match_id).await
            {
                error!("[{label} {match_id}] Got error writing meta: {:?}", e);
            };
        }
    });
}

async fn push_meta_to_object_store(
    store: Arc<impl ObjectStore>,
    match_metadata: &CMsgMatchMetaData,
    match_type: SpectatedMatchType,
    match_id: u64,
) -> anyhow::Result<()> {
    let label = match_type.label();
    let mut buf_meta = Vec::new();

    match_metadata.encode(&mut buf_meta)?;

    let mut output = Vec::new();
    let mut compressor = BzEncoder::with_quality(&mut output, async_compression::Level::Best);

    compressor
        .write_all(&buf_meta)
        .await
        .context("Error writing buf write")?;

    compressor
        .flush()
        .await
        .context("Error finishing buf write")?;

    let p_str = format!("/ingest/metadata/{match_id}.meta_hltv.bz2");
    let p = object_store::path::Path::from(p_str.clone());
    store.put(&p, output.into()).await?;

    info!("[{label} {match_id}] Wrote meta to {p_str}!");
    Ok(())
}
