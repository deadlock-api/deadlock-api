use crate::models::clickhouse_match_metadata::{ClickhouseMatchInfo, ClickhouseMatchPlayer};
use crate::models::match_metadata::MatchMetadata;
use arl::RateLimiter;
use clickhouse::{Client, Compression};
use s3::creds::Credentials;
use s3::{Bucket, Region};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

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

const MAX_OBJECTS_PER_RUN: usize = 1000;

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

    let limiter = RateLimiter::new(1, Duration::from_secs(10 * 60));
    limiter.wait().await;
    let s3limiter = RateLimiter::new(2, Duration::from_secs(1));
    while running.load(Ordering::SeqCst) {
        println!("Waiting for rate limiter");
        limiter.wait().await;
        let start = std::time::Instant::now();

        println!("Fetching metadata files");
        let objects = bucket
            .list("ingest/metadata".parse().unwrap(), None)
            .await
            .unwrap();
        let objects = objects
            .iter()
            .flat_map(|dir| dir.contents.clone())
            .filter(|obj| obj.key.ends_with(".json"))
            .take(MAX_OBJECTS_PER_RUN)
            .collect::<Vec<_>>();
        let mut json_files = vec![];
        for obj in objects.iter() {
            println!("Fetching file: {}", obj.key);
            s3limiter.wait().await;
            let file = bucket.get_object(&obj.key).await.unwrap();
            let metadata: MatchMetadata = serde_json::from_slice(file.bytes()).unwrap();
            json_files.push(metadata);
        }
        let num_files = json_files.len();
        if num_files == 0 {
            println!("No files to parse");
            continue;
        }
        println!("Inserting {} files", num_files);
        insert_matches(client.clone(), json_files).await.unwrap();
        for obj in objects.iter() {
            let filename = std::path::Path::new(&obj.key)
                .file_name()
                .unwrap()
                .to_str()
                .unwrap();
            s3limiter.wait().await;
            bucket
                .copy_object_internal(&obj.key, &format!("processed/metadata/{}", filename))
                .await
                .unwrap();
            bucket.delete_object(&obj.key).await.unwrap();
        }
        println!("Inserted {} files", num_files);
        println!("Elapsed: {:?}", start.elapsed());
        println!(
            "Seconds per file: {:?}",
            start.elapsed().as_secs_f64() / num_files as f64
        );
    }
}

async fn insert_matches(
    client: Client,
    matches: Vec<MatchMetadata>,
) -> clickhouse::error::Result<()> {
    let mut match_info_insert = client.insert("match_info")?;
    let mut match_player_insert = client.insert("match_player")?;
    for match_info in matches.into_iter().map(|m| m.match_info) {
        let ch_match_metadata: ClickhouseMatchInfo = match_info.clone().into();
        match_info_insert.write(&ch_match_metadata).await?;

        let ch_players = match_info
            .players
            .into_iter()
            .map::<ClickhouseMatchPlayer, _>(|p| (match_info.match_id, p).into());
        for player in ch_players {
            match_player_insert.write(&player).await?;
        }
    }
    match_info_insert.end().await?;
    match_player_insert.end().await?;
    Ok(())
}
