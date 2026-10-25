//! R2-backed loader for versioned source assets.
//!
//! Files live under `assets-api-res/versions/<version>/<path>.zst` and are
//! zstd-compressed. The store fetches, decompresses, and caches them in
//! memory. Listing the version directory yields the set of known patches.

use core::time::Duration;
use std::io::Read;
use std::sync::Arc;
use std::time::Instant;

use arc_swap::ArcSwap;
use bytes::Bytes;
use cached::macros::cached;
use object_store::aws::AmazonS3;
use object_store::{ObjectStore, ObjectStoreExt, path::Path as ObjectPath};
use thiserror::Error;
use tokio::sync::Mutex;
use tracing::debug;

/// Root prefix in the bucket. Every versioned file lives below it.
pub(crate) const VERSIONS_PREFIX: &str = "assets-api-res/versions";

#[derive(Debug, Error)]
pub(crate) enum VersionStoreError {
    #[error("object store error: {0}")]
    ObjectStore(#[from] object_store::Error),
    #[error("decompression error: {0}")]
    Decompress(#[from] std::io::Error),
    #[error("no versions found in bucket")]
    NoVersions,
    #[error("invalid utf-8 in asset: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),
}

impl VersionStoreError {
    /// Whether the requested object doesn't exist in the bucket.
    pub(crate) fn is_not_found(&self) -> bool {
        matches!(
            self,
            Self::ObjectStore(object_store::Error::NotFound { .. })
        )
    }
}

/// Shortest gap between a listing and one triggered by a request for an
/// unknown version. Caps what made-up `client_version`s cost in R2 LISTs, at
/// the price of a fresh patch 404ing for up to this long after its upload.
const ON_DEMAND_COOLDOWN: Duration = Duration::from_mins(1);

/// Cached listing of versions plus the latest one. Refreshed in the background.
#[derive(Clone, Default)]
pub(crate) struct VersionStore {
    versions: Arc<ArcSwap<Vec<u32>>>,
    /// Singleflight guard: any task that wants to hit R2 for a fresh listing
    /// must hold this lock. Holds the time of the last successful listing.
    refresh_lock: Arc<Mutex<Option<Instant>>>,
}

impl VersionStore {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Spawn a background task that refreshes the version list periodically.
    pub(crate) fn spawn_refresh_loop(&self, r2: AmazonS3) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_mins(15)).await;
                if let Err(e) = this.refresh_now(&r2).await {
                    tracing::warn!("Failed to refresh versions: {e}");
                }
            }
        });
    }

    /// Ensure the version list is populated. Singleflighted: concurrent
    /// callers wait on the same R2 fetch instead of racing N times.
    pub(crate) async fn ensure_loaded(&self, r2: &AmazonS3) -> Result<(), VersionStoreError> {
        if !self.versions.load().is_empty() {
            return Ok(());
        }
        let mut last_listed = self.refresh_lock.lock().await;
        // Re-check now that we hold the lock: another task may have filled
        // the list while we waited.
        if !self.versions.load().is_empty() {
            return Ok(());
        }
        self.load_locked(r2, &mut last_listed).await
    }

    /// Force a fresh listing from R2. Used by the background refresh loop.
    pub(crate) async fn refresh_now(&self, r2: &AmazonS3) -> Result<(), VersionStoreError> {
        let mut last_listed = self.refresh_lock.lock().await;
        self.load_locked(r2, &mut last_listed).await
    }

    /// Refresh for a request naming `version`, which isn't in the cached list,
    /// so a freshly published patch doesn't 404 until the next scheduled
    /// refresh. Lists R2 only if [`needs_listing`] says so; callers that waited
    /// behind a listing reuse its result.
    pub(crate) async fn refresh_for(
        &self,
        r2: &AmazonS3,
        version: u32,
    ) -> Result<(), VersionStoreError> {
        let mut last_listed = self.refresh_lock.lock().await;
        if !needs_listing(self.latest(), *last_listed, version, Instant::now()) {
            return Ok(());
        }
        self.load_locked(r2, &mut last_listed).await
    }

    /// Caller must hold `refresh_lock`. Lists R2, swaps the cached list and
    /// records the time of the listing in `last_listed`.
    async fn load_locked(
        &self,
        r2: &AmazonS3,
        last_listed: &mut Option<Instant>,
    ) -> Result<(), VersionStoreError> {
        let v = list_versions_raw(r2).await?;
        if v.is_empty() {
            return Err(VersionStoreError::NoVersions);
        }
        debug!("Refreshed version list: {} versions", v.len());
        self.versions.store(Arc::new(v));
        *last_listed = Some(Instant::now());
        Ok(())
    }

    pub(crate) fn latest(&self) -> Option<u32> {
        self.versions.load().last().copied()
    }

    pub(crate) fn all(&self) -> Arc<Vec<u32>> {
        self.versions.load_full()
    }

    pub(crate) fn contains(&self, v: u32) -> bool {
        self.versions.load().contains(&v)
    }
}

/// Whether a request for the unlisted `version` should list R2. Only versions
/// above the latest can still appear: the upload pipeline uploads the current
/// Steam build and never backfills older ones. Even those list at most once
/// per [`ON_DEMAND_COOLDOWN`], since a made-up number can be above the latest.
fn needs_listing(
    latest: Option<u32>,
    last_listed: Option<Instant>,
    version: u32,
    now: Instant,
) -> bool {
    latest.is_none_or(|latest| version > latest)
        && last_listed.is_none_or(|t| now.duration_since(t) >= ON_DEMAND_COOLDOWN)
}

async fn list_versions_raw(r2: &AmazonS3) -> Result<Vec<u32>, VersionStoreError> {
    let prefix = ObjectPath::from(VERSIONS_PREFIX);
    let mut out = Vec::new();
    let mut stream = r2.list_with_delimiter(Some(&prefix)).await?;
    for cp in stream.common_prefixes.drain(..) {
        if let Some(seg) = cp.as_ref().rsplit('/').find(|s| !s.is_empty())
            && let Ok(v) = seg.parse::<u32>()
        {
            out.push(v);
        }
    }
    out.sort_unstable();
    out.dedup();
    Ok(out)
}

/// Fetch a versioned file by its sub-path (e.g. `scripts/heroes.vdata`).
/// The `.zst` suffix is appended automatically and decompression happens here.
pub(crate) async fn fetch_decompressed(
    r2: &AmazonS3,
    version: u32,
    rel_path: &str,
) -> Result<Bytes, VersionStoreError> {
    fetch_decompressed_cached(r2, version, rel_path.to_owned()).await
}

#[cached(
    max_size = 256,
    ttl_secs = 3600,
    convert = r#"{ (version, rel_path.clone()) }"#,
    key = "(u32, String)",
    result_fallback = true
)]
async fn fetch_decompressed_cached(
    r2: &AmazonS3,
    version: u32,
    rel_path: String,
) -> Result<Bytes, VersionStoreError> {
    fetch_zst(r2, &format!("{VERSIONS_PREFIX}/{version}/{rel_path}.zst")).await
}

/// Fetch a zstd-compressed object by its full bucket key and decompress it.
pub(crate) async fn fetch_zst(r2: &AmazonS3, key: &str) -> Result<Bytes, VersionStoreError> {
    debug!("Fetching asset: {key}");
    let res = r2.get(&ObjectPath::from(key.to_owned())).await?;
    let compressed = res.bytes().await?;
    // Decompressing a multi-MB vdata/localization file is CPU work; keep it off the async workers.
    tokio::task::spawn_blocking(move || decompress_zst(&compressed))
        .await
        .map_err(std::io::Error::other)?
        .map_err(Into::into)
}

/// Decompresses the first zstd frame of `compressed`.
fn decompress_zst(compressed: &[u8]) -> std::io::Result<Bytes> {
    let mut out = Vec::with_capacity(compressed.len() * 4);
    zstd::stream::read::Decoder::new(compressed)?
        .single_frame()
        .read_to_end(&mut out)?;
    Ok(Bytes::from(out))
}

/// Fetch a versioned file and return it as a UTF-8 string.
pub(crate) async fn fetch_text(
    r2: &AmazonS3,
    version: u32,
    rel_path: &str,
) -> Result<String, VersionStoreError> {
    let bytes = fetch_decompressed(r2, version, rel_path).await?;
    Ok(String::from_utf8(bytes.to_vec())?)
}

#[cfg(test)]
mod tests {
    use core::fmt::Write as _;
    use core::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    #[test]
    fn versions_at_or_below_latest_never_list() {
        let now = Instant::now();
        assert!(!needs_listing(Some(5263), None, 1, now));
        assert!(!needs_listing(Some(5263), None, 5045, now));
        assert!(!needs_listing(Some(5263), None, 5263, now));
    }

    #[test]
    fn newer_versions_list_once_per_cooldown() {
        let last = Instant::now();
        assert!(needs_listing(Some(5263), None, 5264, last));
        assert!(!needs_listing(Some(5263), Some(last), 5264, last));
        assert!(!needs_listing(
            Some(5263),
            Some(last),
            99_999_999,
            last + ON_DEMAND_COOLDOWN / 2
        ));
        assert!(needs_listing(
            Some(5263),
            Some(last),
            5264,
            last + ON_DEMAND_COOLDOWN
        ));
    }

    #[test]
    fn empty_listing_always_lists() {
        assert!(needs_listing(None, None, 1, Instant::now()));
    }

    /// Fake S3 that answers every request with a slow listing of `versions`
    /// and counts the requests.
    async fn fake_r2(versions: Arc<std::sync::Mutex<Vec<u32>>>) -> (AmazonS3, Arc<AtomicUsize>) {
        let lists = Arc::new(AtomicUsize::new(0));
        let counter = lists.clone();
        let app = axum::Router::new().fallback(move || {
            let versions = versions.clone();
            let counter = counter.clone();
            async move {
                counter.fetch_add(1, Ordering::SeqCst);
                let mut body = String::from("<ListBucketResult><IsTruncated>false</IsTruncated>");
                for v in versions.lock().unwrap().iter() {
                    write!(
                        body,
                        "<CommonPrefixes><Prefix>{VERSIONS_PREFIX}/{v}/</Prefix></CommonPrefixes>"
                    )
                    .unwrap();
                }
                body += "</ListBucketResult>";
                tokio::time::sleep(Duration::from_millis(200)).await;
                body
            }
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await });
        let r2 = object_store::aws::AmazonS3Builder::new()
            .with_region("auto")
            .with_bucket_name("test")
            .with_access_key_id("test")
            .with_secret_access_key("test")
            .with_endpoint(endpoint)
            .with_allow_http(true)
            .build()
            .unwrap();
        (r2, lists)
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_misses_for_a_new_version_share_one_listing() {
        let versions = Arc::new(std::sync::Mutex::new(vec![100]));
        let (r2, lists) = fake_r2(versions.clone()).await;
        let store = VersionStore::new();
        store.ensure_loaded(&r2).await.unwrap();
        assert_eq!(lists.load(Ordering::SeqCst), 1);
        // Let the on-demand cooldown run out.
        *store.refresh_lock.lock().await = Instant::now().checked_sub(ON_DEMAND_COOLDOWN);

        versions.lock().unwrap().push(101);
        let tasks: Vec<_> = (0..20)
            .map(|_| {
                let (store, r2) = (store.clone(), r2.clone());
                tokio::spawn(async move { store.refresh_for(&r2, 101).await })
            })
            .collect();
        for t in tasks {
            t.await.unwrap().unwrap();
        }

        assert!(store.contains(101));
        assert_eq!(lists.load(Ordering::SeqCst), 2);
    }
}
