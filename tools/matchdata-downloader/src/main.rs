use cached::UnboundCache;
use cached::proc_macro::cached;
use clickhouse::{Compression, Row};
use futures::StreamExt;
use itertools::Itertools;
use metrics::{counter, gauge};
use metrics_exporter_prometheus::PrometheusBuilder;
use s3::creds::Credentials;
use s3::error::S3Error;
use s3::{Bucket, Region};
use serde::Deserialize;
use std::collections::HashSet;
use std::fmt::Debug;
use std::net::SocketAddrV4;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::time::sleep;
use tokio_util::bytes::Bytes;
use tracing::{debug, error, info, instrument};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

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

#[derive(Row, Deserialize, PartialEq, Eq, Hash, Clone)]
struct MatchSalts {
    match_id: u64,
    cluster_id: Option<u32>,
    metadata_salt: Option<u32>,
    replay_salt: Option<u32>,
}

impl Debug for MatchSalts {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MatchSalts")
            .field("match_id", &self.match_id)
            .finish()
    }
}

#[tokio::main]
async fn main() {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new(
        "debug,h2=warn,hyper_util=warn,hyper=warn,reqwest=warn,rustls=warn",
    ));
    let fmt_layer = tracing_subscriber::fmt::layer();

    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(env_filter)
        .init();

    let builder = PrometheusBuilder::new()
        .with_http_listener("0.0.0.0:9002".parse::<SocketAddrV4>().unwrap());
    builder
        .install()
        .expect("failed to install recorder/exporter");

    let client = clickhouse::Client::default()
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

    let mut failed = HashSet::new();
    let mut uploaded = HashSet::new();

    loop {
        info!("Fetching match ids to download");
        let query = "SELECT DISTINCT match_id, cluster_id, metadata_salt, replay_salt FROM match_salts WHERE match_id NOT IN (SELECT match_id FROM match_info) AND created_at > now() - INTERVAL 1 MONTH";
        let match_ids_to_fetch: Vec<MatchSalts> = client.query(query).fetch_all().await.unwrap();
        let match_ids_to_fetch = match_ids_to_fetch
            .into_iter()
            .filter(|salts| !failed.contains(&salts.match_id))
            .filter(|salts| !uploaded.contains(&salts.match_id))
            .filter(|salts| salts.cluster_id.is_some() && salts.metadata_salt.is_some())
            .unique_by(|salts| salts.match_id)
            .collect_vec();

        gauge!("matchdata_downloader.matches_to_download").set(match_ids_to_fetch.len() as f64);

        if match_ids_to_fetch.is_empty() {
            info!("No matches to download, sleeping for 10s");
            sleep(Duration::from_secs(10)).await;
            continue;
        }

        let results: Vec<_> = futures::stream::iter(match_ids_to_fetch.iter())
            .map(|salts| download_match(&bucket, &cache_bucket, salts))
            .buffered(10)
            .collect()
            .await;
        for (salts, result) in match_ids_to_fetch.iter().zip(results) {
            match result {
                Ok(_) => {
                    info!("Match downloaded");
                    uploaded.insert(salts.match_id);
                }
                Err(e) => {
                    error!("Failed to download match: {}", e);
                    failed.insert(salts.match_id);
                }
            }
        }
    }
}

#[instrument(skip(bucket, cache_bucket))]
async fn download_match(
    bucket: &Bucket,
    cache_bucket: &Bucket,
    salts: &MatchSalts,
) -> anyhow::Result<()> {
    // Check if metadata already exists
    let key = format!("/ingest/metadata/{}.meta.bz2", salts.match_id);
    if key_exists(bucket, &key).await {
        return Ok(());
    }

    // Download metadata
    let bytes = fetch_metadata(salts).await?;

    // Upload to S3
    upload_object(bucket, &key, &bytes).await?;
    upload_object(
        cache_bucket,
        &format!("{}.meta.bz2", salts.match_id),
        &bytes,
    )
    .await?;

    // Delete outdated HLTV metadata
    let outdated_hltv_meta_key = format!("/processed/metadata/{}.meta_hltv.bz2", salts.match_id);
    delete_object(bucket, &outdated_hltv_meta_key).await?;
    delete_object(cache_bucket, &outdated_hltv_meta_key).await?;

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
        .and_then(|r| r.error_for_status())?
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
            error!("Failed to fetch metadata from {}: {}", metadata_url, e);
            Err(e)
        }
    }
}

#[instrument(skip(bucket, bytes))]
async fn upload_object(bucket: &Bucket, key: &str, bytes: &Bytes) -> Result<(), S3Error> {
    match bucket.put_object(&key, bytes).await {
        Ok(_) => {
            counter!("matchdata_downloader.upload_object.successful").increment(1);
            debug!("Uploaded object");
            Ok(())
        }
        Err(e) => {
            counter!("matchdata_downloader.upload_object.failure").increment(1);
            error!("Failed to upload object: {}", e);
            Err(e)
        }
    }
}

#[instrument(skip(bucket))]
async fn delete_object(bucket: &Bucket, key: &str) -> Result<(), S3Error> {
    if !key_exists(bucket, key).await {
        return Ok(());
    }
    match bucket.delete_object(&key).await {
        Ok(_) => {
            counter!("matchdata_downloader.delete_object.successful").increment(1);
            debug!("Deleted object");
            Ok(())
        }
        Err(e) => {
            counter!("matchdata_downloader.delete_object.failure").increment(1);
            error!("Failed to delete object: {}", e);
            Err(e)
        }
    }
}

#[cached(
    ty = "UnboundCache<String, bool>",
    create = "{ UnboundCache::new() }",
    convert = r#"{ format!("{}", file_path) }"#
)]
#[instrument(skip(bucket))]
async fn key_exists(bucket: &Bucket, file_path: &str) -> bool {
    debug!("Checking if key exists");
    bucket
        .head_object(&file_path)
        .await
        .map(|(_, s)| s == 200)
        .unwrap_or(false)
}
