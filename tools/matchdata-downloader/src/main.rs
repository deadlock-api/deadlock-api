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
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LazyLock, Mutex};

use anyhow::{Context, bail};
use cached::macros::cached;
use clap::Parser;
use clickhouse::Client;
use futures::StreamExt;
use metrics::{counter, gauge};
use models::MatchSalts;
use object_store::path::Path;
use object_store::{ObjectStore, ObjectStoreExt, PutPayload};
use tokio::time::sleep;
use tokio_util::bytes::Bytes;
use tracing::{debug, error, info, instrument};

mod models;

/// Upper bound on matches downloaded per iteration. Without it a large backlog
/// keeps a single iteration running for hours, during which matches that got
/// salts in the meantime are never picked up.
const BATCH_LIMIT: usize = 5_000;
/// How much of [`BATCH_LIMIT`] a single iteration may spend on re-attempts. Fresh
/// salts are claimed first and retries only fill what is left, but the backlog is
/// far larger than one batch, so it also needs a cap of its own: without it every
/// iteration would run the full 5 000 and stretch well past [`POLL_INTERVAL`],
/// delaying the fresh salts that arrive in the meantime.
const RETRY_BATCH_LIMIT: usize = 500;
const POLL_INTERVAL: Duration = Duration::from_secs(30);
const ITERATION_BACKOFF: Duration = Duration::from_secs(5);
/// Cooldown before the first re-attempt of a failed match; doubles per attempt
/// up to [`RETRY_MAX_INTERVAL`].
const RETRY_INITIAL_INTERVAL: Duration = Duration::from_mins(5);
const RETRY_MAX_INTERVAL: Duration = Duration::from_hours(24);
/// A large share of matches can never be fetched — Valve answers 502 for them
/// indefinitely — and they stay in the pending set forever because they never
/// reach `match_player`. Retrying them without limit would burn most of the
/// download capacity on matches that will never arrive, so they are parked after
/// this many attempts, which the backoff spreads over roughly four days. A
/// restart re-examines them, a slow enough cadence to still catch late arrivals.
const MAX_ATTEMPTS: u32 = 12;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_mins(1);

static CONCURRENCY: LazyLock<usize> = LazyLock::new(|| {
    std::env::var("MATCHDATA_DOWNLOADER_CONCURRENCY")
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .filter(|c| *c > 0)
        .unwrap_or(10)
});

/// One pooled client for the whole process. A fresh `reqwest::Client` per request
/// rebuilds the connection pool and TLS config each time, and — more importantly —
/// carries no timeout, so a stalled replay server can hold a concurrency slot
/// forever.
static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .pool_max_idle_per_host(*CONCURRENCY)
        .build()
        .expect("building the HTTP client")
});

/// Salts of 0 are placeholders that can never resolve to a replay URL.
const VALID_SALTS: &str = "cluster_id > 0 AND metadata_salt > 0";

const SALT_COLUMNS: &str = "
    match_id,
    argMax(cluster_id,    created_at) AS cluster_id,
    argMax(metadata_salt, created_at) AS metadata_salt";

/// Every match that has salts but no player rows yet, newest salts first. There is
/// deliberately no recency cut-off: a match that could not be downloaded within a
/// couple of days must stay a candidate rather than silently disappear.
fn pending_salts_query() -> String {
    format!(
        "
SELECT {SALT_COLUMNS}
FROM match_salts
WHERE match_id NOT IN (SELECT match_id FROM match_player)
GROUP BY match_id
HAVING {VALID_SALTS}
ORDER BY max(created_at) DESC
SETTINGS log_comment = 'matchdata_downloader_fetch_pending_salts'
"
    )
}

fn salts_by_id_query(match_ids: &[u64]) -> String {
    let ids = match_ids
        .iter()
        .map(u64::to_string)
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "
SELECT {SALT_COLUMNS}
FROM match_salts
WHERE match_id IN ({ids})
GROUP BY match_id
HAVING {VALID_SALTS}
SETTINGS log_comment = 'matchdata_downloader_fetch_salts_by_id'
"
    )
}

#[derive(Parser)]
#[command(about = "Deadlock match metadata downloader")]
struct Cli {
    /// Path to a file containing match IDs (one per line) to download once,
    /// instead of running the pending-match poll loop.
    #[arg(long)]
    match_ids_file: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;

    let cli = Cli::parse();

    let ch_client = common::get_ch_client()?;
    let store: Arc<dyn ObjectStore> = Arc::new(common::get_store()?);
    let cache_store: Arc<dyn ObjectStore> = Arc::new(common::get_cache_store()?);

    if let Some(ref file_path) = cli.match_ids_file {
        return download_from_file(&ch_client, &store, &cache_store, file_path).await;
    }

    let state = State::new();
    loop {
        let started = tokio::time::Instant::now();
        if let Err(e) = run_iteration(&ch_client, &store, &cache_store, &state).await {
            counter!("matchdata_downloader.iteration.failure").increment(1);
            error!("Iteration failed: {e:#}");
            sleep(ITERATION_BACKOFF).await;
            continue;
        }
        if let Some(remaining) = POLL_INTERVAL.checked_sub(started.elapsed()) {
            sleep(remaining).await;
        }
    }
}

async fn download_from_file(
    ch_client: &Client,
    store: &Arc<dyn ObjectStore>,
    cache_store: &Arc<dyn ObjectStore>,
    file_path: &str,
) -> anyhow::Result<()> {
    let content = tokio::fs::read_to_string(file_path)
        .await
        .with_context(|| format!("reading {file_path}"))?;
    let mut match_ids = content
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(|l| {
            l.parse::<u64>()
                .with_context(|| format!("invalid match id {l:?}"))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    match_ids.sort_unstable();
    match_ids.dedup();
    if match_ids.is_empty() {
        bail!("No match ids found in {file_path}");
    }

    let salts = ch_client
        .query(&salts_by_id_query(&match_ids))
        .fetch_all::<MatchSalts>()
        .await
        .context("fetching salts for the requested match ids")?;
    info!(
        "Downloading {} of {} requested matches; {} have no usable salts",
        salts.len(),
        match_ids.len(),
        match_ids.len() - salts.len(),
    );

    let failed = process_batch(store.as_ref(), cache_store.as_ref(), &salts)
        .await
        .iter()
        .filter(|(_, r)| r.is_err())
        .count();
    info!(
        "Downloaded {} matches, {failed} failed",
        salts.len() - failed
    );
    Ok(())
}

async fn run_iteration(
    ch_client: &Client,
    store: &Arc<dyn ObjectStore>,
    cache_store: &Arc<dyn ObjectStore>,
    state: &State,
) -> anyhow::Result<()> {
    info!("Fetching match ids to download");
    let pending = ch_client
        .query(&pending_salts_query())
        .fetch_all::<MatchSalts>()
        .await
        .context("fetching pending match salts")?;

    gauge!("matchdata_downloader.matches_to_download").set(pending.len() as f64);

    state.prune(&pending.iter().map(|s| s.match_id).collect());
    let (mut to_fetch, retries) = state.select_eligible(pending);
    let eligible = to_fetch.len() + retries.len();
    gauge!("matchdata_downloader.matches_eligible_now").set(eligible as f64);
    gauge!("matchdata_downloader.matches_retryable_now").set(retries.len() as f64);

    if eligible == 0 {
        info!("No matches eligible for download");
        return Ok(());
    }

    // Fresh salts claim capacity first; retries only get what is left over.
    to_fetch.truncate(BATCH_LIMIT);
    let n_fresh = to_fetch.len();
    let retry_budget = BATCH_LIMIT.saturating_sub(n_fresh).min(RETRY_BATCH_LIMIT);
    to_fetch.extend(retries.into_iter().take(retry_budget));
    info!(
        "Downloading {} of {eligible} eligible matches ({n_fresh} fresh, {} retries, newest first)",
        to_fetch.len(),
        to_fetch.len() - n_fresh,
    );

    let results = process_batch(store.as_ref(), cache_store.as_ref(), &to_fetch).await;
    handle_results(state, results);
    Ok(())
}

/// Each result carries its own match id: [`futures::StreamExt::buffer_unordered`]
/// yields in completion order, so the results cannot be zipped back onto `salts`
/// by position.
async fn process_batch<B, C>(
    bucket: &B,
    cache_bucket: &C,
    salts: &[MatchSalts],
) -> Vec<(u64, anyhow::Result<()>)>
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
            (s.match_id, r)
        })
        .buffer_unordered(*CONCURRENCY)
        .collect()
        .await
}

fn handle_results(state: &State, results: Vec<(u64, anyhow::Result<()>)>) {
    for (match_id, result) in results {
        match result {
            Ok(()) => state.mark_uploaded(match_id),
            Err(_) => state.back_off(match_id),
        }
    }
}

/// Exponential cooldown, saturating at [`RETRY_MAX_INTERVAL`]. A replay server
/// returning 502 is indistinguishable from one that never had the replay, so a
/// match is only written off after [`MAX_ATTEMPTS`] spread over about four days.
fn retry_delay(attempts: u32) -> Duration {
    RETRY_INITIAL_INTERVAL
        .saturating_mul(2u32.saturating_pow(attempts.saturating_sub(1).min(16)))
        .min(RETRY_MAX_INTERVAL)
}

struct Attempt {
    next: tokio::time::Instant,
    count: u32,
}

struct State {
    /// Uploaded but not yet visible in `match_player`; the SQL query keeps
    /// returning these until the ingest worker catches up.
    uploaded: Mutex<HashSet<u64>>,
    failed: Mutex<HashMap<u64, Attempt>>,
}

impl State {
    fn new() -> Self {
        Self {
            uploaded: Mutex::new(HashSet::new()),
            failed: Mutex::new(HashMap::new()),
        }
    }

    fn mark_uploaded(&self, id: u64) {
        self.uploaded.lock().unwrap().insert(id);
        self.failed.lock().unwrap().remove(&id);
    }

    fn back_off(&self, id: u64) {
        let mut failed = self.failed.lock().unwrap();
        let attempt = failed.entry(id).or_insert(Attempt {
            next: tokio::time::Instant::now(),
            count: 0,
        });
        attempt.count += 1;
        attempt.next = tokio::time::Instant::now() + retry_delay(attempt.count);
        if attempt.count == MAX_ATTEMPTS {
            debug!("Giving up on match {id} after {MAX_ATTEMPTS} attempts");
            counter!("matchdata_downloader.match.given_up").increment(1);
        }
    }

    /// Drop entries for matches that have left the pending set — they are ingested
    /// or their salts are gone — so the in-memory state cannot grow unboundedly.
    fn prune(&self, valid: &HashSet<u64>) {
        self.uploaded
            .lock()
            .unwrap()
            .retain(|id| valid.contains(id));
        self.failed
            .lock()
            .unwrap()
            .retain(|id, _| valid.contains(id));
    }

    /// Splits the pending set into matches that were never attempted and those
    /// whose retry cooldown has elapsed, so the caller can serve the fresh ones
    /// first. Both keep the newest-first order of the query.
    fn select_eligible(&self, pending: Vec<MatchSalts>) -> (Vec<MatchSalts>, Vec<MatchSalts>) {
        let now = tokio::time::Instant::now();
        let uploaded = self.uploaded.lock().unwrap();
        let failed = self.failed.lock().unwrap();
        let mut fresh = Vec::new();
        let mut retries = Vec::new();
        for s in pending {
            if uploaded.contains(&s.match_id) {
                continue;
            }
            match failed.get(&s.match_id) {
                None => fresh.push(s),
                Some(a) if a.count < MAX_ATTEMPTS && now >= a.next => retries.push(s),
                Some(_) => {}
            }
        }
        (fresh, retries)
    }
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
    let result = HTTP_CLIENT
        .get(&url)
        .send()
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
    max_size = 10_000,
    convert = r#"{ format!("{file_path}") }"#,
    key = "String"
)]
#[instrument(skip(store))]
async fn key_exists<S: ObjectStore + ?Sized>(store: &S, file_path: &Path) -> bool {
    debug!("Checking if key exists");
    store.head(file_path).await.is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn salts(match_id: u64) -> MatchSalts {
        MatchSalts {
            match_id,
            cluster_id: Some(1),
            metadata_salt: Some(2),
        }
    }

    #[test]
    fn retry_delay_backs_off_and_saturates() {
        assert_eq!(retry_delay(1), RETRY_INITIAL_INTERVAL);
        assert_eq!(retry_delay(2), RETRY_INITIAL_INTERVAL * 2);
        assert_eq!(retry_delay(3), RETRY_INITIAL_INTERVAL * 4);
        assert_eq!(retry_delay(u32::MAX), RETRY_MAX_INTERVAL);
    }

    #[tokio::test]
    async fn a_failed_match_is_held_back_until_its_cooldown_elapses() {
        let state = State::new();
        state.back_off(1);

        assert_eq!(state.select_eligible(vec![salts(1)]), (vec![], vec![]));
        // The entry survives pruning, so the cooldown is not lost while the match
        // is still pending, and it becomes eligible again once the delay elapses.
        state.prune(&HashSet::from([1]));
        assert_eq!(state.failed.lock().unwrap().len(), 1);
        state.failed.lock().unwrap().get_mut(&1).unwrap().next = tokio::time::Instant::now();
        assert_eq!(
            state.select_eligible(vec![salts(1)]),
            (vec![], vec![salts(1)])
        );
    }

    #[tokio::test]
    async fn a_match_that_never_arrives_is_parked_rather_than_retried_forever() {
        let state = State::new();
        for _ in 0..MAX_ATTEMPTS {
            state.back_off(1);
            state.failed.lock().unwrap().get_mut(&1).unwrap().next = tokio::time::Instant::now();
        }

        // Cooldown elapsed, but the attempt budget is spent, so it no longer
        // competes for download slots with matches that can still arrive.
        assert_eq!(state.select_eligible(vec![salts(1)]), (vec![], vec![]));
    }

    #[tokio::test]
    async fn uploading_clears_the_cooldown_and_skips_the_match() {
        let state = State::new();
        state.back_off(1);
        state.mark_uploaded(1);

        assert!(state.failed.lock().unwrap().is_empty());
        assert_eq!(state.select_eligible(vec![salts(1)]), (vec![], vec![]));
    }

    /// A backlog of retryable matches must never displace matches whose salts just
    /// arrived: fresh ones are reported separately so they can claim capacity first.
    #[tokio::test]
    async fn fresh_matches_are_kept_separate_from_the_retry_backlog() {
        let state = State::new();
        for id in [20, 30] {
            state.back_off(id);
            state.failed.lock().unwrap().get_mut(&id).unwrap().next = tokio::time::Instant::now();
        }

        // Newest first, as the pending query returns them.
        let (fresh, retries) =
            state.select_eligible(vec![salts(40), salts(30), salts(20), salts(10)]);

        assert_eq!(fresh, vec![salts(40), salts(10)]);
        assert_eq!(retries, vec![salts(30), salts(20)]);
    }

    /// `buffer_unordered` completes fast failures before slow successes, so results
    /// arrive in an order unrelated to the requested batch. Attributing them by
    /// position marks failed matches as uploaded, which excludes them from every
    /// later iteration because they never reach `match_player`.
    #[tokio::test]
    async fn results_are_attributed_by_match_id_not_by_position() {
        let state = State::new();
        let batch = [salts(10), salts(20), salts(30)];

        handle_results(
            &state,
            vec![
                (30, Err(anyhow::anyhow!("502 Bad Gateway"))),
                (10, Ok(())),
                (20, Err(anyhow::anyhow!("502 Bad Gateway"))),
            ],
        );

        assert_eq!(
            *state.uploaded.lock().unwrap(),
            HashSet::from([10]),
            "only the match that actually succeeded may be marked uploaded"
        );
        let failed = state.failed.lock().unwrap();
        assert!(failed.contains_key(&20) && failed.contains_key(&30));
        drop(failed);

        // The two failures stay candidates once their cooldown elapses.
        for id in [20, 30] {
            state.failed.lock().unwrap().get_mut(&id).unwrap().next = tokio::time::Instant::now();
        }
        assert_eq!(
            state.select_eligible(batch.to_vec()),
            (vec![], vec![salts(20), salts(30)])
        );
    }

    #[tokio::test]
    async fn state_is_dropped_once_a_match_leaves_the_pending_set() {
        let state = State::new();
        state.mark_uploaded(1);
        state.back_off(2);

        state.prune(&HashSet::new());

        assert!(state.uploaded.lock().unwrap().is_empty());
        assert!(state.failed.lock().unwrap().is_empty());
    }
}
