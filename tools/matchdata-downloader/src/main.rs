use cached::proc_macro::cached;
use cached::TimedCache;
use clickhouse::{Client, Compression, Row};
use futures::TryStreamExt;
use s3::creds::Credentials;
use s3::{Bucket, Region};
use serde::Deserialize;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::time::sleep;
use tokio_util::io::StreamReader;

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

#[derive(Row, Deserialize)]
struct MatchIdQueryResult {
    match_id: u64,
    cluster_id: u32,
    metadata_salt: u32,
    replay_salt: u32,
}

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

    loop {
        println!("Fetching match ids to download");
        let query = "SELECT DISTINCT match_id,cluster_id,metadata_salt,replay_salt FROM match_salts WHERE match_id NOT IN (SELECT match_id FROM match_info)";
        let mut match_ids_to_fetch = client.query(query).fetch::<MatchIdQueryResult>().unwrap();

        let mut handles = vec![];
        let mut remaining = 40;
        while let Some(row) = match_ids_to_fetch.next().await.unwrap() {
            let key = format!("/ingest/metadata/{}.meta.bz2", row.match_id);
            let key2 = format!("/ingest/demo/{}.dem.bz2", row.match_id);
            if key_exists(&bucket, &key).await && key_exists(&bucket, &key2).await {
                println!("Match {} already exists", row.match_id);
                continue;
            }
            remaining -= 1;
            if remaining == 0 {
                break;
            }
            handles.push(tokio::spawn(download_match(row, bucket.clone())));
        }
        if handles.is_empty() {
            sleep(Duration::from_secs(60)).await;
        }
        futures::future::join_all(handles).await;
    }
}

async fn download_match(row: MatchIdQueryResult, bucket: Box<Bucket>) {
    println!("Downloading match {}", row.match_id);
    let key = format!("/ingest/metadata/{}.meta.bz2", row.match_id);
    if key_exists(&bucket, &key).await {
        println!("Metadata for match {} already exists", row.match_id);
        return;
    } else {
        let metadata_url = format!(
            "http://replay{}.valve.net/1422450/{}_{}.meta.bz2",
            row.cluster_id, row.match_id, row.metadata_salt
        );
        let response = reqwest::get(&metadata_url).await.unwrap();
        response.error_for_status_ref().unwrap();
        let mut reader = StreamReader::new(
            response
                .bytes_stream()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
        );
        bucket.put_object_stream(&mut reader, &key).await.unwrap();
        println!("Uploaded metadata for match {}", row.match_id);
    }

    let key = format!("/ingest/demo/{}.dem.bz2", row.match_id);
    if key_exists(&bucket, &key).await {
        println!("Replay for match {} already exists", row.match_id);
    } else {
        let replay_url = format!(
            "http://replay{}.valve.net/1422450/{}_{}.dem.bz2",
            row.cluster_id, row.match_id, row.replay_salt
        );
        let response = reqwest::get(&replay_url).await.unwrap();
        response.error_for_status_ref().unwrap();
        let mut reader = StreamReader::new(
            response
                .bytes_stream()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
        );
        bucket.put_object_stream(&mut reader, &key).await.unwrap();
        println!("Uploaded replay for match {}", row.match_id);
    }
}

#[cached(
    ty = "TimedCache<String, bool>",
    create = "{ TimedCache::with_lifespan(30 * 60) }",
    convert = r#"{ format!("{}", file_path) }"#
)]
async fn key_exists(bucket: &Bucket, file_path: &str) -> bool {
    bucket
        .head_object(&file_path)
        .await
        .map(|(_, s)| s == 200)
        .unwrap_or(false)
}
