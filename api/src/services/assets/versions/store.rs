//! R2-backed loader for versioned source assets.
//!
//! Files live under `assets-api-res/versions/<version>/<path>.zst` and are
//! zstd-compressed. The store fetches, decompresses, and caches them in
//! memory. Listing the version directory yields the set of known patches.

use core::sync::atomic::{AtomicU64, Ordering};
use core::time::Duration;
use std::io::Read;
use std::sync::Arc;

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

/// Cached listing of versions plus the latest one. Refreshed in the background.
#[derive(Clone, Default)]
pub(crate) struct VersionStore {
    versions: Arc<ArcSwap<Vec<u32>>>,
    /// Singleflight guard: any task that wants to hit R2 for a fresh listing
    /// must hold this lock. Concurrent first-callers collapse into one fetch.
    refresh_lock: Arc<Mutex<()>>,
    /// Listings begun so far, and the number of the newest one that succeeded. A caller that
    /// waited for the lock can tell whether a listing that began after it asked has landed.
    lists_started: Arc<AtomicU64>,
    newest_listed: Arc<AtomicU64>,
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
        let _guard = self.refresh_lock.lock().await;
        // Re-check now that we hold the lock: another task may have filled
        // the list while we waited.
        if !self.versions.load().is_empty() {
            return Ok(());
        }
        self.load_locked(r2).await
    }

    /// Force a fresh listing from R2. Singleflighted with `ensure_loaded` so
    /// a burst of cache misses for a just-published version collapses to at
    /// most two R2 list calls: the one in flight and one after it.
    pub(crate) async fn refresh_now(&self, r2: &AmazonS3) -> Result<(), VersionStoreError> {
        let asked_after = self.lists_started.load(Ordering::Acquire);
        let _guard = self.refresh_lock.lock().await;
        // A listing that began after we asked is as fresh as our own would be. One that was
        // already running may predate the version we are looking for.
        if self.newest_listed.load(Ordering::Acquire) > asked_after {
            return Ok(());
        }
        self.load_locked(r2).await
    }

    /// Caller must hold `refresh_lock`. Lists R2 and swaps the cached list.
    async fn load_locked(&self, r2: &AmazonS3) -> Result<(), VersionStoreError> {
        let listing = self.lists_started.fetch_add(1, Ordering::AcqRel) + 1;
        let v = list_versions_raw(r2).await?;
        if v.is_empty() {
            return Err(VersionStoreError::NoVersions);
        }
        debug!("Refreshed version list: {} versions", v.len());
        self.versions.store(Arc::new(v));
        self.newest_listed.store(listing, Ordering::Release);
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

    use object_store::aws::AmazonS3Builder;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use super::*;

    /// A local bucket whose `n`-th LIST (from 0) answers `versions(n)` after 100 ms, and the
    /// number of LISTs it has served.
    async fn fake_bucket(versions: fn(usize) -> Vec<u32>) -> (AmazonS3, Arc<AtomicUsize>) {
        let lists = Arc::new(AtomicUsize::new(0));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let served = lists.clone();
        tokio::spawn(async move {
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                let served = served.clone();
                tokio::spawn(async move {
                    let mut buf = vec![0; 8192];
                    while let Ok(n) = socket.read(&mut buf).await
                        && n > 0
                    {
                        let listed = versions(served.fetch_add(1, Ordering::SeqCst));
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        let prefixes = listed.iter().fold(String::new(), |mut out, v| {
                            write!(out, "<CommonPrefixes><Prefix>{VERSIONS_PREFIX}/{v}/</Prefix></CommonPrefixes>").unwrap();
                            out
                        });
                        let body = format!(
                            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ListBucketResult><Name>b</Name>\
                             <Prefix>{VERSIONS_PREFIX}/</Prefix><Delimiter>/</Delimiter>\
                             <IsTruncated>false</IsTruncated>{prefixes}</ListBucketResult>"
                        );
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{body}",
                            body.len()
                        );
                        if socket.write_all(resp.as_bytes()).await.is_err() {
                            return;
                        }
                    }
                });
            }
        });
        let r2 = AmazonS3Builder::new()
            .with_region("auto")
            .with_bucket_name("b")
            .with_access_key_id("x")
            .with_secret_access_key("y")
            .with_endpoint(format!("http://{addr}"))
            .with_allow_http(true)
            .build()
            .unwrap();
        (r2, lists)
    }

    /// Twenty requests for a version that isn't listed yet: they made twenty listings one
    /// after another, each waiting for the last. Now it is the first listing, plus at most one
    /// shared by those that came in while it ran.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_refreshes_share_listings() {
        let (r2, lists) = fake_bucket(|_| vec![100]).await;
        let store = VersionStore::new();
        let tasks: Vec<_> = (0..20)
            .map(|_| {
                let (store, r2) = (store.clone(), r2.clone());
                tokio::spawn(async move { store.refresh_now(&r2).await.map_err(|e| e.to_string()) })
            })
            .collect();
        for t in tasks {
            t.await.unwrap().unwrap();
        }
        assert!(lists.load(Ordering::SeqCst) <= 2);
        assert_eq!(*store.all(), vec![100]);
    }

    /// A listing that was already running when a request came in may predate the version the
    /// request asks for, so the request still lists again.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn a_listing_already_running_does_not_answer_a_later_request() {
        // Version 101 is published while the first LIST is in flight.
        let (r2, lists) = fake_bucket(|n| if n == 0 { vec![100] } else { vec![100, 101] }).await;
        let store = VersionStore::new();
        let first = tokio::spawn({
            let (store, r2) = (store.clone(), r2.clone());
            async move { store.refresh_now(&r2).await.map_err(|e| e.to_string()) }
        });
        while lists.load(Ordering::SeqCst) == 0 {
            tokio::task::yield_now().await;
        }
        store.refresh_now(&r2).await.unwrap();
        first.await.unwrap().unwrap();
        assert_eq!(lists.load(Ordering::SeqCst), 2);
        assert!(store.contains(101));
    }
}
