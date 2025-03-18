use prost::Message;
use std::collections::HashSet;
use std::path::Path;

use crate::models::clickhouse_match_metadata::{ClickhouseMatchInfo, ClickhouseMatchPlayer};
use crate::models::enums::MatchOutcome;
use arl::RateLimiter;
use async_compression::tokio::bufread::BzDecoder;
use clickhouse::{Client, Compression};
use s3::creds::Credentials;
use s3::{Bucket, Region};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::time::{sleep, timeout};
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
static MAX_OBJECTS_PER_RUN: LazyLock<usize> = LazyLock::new(|| {
    std::env::var("MAX_OBJECTS_PER_RUN")
        .unwrap_or("20".to_string())
        .parse()
        .unwrap_or(20)
});
static REQUEST_TIMEOUT_S: LazyLock<u64> = LazyLock::new(|| {
    std::env::var("REQUEST_TIMEOUT_S")
        .unwrap_or("10".to_string())
        .parse()
        .unwrap_or(10)
});

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

    let limiter = RateLimiter::new(1, Duration::from_secs(60));
    limiter.wait().await;
    let s3limiter = RateLimiter::new(1, Duration::from_millis(100));
    let mut missing_objects = HashSet::new();
    while running.load(Ordering::SeqCst) {
        let start = std::time::Instant::now();

        let object_keys = if missing_objects.len() < *MAX_OBJECTS_PER_RUN {
            println!("Listing objects");
            s3limiter.wait().await;
            let objects = match bucket.list("ingest/metadata".parse().unwrap(), None).await {
                Ok(objects) => objects,
                Err(e) => {
                    println!("Error fetching objects: {:?}", e);
                    sleep(Duration::from_secs(10)).await;
                    continue;
                }
            };
            objects
                .iter()
                .flat_map(|dir| dir.contents.clone())
                .filter(|obj| {
                    obj.key.ends_with(".meta")
                        || obj.key.ends_with(".meta.bz2")
                        || obj.key.ends_with(".meta_hltv.bz2")
                })
                .map(|o| o.key.clone())
                .collect::<HashSet<_>>()
        } else {
            missing_objects.clone()
        };
        missing_objects.extend(object_keys.clone());
        let object_keys = missing_objects
            .iter()
            .take(*MAX_OBJECTS_PER_RUN)
            .cloned()
            .collect::<HashSet<_>>();
        missing_objects.retain(|o| !object_keys.contains(o));
        if object_keys.is_empty() {
            println!("No files to fetch, waiting ...");
            limiter.wait().await;
            continue;
        }
        println!("Fetched {} files", object_keys.len());
        let mut match_infos = vec![];
        s3limiter.wait().await;
        let data = futures::future::join_all(
            object_keys
                .iter()
                .map(|obj| bucket.get_object(obj.clone()))
                .collect::<Vec<_>>(),
        )
        .await
        .into_iter()
        .filter_map(|m| m.ok())
        .collect::<Vec<_>>();
        let data = futures::future::join_all(
            data.iter()
                .zip(object_keys.iter())
                .map(|(file, obj)| async move {
                    let data = file.bytes();
                    let data: &[u8] = data.as_ref();
                    if obj.ends_with(".bz2") {
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
        for (obj, data) in object_keys.iter().zip(data.iter()) {
            println!("Fetching file: {}", obj);
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
        insert_matches(client.clone(), &match_infos).await.unwrap();
        let mut handles = vec![];
        for obj in object_keys.iter() {
            let bucket = bucket.clone();
            let obj = obj.clone();
            let handle = tokio::spawn(async move {
                let mut retries = 0;
                loop {
                    let copy_object = timeout(
                        Duration::from_secs(*REQUEST_TIMEOUT_S),
                        bucket.copy_object_internal(
                            &obj,
                            &format!(
                                "processed/metadata/{}",
                                Path::new(&obj).file_name().unwrap().to_str().unwrap()
                            ),
                        ),
                    )
                    .await;
                    if let Err(_) | Ok(Err(_)) = copy_object {
                        println!("Error copying object: {}. Retrying in a second", &obj);
                        sleep(Duration::from_secs(1)).await;
                        retries += 1;
                        if retries > 3 {
                            println!("Too many retries. Skipping file");
                            break;
                        }
                        continue;
                    }
                    if let Err(_) | Ok(Err(_)) = timeout(
                        Duration::from_secs(*REQUEST_TIMEOUT_S),
                        bucket.delete_object(&obj),
                    )
                    .await
                    {
                        println!("Error deleting object: {}. Retrying in a second", &obj);
                        sleep(Duration::from_secs(1)).await;
                        retries += 1;
                        if retries > 3 {
                            println!("Too many retries. Skipping file");
                            break;
                        }
                        continue;
                    }
                    break;
                }
            });
            handles.push(handle);
        }
        futures::future::join_all(handles).await;
        send_events(
            match_infos
                .iter()
                .filter_map(|m| m.match_id)
                .collect::<Vec<_>>(),
        )
        .await;
        println!("Inserted {} files", num_files);
        println!("Elapsed: {:?}", start.elapsed());
        println!(
            "Seconds per file: {:?}",
            start.elapsed().as_secs_f64() / num_files as f64
        );
    }
}

async fn insert_matches(client: Client, matches: &[MatchInfo]) -> clickhouse::error::Result<()> {
    let mut match_info_insert = client.insert("match_info")?;
    let mut match_player_insert = client.insert("match_player")?;
    for match_info in matches.iter() {
        let ch_match_metadata: ClickhouseMatchInfo = match_info.clone().into();
        if ch_match_metadata.match_outcome == MatchOutcome::Error {
            println!("Match outcome is error, skipping match");
            continue;
        }
        match_info_insert.write(&ch_match_metadata).await?;

        let ch_players = match_info
            .players
            .clone()
            .into_iter()
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
        for player in ch_players {
            match_player_insert.write(&player).await?;
        }
    }
    match_info_insert.end().await?;
    match_player_insert.end().await?;
    Ok(())
}

async fn send_events(match_ids: Vec<u64>) {
    for match_id in match_ids {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build();
        if let Ok(http_client) = http_client {
            let res = http_client
                .post(format!(
                    "https://api.deadlock-api.com/v1/matches/{}/ingest",
                    match_id
                ))
                .header(
                    "X-Api-Key",
                    std::env::var("INTERNAL_DEADLOCK_API_KEY").unwrap(),
                )
                .send()
                .await;
            if let Err(e) = res {
                println!("Error sending match ingest event: {:?}", e);
            }
        }
    }
}
