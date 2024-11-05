use prost::Message;
use std::path::Path;

use crate::models::clickhouse_match_metadata::{ClickhouseMatchInfo, ClickhouseMatchPlayer};
use arl::RateLimiter;
use async_compression::tokio::bufread::BzDecoder;
use clickhouse::{Client, Compression};
use itertools::Itertools;
use s3::creds::Credentials;
use s3::{Bucket, Region};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use valveprotos::deadlock::c_msg_match_meta_data_contents::MatchInfo;
use valveprotos::deadlock::{CMsgMatchMetaData, CMsgMatchMetaDataContents};

mod models;

static CLICKHOUSE_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("CLICKHOUSE_URL").unwrap_or("http://127.0.0.1:8123".to_string())
});
static CLICKHOUSE_USER: LazyLock<String> =
    LazyLock::new(|| std::env::var("CLICKHOUSE_USER").unwrap());
static CLICKHOUSE_PASSWORD: LazyLock<String> =
    LazyLock::new(|| std::env::var("CLICKHOUSE_PASSWORD").unwrap());
static CLICKHOUSE_DB: LazyLock<String> = LazyLock::new(|| std::env::var("CLICKHOUSE_DB").unwrap());
static S3_BUCKET_NAME: LazyLock<String> =
    LazyLock::new(|| std::env::var("S3_BUCKET_NAME").unwrap());
static S3_ACCESS_KEY_ID: LazyLock<String> =
    LazyLock::new(|| std::env::var("S3_ACCESS_KEY_ID").unwrap());
static S3_SECRET_ACCESS_KEY: LazyLock<String> =
    LazyLock::new(|| std::env::var("S3_SECRET_ACCESS_KEY").unwrap());
static S3_ENDPOINT_URL: LazyLock<String> =
    LazyLock::new(|| std::env::var("S3_ENDPOINT_URL").unwrap());
static S3_REGION: LazyLock<String> = LazyLock::new(|| std::env::var("S3_REGION").unwrap());

const MAX_OBJECTS_PER_RUN: usize = 50;

#[tokio::main]
async fn main() {
    let client = Client::default()
        .with_url(CLICKHOUSE_URL.clone())
        .with_user(CLICKHOUSE_USER.clone())
        .with_password(CLICKHOUSE_PASSWORD.clone())
        .with_database(CLICKHOUSE_DB.clone())
        .with_compression(Compression::None);
    let s3credentials = Credentials::new(
        Some(&S3_ACCESS_KEY_ID),
        Some(&S3_SECRET_ACCESS_KEY),
        None,
        None,
        None,
    )
    .unwrap();

    let bucket = Bucket::new(
        &S3_BUCKET_NAME,
        Region::Custom {
            region: S3_REGION.clone(),
            endpoint: S3_ENDPOINT_URL.clone(),
        },
        s3credentials.clone(),
    )
    .unwrap();

    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();
    ctrlc::set_handler(move || {
        r.store(false, Ordering::SeqCst);
    })
    .expect("Error setting Ctrl-C handler");

    let limiter = RateLimiter::new(1, Duration::from_secs(30));
    limiter.wait().await;
    let s3limiter = RateLimiter::new(1, Duration::from_millis(100));
    while running.load(Ordering::SeqCst) {
        println!("Waiting for rate limiter");
        let start = std::time::Instant::now();

        println!("Fetching metadata files");
        s3limiter.wait().await;
        let objects = bucket
            .list("ingest/metadata".parse().unwrap(), None)
            .await
            .unwrap();
        let objects = objects
            .iter()
            .flat_map(|dir| dir.contents.clone())
            .filter(|obj| obj.key.ends_with(".meta") || obj.key.ends_with(".meta.bz2"))
            .sorted_by_key(|obj| obj.key.clone())
            .rev()
            .take(MAX_OBJECTS_PER_RUN)
            .collect::<Vec<_>>();
        if objects.is_empty() {
            println!("No files to fetch");
            limiter.wait().await;
            continue;
        }
        println!("Fetched {} files", objects.len());
        let mut match_infos = vec![];
        s3limiter.wait().await;
        let data = futures::future::join_all(
            objects
                .iter()
                .map(|obj| bucket.get_object(&obj.key))
                .collect::<Vec<_>>(),
        )
        .await
        .into_iter()
        .filter_map(|m| m.ok())
        .collect::<Vec<_>>();
        let data = futures::future::join_all(
            data.iter()
                .zip(objects.iter())
                .map(|(file, obj)| async move {
                    let data = file.bytes();
                    let data: &[u8] = data.as_ref();
                    if obj.key.ends_with(".bz2") {
                        let mut decompressed = vec![];
                        BzDecoder::new(data)
                            .read_to_end(&mut decompressed)
                            .await
                            .unwrap();
                        decompressed
                    } else {
                        data.to_vec()
                    }
                })
                .collect::<Vec<_>>(),
        )
        .await;
        for (obj, data) in objects.iter().zip(data.iter()) {
            println!("Fetching file: {}", obj.key);
            let match_metadata = match CMsgMatchMetaData::decode(data.as_slice()) {
                Ok(m) => m.match_details.unwrap_or(data.clone()),
                Err(_) => data.clone(),
            };
            let match_info = match CMsgMatchMetaDataContents::decode(match_metadata.as_slice())
                .ok()
                .and_then(|m| m.match_info)
            {
                Some(m) => m,
                None => match MatchInfo::decode(match_metadata.as_slice()) {
                    Ok(m) => m,
                    Err(e) => {
                        println!("Error decoding match info: {:?}", e);
                        return;
                    }
                },
            };
            match_infos.push(match_info);
        }
        let num_files = match_infos.len();
        if num_files == 0 {
            println!("No files to parse");
            continue;
        }
        println!("Inserting {} files", num_files);
        insert_matches(client.clone(), match_infos).await.unwrap();
        let mut handles = vec![];
        for obj in objects.iter() {
            let bucket = bucket.clone();
            let obj = obj.clone();
            let handle = tokio::spawn(async move {
                bucket
                    .copy_object_internal(
                        &obj.key,
                        &format!(
                            "processed/metadata/{}",
                            Path::new(&obj.key).file_name().unwrap().to_str().unwrap()
                        ),
                    )
                    .await
                    .unwrap();
                bucket.delete_object(&obj.key).await.unwrap();
            });
            handles.push(handle);
        }
        futures::future::join_all(handles).await;
        println!("Inserted {} files", num_files);
        println!("Elapsed: {:?}", start.elapsed());
        println!(
            "Seconds per file: {:?}",
            start.elapsed().as_secs_f64() / num_files as f64
        );
    }
}

async fn insert_matches(client: Client, matches: Vec<MatchInfo>) -> clickhouse::error::Result<()> {
    let mut match_info_insert = client.insert("match_info")?;
    let mut match_player_insert = client.insert("match_player")?;
    for match_info in matches {
        let ch_match_metadata: ClickhouseMatchInfo = match_info.clone().into();
        match_info_insert.write(&ch_match_metadata).await?;

        let ch_players = match_info
            .players
            .into_iter()
            .map::<ClickhouseMatchPlayer, _>(|p| (match_info.match_id.unwrap(), p).into());
        for player in ch_players {
            match_player_insert.write(&player).await?;
        }
    }
    match_info_insert.end().await?;
    match_player_insert.end().await?;
    Ok(())
}
