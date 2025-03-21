use prost::Message;
use std::collections::HashSet;
use std::net::SocketAddrV4;
use std::path::Path;

use crate::models::clickhouse_match_metadata::{ClickhouseMatchInfo, ClickhouseMatchPlayer};
use crate::models::enums::MatchOutcome;
use async_compression::tokio::bufread::BzDecoder;
use clickhouse::Compression;
use futures::StreamExt;
use metrics::{counter, gauge};
use metrics_exporter_prometheus::PrometheusBuilder;
use s3::creds::Credentials;
use s3::error::S3Error;
use s3::request::ResponseData;
use s3::{Bucket, Region};
use std::sync::LazyLock;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::time::sleep;
use tracing::{debug, error, info, instrument, warn};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
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
static S3_TIMEOUT_S: LazyLock<u64> = LazyLock::new(|| {
    std::env::var("S3_TIMEOUT_S")
        .unwrap_or("20".to_string())
        .parse()
        .unwrap_or(20)
});

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

    let http_client = reqwest::Client::new();

    let ch_client = clickhouse::Client::default()
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
    .unwrap()
    .with_request_timeout(Duration::from_secs(*S3_TIMEOUT_S))
    .unwrap();

    loop {
        let objs_to_ingest = match list_ingest_objects(&bucket).await {
            Ok(value) => {
                counter!("ingest_worker.list_ingest_objects.success").increment(1);
                debug!("Listed {} objects", value.len());
                value
            }
            Err(e) => {
                counter!("ingest_worker.list_ingest_objects.failure").increment(1);
                error!("Error listing objects: {:?}, sleeping for 10s", e);
                sleep(Duration::from_secs(10)).await;
                continue;
            }
        };

        gauge!("ingest_worker.objs_to_ingest").set(objs_to_ingest.len() as f64);

        if objs_to_ingest.is_empty() {
            info!("No files to fetch, waiting 10s ...");
            sleep(Duration::from_secs(10)).await;
            continue;
        }

        futures::stream::iter(&objs_to_ingest)
            .take(100)
            .map(|key| ingest_object(&bucket, &http_client, &ch_client, key))
            .buffer_unordered(10)
            .collect::<Vec<_>>()
            .await
            .iter()
            .for_each(|result| match result {
                Ok(key) => {
                    counter!("ingest_worker.ingest_object.success").increment(1);
                    info!("Ingested object: {}", key);
                }
                Err(e) => {
                    counter!("ingest_worker.ingest_object.failure").increment(1);
                    error!("Error ingesting object: {}", e);
                }
            })
    }
}

#[instrument(skip(bucket, http_client, ch_client))]
async fn ingest_object(
    bucket: &Bucket,
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    key: &str,
) -> anyhow::Result<String> {
    // Fetch Data
    let obj = get_object(bucket, key).await?;

    // Decompress Data
    let data = obj.bytes().as_ref();
    let data = if key.ends_with(".bz2") {
        bzip_decompress(data).await?
    } else {
        data.to_vec()
    };

    // Ingest to Clickhouse
    let match_info = parse_match_data(data)?;
    match insert_match(ch_client, &match_info).await {
        Ok(_) => {
            counter!("ingest_worker.insert_match.success").increment(1);
            debug!("Inserted match data");
        }
        Err(e) => {
            counter!("ingest_worker.insert_match.failure").increment(1);
            error!("Error inserting match data: {}", e);
            return Err(anyhow::anyhow!("Error inserting match data: {}", key));
        }
    }

    // Move Object to processed folder
    let new_path = format!(
        "processed/metadata/{}",
        Path::new(key).file_name().unwrap().to_str().unwrap()
    );
    move_object(bucket, key, &new_path).await?;

    // Send Ingest Event
    if let Some(match_id) = match_info.match_id {
        send_ingest_event(http_client, match_id).await?;
    }
    Ok(key.to_string())
}

async fn list_ingest_objects(bucket: &Bucket) -> Result<HashSet<String>, S3Error> {
    let objs = bucket
        .list("ingest/metadata".parse().unwrap(), None)
        .await?;
    Ok(objs
        .into_iter()
        .flat_map(|dir| dir.contents)
        .filter(|obj| {
            obj.key.ends_with(".meta")
                || obj.key.ends_with(".meta.bz2")
                || obj.key.ends_with(".meta_hltv.bz2")
        })
        .map(|o| o.key)
        .collect::<HashSet<_>>())
}

async fn get_object(bucket: &Bucket, key: &str) -> Result<ResponseData, S3Error> {
    match bucket.get_object(key).await {
        Ok(data) => {
            counter!("ingest_worker.fetch_object.success").increment(1);
            debug!("Fetched object");
            Ok(data)
        }
        Err(e) => {
            counter!("ingest_worker.fetch_object.failure").increment(1);
            error!("Error getting object: {}", e);
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
            error!("Error decompressing object: {}", e);
            Err(e)
        }
    }
}

fn parse_match_data(data: Vec<u8>) -> anyhow::Result<MatchInfo> {
    let data = match CMsgMatchMetaData::decode(data.as_slice()) {
        Ok(m) => m.match_details.map_or(data, |m| m.clone()),
        Err(_) => data,
    };
    let data = data.as_slice();
    let data = if let Ok(m) = CMsgMatchMetaDataContents::decode(data) {
        m.match_info
    } else {
        MatchInfo::decode(data).ok()
    };
    match data {
        Some(m) => {
            counter!("ingest_worker.parse_match_data.success").increment(1);
            debug!("Parsed match data");
            Ok(m)
        }
        None => {
            counter!("ingest_worker.parse_match_data.failure").increment(1);
            error!("Error parsing match data");
            Err(anyhow::anyhow!("Error parsing match data"))
        }
    }
}

async fn insert_match(client: &clickhouse::Client, match_info: &MatchInfo) -> anyhow::Result<()> {
    let ch_match_metadata: ClickhouseMatchInfo = match_info.clone().into();
    if ch_match_metadata.match_outcome == MatchOutcome::Error {
        warn!("Match outcome is error, skipping match");
        return Err(anyhow::anyhow!("Match outcome is error, skipping match"));
    }
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

    let mut mi_insert = client.insert("match_info")?;
    let mut mp_insert = client.insert("match_player")?;
    mi_insert.write(&ch_match_metadata).await?;
    for player in ch_players {
        mp_insert.write(&player).await?;
    }
    mi_insert.end().await?;
    mp_insert.end().await?;
    Ok(())
}

async fn move_object(bucket: &Bucket, old_key: &str, new_key: &str) -> Result<(), S3Error> {
    match tryhard::retry_fn(|| async {
        bucket.copy_object_internal(old_key, new_key).await?;
        bucket.delete_object(old_key).await.map(|_| ())
    })
    .retries(5)
    .exponential_backoff(Duration::from_millis(10))
    .await
    {
        Ok(_) => {
            counter!("ingest_worker.move_object.success").increment(1);
            debug!("Moved object");
            Ok(())
        }
        Err(e) => {
            counter!("ingest_worker.move_object.failure").increment(1);
            error!("Error moving object: {}", e);
            Err(e)
        }
    }
}

async fn send_ingest_event(http_client: &reqwest::Client, match_id: u64) -> reqwest::Result<()> {
    let result = http_client
        .post(format!(
            "https://api.deadlock-api.com/v1/matches/{}/ingest",
            match_id
        ))
        .header(
            "X-Api-Key",
            std::env::var("INTERNAL_DEADLOCK_API_KEY").unwrap(),
        )
        .send()
        .await
        .and_then(|res| res.error_for_status());
    match result {
        Ok(_) => {
            counter!("ingest_worker.send_event.success").increment(1);
            debug!("Sent event");
            Ok(())
        }
        Err(e) => {
            counter!("ingest_worker.send_event.failure").increment(1);
            error!("Error sending event for match: {}", e);
            Err(e)
        }
    }
}
