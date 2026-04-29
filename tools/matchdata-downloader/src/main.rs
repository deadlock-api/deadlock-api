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
use std::sync::{Arc, Mutex};

use anyhow::Context;
use cached::SizedCache;
use cached::proc_macro::cached;
use clickhouse::Client;
use futures::StreamExt;
use metrics::{counter, gauge};
use models::MatchSalts;
use object_store::path::Path;
use object_store::{ObjectStore, ObjectStoreExt, PutPayload};
use tokio::time::sleep;
use tokio_util::bytes::Bytes;
use tracing::{debug, error, info, instrument, warn};

mod models;

const CONCURRENCY: usize = 10;
const POLL_INTERVAL: Duration = Duration::from_secs(10);
const ITERATION_BACKOFF: Duration = Duration::from_secs(5);
const RETRY_INTERVAL: Duration = Duration::from_mins(1);
const MAX_RETRIES: u8 = 30;

const PENDING_SALTS_QUERY: &str = "
SELECT
    match_id,
    argMax(cluster_id,    created_at) AS cluster_id,
    argMax(metadata_salt, created_at) AS metadata_salt
FROM match_salts
WHERE created_at > now() - INTERVAL 2 DAY
  AND match_id NOT IN (
      SELECT DISTINCT match_id FROM match_player
      WHERE match_id IN (
          SELECT match_id FROM match_salts WHERE created_at > now() - INTERVAL 2 DAY
      )
  )
GROUP BY match_id
SETTINGS log_comment = 'matchdata_downloader_fetch_pending_salts'
";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let ch_client = common::get_ch_client()?;
    let store: Arc<dyn ObjectStore> = Arc::new(common::get_store()?);
    let cache_store: Arc<dyn ObjectStore> = Arc::new(common::get_cache_store()?);
    let state = State::new();

    loop {
        if let Err(e) = run_iteration(&ch_client, &store, &cache_store, &state).await {
            counter!("matchdata_downloader.iteration.failure").increment(1);
            error!("Iteration failed: {e:#}");
            sleep(ITERATION_BACKOFF).await;
        }
    }
}

async fn run_iteration(
    ch_client: &Client,
    store: &Arc<dyn ObjectStore>,
    cache_store: &Arc<dyn ObjectStore>,
    state: &State,
) -> anyhow::Result<()> {
    info!("Fetching match ids to download");
    let pending = fetch_pending_salts(ch_client)
        .await
        .context("fetching pending match salts")?;

    state.prune(&pending.iter().map(|s| s.match_id).collect());
    let to_fetch = state.select_eligible(pending);

    gauge!("matchdata_downloader.matches_to_download").set(to_fetch.len() as f64);

    if to_fetch.is_empty() {
        info!(
            "No matches to download, sleeping for {}s",
            POLL_INTERVAL.as_secs()
        );
        sleep(POLL_INTERVAL).await;
        return Ok(());
    }

    let results = process_batch(store.as_ref(), cache_store.as_ref(), &to_fetch).await;
    handle_results(state, store, cache_store, &to_fetch, results);
    Ok(())
}

async fn fetch_pending_salts(ch_client: &Client) -> anyhow::Result<Vec<MatchSalts>> {
    let rows = ch_client
        .query(PENDING_SALTS_QUERY)
        .fetch_all::<MatchSalts>()
        .await?;
    Ok(rows
        .into_iter()
        .filter(|s| s.cluster_id.is_some() && s.metadata_salt.is_some())
        .collect())
}

async fn process_batch<B, C>(
    bucket: &B,
    cache_bucket: &C,
    salts: &[MatchSalts],
) -> Vec<anyhow::Result<()>>
where
    B: ObjectStore + ?Sized,
    C: ObjectStore + ?Sized,
{
    futures::stream::iter(salts.iter())
        .map(|s| async move {
            let r = download_match(bucket, cache_bucket, s).await;
            if r.is_ok() {
                gauge!("matchdata_downloader.matches_to_download").decrement(1);
            } else if let Err(e) = &r {
                error!("Failed to download match {}: {e:#}", s.match_id);
            }
            r
        })
        .buffer_unordered(CONCURRENCY)
        .collect()
        .await
}

fn handle_results(
    state: &State,
    store: &Arc<dyn ObjectStore>,
    cache_store: &Arc<dyn ObjectStore>,
    salts: &[MatchSalts],
    results: Vec<anyhow::Result<()>>,
) {
    for (s, result) in salts.iter().zip(results) {
        match result {
            Ok(()) => state.mark_uploaded(s.match_id),
            Err(e) if is_retryable(&e) => state.start_retry_task(store, cache_store, s.clone()),
            Err(_) => state.mark_failed(s.match_id),
        }
    }
}

#[derive(Clone)]
struct State {
    failed: Arc<Mutex<HashSet<u64>>>,
    uploaded: Arc<Mutex<HashSet<u64>>>,
    retrying: Arc<Mutex<HashSet<u64>>>,
}

impl State {
    fn new() -> Self {
        Self {
            failed: Arc::default(),
            uploaded: Arc::default(),
            retrying: Arc::default(),
        }
    }

    fn mark_uploaded(&self, id: u64) {
        self.uploaded.lock().unwrap().insert(id);
        self.retrying.lock().unwrap().remove(&id);
    }

    fn mark_failed(&self, id: u64) {
        self.failed.lock().unwrap().insert(id);
        self.retrying.lock().unwrap().remove(&id);
    }

    /// Drop entries for matches that have aged out of the SQL window so the
    /// in-memory sets do not grow unboundedly.
    fn prune(&self, valid: &HashSet<u64>) {
        for set in [&self.failed, &self.uploaded, &self.retrying] {
            set.lock().unwrap().retain(|id| valid.contains(id));
        }
    }

    fn select_eligible(&self, pending: Vec<MatchSalts>) -> Vec<MatchSalts> {
        let f = self.failed.lock().unwrap();
        let u = self.uploaded.lock().unwrap();
        let r = self.retrying.lock().unwrap();
        pending
            .into_iter()
            .filter(|s| {
                !f.contains(&s.match_id) && !u.contains(&s.match_id) && !r.contains(&s.match_id)
            })
            .collect()
    }

    fn start_retry_task(
        &self,
        store: &Arc<dyn ObjectStore>,
        cache_store: &Arc<dyn ObjectStore>,
        salts: MatchSalts,
    ) {
        if !self.retrying.lock().unwrap().insert(salts.match_id) {
            return; // already being retried
        }
        tokio::spawn(retry_match(
            Arc::clone(store),
            Arc::clone(cache_store),
            salts,
            self.clone(),
        ));
    }
}

async fn retry_match(
    store: Arc<dyn ObjectStore>,
    cache_store: Arc<dyn ObjectStore>,
    salts: MatchSalts,
    state: State,
) {
    let match_id = salts.match_id;
    info!(
        "Scheduling retries for match {match_id} (every {}s, up to {MAX_RETRIES} attempts)",
        RETRY_INTERVAL.as_secs(),
    );
    for attempt in 1..=MAX_RETRIES {
        sleep(RETRY_INTERVAL).await;
        match download_match(store.as_ref(), cache_store.as_ref(), &salts).await {
            Ok(()) => {
                info!("Match {match_id} downloaded on retry attempt {attempt}/{MAX_RETRIES}");
                counter!("matchdata_downloader.retry.success").increment(1);
                state.mark_uploaded(match_id);
                return;
            }
            Err(e) if is_retryable(&e) => {
                debug!(
                    "Transient error on retry {attempt}/{MAX_RETRIES} for match {match_id}: {e:#}"
                );
            }
            Err(e) => {
                warn!("Non-retryable error retrying match {match_id}: {e:#}");
                counter!("matchdata_downloader.retry.permanent_failure").increment(1);
                state.mark_failed(match_id);
                return;
            }
        }
    }
    error!("Match {match_id} still failing after {MAX_RETRIES} retries; marking failed");
    counter!("matchdata_downloader.retry.exhausted").increment(1);
    state.mark_failed(match_id);
}

#[instrument(skip(bucket, cache_bucket))]
async fn download_match<B, C>(
    bucket: &B,
    cache_bucket: &C,
    salts: &MatchSalts,
) -> anyhow::Result<()>
where
    B: ObjectStore + ?Sized,
    C: ObjectStore + ?Sized,
{
    let main_key = main_metadata_key(salts.match_id);
    let cache_key = cache_metadata_key(salts.match_id);
    let outdated_hltv_key = outdated_hltv_metadata_key(salts.match_id);

    if key_exists(bucket, &main_key).await {
        return Ok(());
    }

    let bytes = fetch_metadata(salts)
        .await
        .with_context(|| format!("fetching metadata for match {}", salts.match_id))?;

    let (up_main, up_cache, del_main, del_cache) = tokio::join!(
        upload_object(bucket, &main_key, bytes.clone()),
        upload_object(cache_bucket, &cache_key, bytes),
        delete_object(bucket, &outdated_hltv_key),
        delete_object(cache_bucket, &outdated_hltv_key),
    );
    up_main.context("uploading main metadata")?;
    up_cache.context("uploading cached metadata")?;
    del_main.context("deleting outdated HLTV metadata (main)")?;
    del_cache.context("deleting outdated HLTV metadata (cache)")?;

    info!("Match downloaded");
    Ok(())
}

fn main_metadata_key(match_id: u64) -> Path {
    Path::from(format!("/ingest/metadata/{match_id}.meta.bz2"))
}

fn cache_metadata_key(match_id: u64) -> Path {
    Path::from(format!("{match_id}.meta.bz2"))
}

fn outdated_hltv_metadata_key(match_id: u64) -> Path {
    Path::from(format!("/processed/metadata/{match_id}.meta_hltv.bz2"))
}

fn metadata_url(salts: &MatchSalts) -> String {
    format!(
        "http://replay{}.valve.net/1422450/{}_{}.meta.bz2",
        salts.cluster_id.unwrap_or_default(),
        salts.match_id,
        salts.metadata_salt.unwrap_or_default(),
    )
}

async fn fetch_metadata(salts: &MatchSalts) -> reqwest::Result<Bytes> {
    let url = metadata_url(salts);
    let result = reqwest::get(&url)
        .await
        .and_then(reqwest::Response::error_for_status);
    let bytes = match result {
        Ok(resp) => resp.bytes().await,
        Err(e) => Err(e),
    };
    match bytes {
        Ok(b) => {
            counter!("matchdata_downloader.fetch_metadata.successful").increment(1);
            debug!("Metadata fetched from {url}");
            Ok(b)
        }
        Err(e) => {
            counter!("matchdata_downloader.fetch_metadata.failure").increment(1);
            debug!("Failed to fetch metadata from {url}: {e}");
            Err(e)
        }
    }
}

/// True if the error is worth retrying — server errors (5xx), timeouts, or
/// connection failures. Client errors (4xx) and unrelated errors are not.
fn is_retryable(err: &anyhow::Error) -> bool {
    let Some(req_err) = err.downcast_ref::<reqwest::Error>() else {
        return false;
    };
    if req_err.is_timeout() || req_err.is_connect() {
        return true;
    }
    req_err.status().is_some_and(|s| s.is_server_error())
}

#[instrument(skip(store, bytes))]
async fn upload_object<S: ObjectStore + ?Sized>(
    store: &S,
    key: &Path,
    bytes: Bytes,
) -> object_store::Result<()> {
    match store.put(key, PutPayload::from_bytes(bytes)).await {
        Ok(_) => {
            counter!("matchdata_downloader.upload_object.successful").increment(1);
            debug!("Uploaded object");
            Ok(())
        }
        Err(e) => {
            counter!("matchdata_downloader.upload_object.failure").increment(1);
            Err(e)
        }
    }
}

#[instrument(skip(store))]
async fn delete_object<S: ObjectStore + ?Sized>(store: &S, key: &Path) -> object_store::Result<()> {
    match store.delete(key).await {
        Ok(()) => {
            counter!("matchdata_downloader.delete_object.successful").increment(1);
            debug!("Deleted object");
            Ok(())
        }
        Err(object_store::Error::NotFound { .. }) => Ok(()),
        Err(e) => {
            counter!("matchdata_downloader.delete_object.failure").increment(1);
            Err(e)
        }
    }
}

#[cached(
    ty = "SizedCache<String, bool>",
    create = "{ SizedCache::with_size(10_000) }",
    convert = r#"{ format!("{file_path}") }"#
)]
#[instrument(skip(store))]
async fn key_exists<S: ObjectStore + ?Sized>(store: &S, file_path: &Path) -> bool {
    debug!("Checking if key exists");
    store.head(file_path).await.is_ok()
}
