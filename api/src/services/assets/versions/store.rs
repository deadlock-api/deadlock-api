//! R2-backed loader for versioned source assets.
//!
//! Files live under `assets-api-res/versions/<version>/<path>.zst` and are
//! zstd-compressed. The store fetches, decompresses, and caches them in
//! memory. Listing the version directory yields the set of known patches.

use std::sync::Arc;
use std::time::Duration;

use arc_swap::ArcSwap;
use async_compression::tokio::bufread::ZstdDecoder;
use bytes::Bytes;
use cached::TtlCache;
use cached::macros::cached;
use object_store::aws::AmazonS3;
use object_store::{ObjectStore, ObjectStoreExt, path::Path as ObjectPath};
use thiserror::Error;
use tokio::io::AsyncReadExt;
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

/// Cached listing of versions plus the latest one. Refreshed in the background.
#[derive(Clone, Default)]
pub(crate) struct VersionStore {
    versions: Arc<ArcSwap<Vec<u32>>>,
    /// Singleflight guard: any task that wants to hit R2 for a fresh listing
    /// must hold this lock. Concurrent first-callers collapse into one fetch.
    refresh_lock: Arc<Mutex<()>>,
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
                tokio::time::sleep(Duration::from_secs(15 * 60)).await;
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
    /// a burst of cache misses for a just-published version collapses to one
    /// R2 list call. Returns the (possibly updated) state.
    pub(crate) async fn refresh_now(&self, r2: &AmazonS3) -> Result<(), VersionStoreError> {
        let _guard = self.refresh_lock.lock().await;
        self.load_locked(r2).await
    }

    /// Caller must hold `refresh_lock`. Lists R2 and swaps the cached list.
    async fn load_locked(&self, r2: &AmazonS3) -> Result<(), VersionStoreError> {
        let v = list_versions_raw(r2).await?;
        if v.is_empty() {
            return Err(VersionStoreError::NoVersions);
        }
        debug!("Refreshed version list: {} versions", v.len());
        self.versions.store(Arc::new(v));
        Ok(())
    }

    pub(crate) fn latest(&self) -> Option<u32> {
        self.versions.load().last().copied()
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
    ty = "TtlCache<(u32, String), Bytes>",
    create = "{ TtlCache::with_ttl(Duration::from_secs(60 * 60)) }",
    convert = r#"{ (version, rel_path.clone()) }"#,
    result = true,
    sync_writes = "by_key"
)]
async fn fetch_decompressed_cached(
    r2: &AmazonS3,
    version: u32,
    rel_path: String,
) -> Result<Bytes, VersionStoreError> {
    let key = format!("{VERSIONS_PREFIX}/{version}/{rel_path}.zst");
    debug!("Fetching versioned asset: {key}");
    let res = r2.get(&ObjectPath::from(key)).await?;
    let compressed = res.bytes().await?;
    let mut decoder = ZstdDecoder::new(std::io::Cursor::new(compressed.as_ref()));
    let mut out = Vec::with_capacity(compressed.len() * 4);
    decoder.read_to_end(&mut out).await?;
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
