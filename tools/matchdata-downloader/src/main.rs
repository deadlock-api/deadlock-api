use cached::proc_macro::cached;
use cached::UnboundCache;
use clickhouse::{Client, Compression, Row};
use futures::TryStreamExt;
use s3::creds::Credentials;
use s3::{Bucket, Region};
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::{Arc, LazyLock, Mutex};
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
static S3_CACHE_BUCKET_NAME: LazyLock<String> =
    LazyLock::new(|| std::env::var("S3_CACHE_BUCKET_NAME").unwrap());
static S3_CACHE_ACCESS_KEY_ID: LazyLock<String> =
    LazyLock::new(|| std::env::var("S3_CACHE_ACCESS_KEY_ID").unwrap());
static S3_CACHE_SECRET_ACCESS_KEY: LazyLock<String> =
    LazyLock::new(|| std::env::var("S3_CACHE_SECRET_ACCESS_KEY").unwrap());
static S3_CACHE_ENDPOINT_URL: LazyLock<String> =
    LazyLock::new(|| std::env::var("S3_CACHE_ENDPOINT_URL").unwrap());
static S3_CACHE_REGION: LazyLock<String> =
    LazyLock::new(|| std::env::var("S3_CACHE_REGION").unwrap());

static DO_NOT_PULL_DEMO_FILES: LazyLock<bool> = LazyLock::new(|| {
    std::env::var("DO_NOT_PULL_DEMO_FILES")
        .map(|s| s == "true")
        .unwrap_or(false)
});

#[derive(Row, Deserialize, PartialEq, Eq, Hash, Clone)]
struct MatchIdQueryResult {
    match_id: u64,
    cluster_id: Option<u32>,
    metadata_salt: Option<u32>,
    replay_salt: Option<u32>,
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
    let s3_cache_credentials = Credentials::new(
        Some(&S3_CACHE_ACCESS_KEY_ID),
        Some(&S3_CACHE_SECRET_ACCESS_KEY),
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

    let cache_bucket = Bucket::new(
        &S3_CACHE_BUCKET_NAME,
        Region::Custom {
            region: S3_CACHE_REGION.clone(),
            endpoint: S3_CACHE_ENDPOINT_URL.clone(),
        },
        s3_cache_credentials.clone(),
    )
    .unwrap()
    .with_path_style();

    let failed = Arc::new(Mutex::new(vec![]));
    let uploaded = Arc::new(Mutex::new(vec![]));

    loop {
        println!("Fetching match ids to download");
        let query = "SELECT DISTINCT match_id, cluster_id, metadata_salt, replay_salt FROM match_salts WHERE match_id NOT IN (SELECT match_id FROM match_info) AND created_at > now() - INTERVAL 1 MONTH LIMIT 100";
        let match_ids_to_fetch: Vec<MatchIdQueryResult> =
            client.query(query).fetch_all().await.unwrap();
        let match_ids_to_fetch: HashSet<MatchIdQueryResult> = match_ids_to_fetch
            .into_iter()
            .filter(|row| !failed.lock().unwrap().contains(&row.match_id))
            .filter(|row| !uploaded.lock().unwrap().contains(&row.match_id))
            .filter(|row| row.cluster_id.is_some() && row.metadata_salt.is_some())
            .collect();

        if match_ids_to_fetch.is_empty() {
            println!("No matches to download, sleeping for 10s");
            sleep(Duration::from_secs(10)).await;
            continue;
        }

        futures::future::join_all(match_ids_to_fetch.into_iter().map(|row| {
            download_match(
                row,
                bucket.clone(),
                cache_bucket.clone(),
                failed.clone(),
                uploaded.clone(),
            )
        }))
        .await;
    }
}

async fn download_match(
    row: MatchIdQueryResult,
    bucket: Box<Bucket>,
    cache_bucket: Box<Bucket>,
    failed: Arc<Mutex<Vec<u64>>>,
    uploaded: Arc<Mutex<Vec<u64>>>,
) {
    let key = format!("/ingest/metadata/{}.meta.bz2", row.match_id);
    if key_exists(&bucket, &key).await {
        return;
    }
    let metadata_url = format!(
        "http://replay{}.valve.net/1422450/{}_{}.meta.bz2",
        row.cluster_id.unwrap(),
        row.match_id,
        row.metadata_salt.unwrap()
    );
    let response = reqwest::get(&metadata_url)
        .await
        .and_then(|r| r.error_for_status());
    if let Err(e) = response {
        println!(
            "Failed to download metadata for match {}: {}",
            row.match_id, e
        );
        failed.lock().unwrap().push(row.match_id);
        return;
    }
    let bytes = response.unwrap().bytes().await.unwrap();
    if let Err(e) = bucket.put_object(&key, &bytes).await {
        println!(
            "Failed to upload metadata for match {}: {}",
            row.match_id, e
        );
        sleep(Duration::from_secs(10)).await;
        return;
    }
    if let Err(e) = cache_bucket
        .put_object(&format!("{}.meta.bz2", row.match_id), &bytes)
        .await
    {
        println!(
            "Failed to upload metadata to cache for match {}: {}",
            row.match_id, e
        );
    }

    // Delete HLTV metas from main bucket/cache bucket if we're ingesting a full meta
    //
    // This may be because we got a user provided salt, or because the HLTV meta wasn't fully
    // ingested (e.g. if there was an error)
    let outdated_hltv_meta_key = format!("/processed/metadata/{}.meta_hltv.bz2", row.match_id);
    if key_exists(&bucket, &outdated_hltv_meta_key).await {
        if let Err(e) = bucket.delete_object(&outdated_hltv_meta_key).await {
            println!(
                "Failed to delete outdated hltv meta key for match from main bucket {}: {}",
                row.match_id, e
            );
        }
    }
    if key_exists(&cache_bucket, &outdated_hltv_meta_key).await {
        if let Err(e) = cache_bucket.delete_object(&outdated_hltv_meta_key).await {
            println!(
                "Failed to delete outdated hltv meta key for match from cache_bucket {}: {}",
                row.match_id, e
            );
        }
    }

    println!("Uploaded metadata for match {}", row.match_id);
    uploaded.lock().unwrap().push(row.match_id);

    if *DO_NOT_PULL_DEMO_FILES {
        return;
    }

    let key = format!("/ingest/demo/{}.dem.bz2", row.match_id);
    if key_exists(&bucket, &key).await {
        return;
    }
    let replay_url = format!(
        "http://replay{}.valve.net/1422450/{}_{}.dem.bz2",
        row.cluster_id.unwrap(),
        row.match_id,
        row.replay_salt.unwrap()
    );
    let response = reqwest::get(&replay_url).await.unwrap();
    response.error_for_status_ref().unwrap();
    let mut reader = StreamReader::new(
        response
            .bytes_stream()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
    );
    if let Err(e) = bucket.put_object_stream(&mut reader, &key).await {
        println!(
            "Failed to upload metadata for match {}: {}",
            row.match_id, e
        );
        sleep(Duration::from_secs(10)).await;
        return;
    }
    println!("Uploaded replay for match {}", row.match_id);
}

#[cached(
    ty = "UnboundCache<String, bool>",
    create = "{ UnboundCache::new() }",
    convert = r#"{ format!("{}", file_path) }"#
)]
async fn key_exists(bucket: &Bucket, file_path: &str) -> bool {
    println!("Checking if key exists: {}", file_path);
    bucket
        .head_object(&file_path)
        .await
        .map(|(_, s)| s == 200)
        .unwrap_or(false)
}
