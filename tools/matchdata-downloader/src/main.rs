use arl::RateLimiter;
use async_compression::tokio::bufread::BzDecoder;
use async_compression::tokio::write::ZstdEncoder;
use clickhouse::{Client, Compression, Row};
use s3::creds::Credentials;
use s3::{Bucket, Region};
use serde::Deserialize;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

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
    let limiter = RateLimiter::new(1, Duration::from_secs(5 * 60));

    loop {
        limiter.wait().await;

        let query = "SELECT DISTINCT match_id,cluster_id,metadata_salt,replay_salt FROM match_salts WHERE match_id NOT IN (SELECT match_id FROM match_info)";
        let mut match_ids_to_fetch = client.query(query).fetch::<MatchIdQueryResult>().unwrap();

        while let Some(row) = match_ids_to_fetch.next().await.unwrap() {
            println!("Downloading match {}", row.match_id);
            let key = format!("/ingest/metadata/{}.meta.zst", row.match_id);
            if bucket
                .head_object(&key)
                .await
                .map(|(_, s)| s == 200)
                .unwrap_or(false)
            {
                println!("Metadata for match {} already exists", row.match_id);
                continue;
            } else {
                let metadata_url = format!(
                    "http://replay{}.valve.net/1422450/{}_{}.meta.bz2",
                    row.cluster_id, row.match_id, row.metadata_salt
                );
                let match_metadata = reqwest::get(&metadata_url)
                    .await
                    .unwrap()
                    .bytes()
                    .await
                    .unwrap();

                let mut decompressed = vec![];
                BzDecoder::new(match_metadata.as_ref())
                    .read_to_end(&mut decompressed)
                    .await
                    .unwrap();
                let mut encoder = ZstdEncoder::new(Vec::new());
                encoder.write_all(decompressed.as_ref()).await.unwrap();
                encoder.shutdown().await.unwrap();

                bucket
                    .put_object(&key, &encoder.into_inner())
                    .await
                    .unwrap();
                println!("Uploaded metadata for match {}", row.match_id);
            }

            let key = format!("/ingest/demo/{}.dem.zst", row.match_id);
            if bucket
                .head_object(&key)
                .await
                .map(|(_, s)| s == 200)
                .unwrap_or(false)
            {
                println!("Replay for match {} already exists", row.match_id);
                continue;
            } else {
                let replay_url = format!(
                    "http://replay{}.valve.net/1422450/{}_{}.dem.bz2",
                    row.cluster_id, row.match_id, row.replay_salt
                );
                let match_replay = reqwest::get(&replay_url)
                    .await
                    .unwrap()
                    .bytes()
                    .await
                    .unwrap();

                let mut decompressed = vec![];
                BzDecoder::new(match_replay.as_ref())
                    .read_to_end(&mut decompressed)
                    .await
                    .unwrap();
                let mut encoder = ZstdEncoder::new(Vec::new());
                encoder.write_all(decompressed.as_ref()).await.unwrap();
                encoder.shutdown().await.unwrap();

                bucket
                    .put_object(&key, &encoder.into_inner())
                    .await
                    .unwrap();
                println!("Uploaded replay for match {}", row.match_id);
            }
        }
    }
}
