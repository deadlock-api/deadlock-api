//! The disk tier of the query caches: one file per cached result, in a directory shared by all
//! API instances (`CH_CACHE_PATH`, a Docker volume mounted into each).
//!
//! A file is `<dir>/<cache name>/<key as 32 hex digits>`: a header of the format version and the
//! entry's deadline (Unix seconds, little endian), then the result as named `MessagePack`,
//! zstd-compressed. Named fields make a result whose row type changed between releases fail to
//! decode (a miss) instead of being misread. Files are written to a temporary name and renamed,
//! so readers on any instance only see complete files. Expired files are deleted by a pruner on
//! every instance; races between them are harmless.

use core::sync::atomic::{AtomicU64, Ordering};
use core::time::Duration;
use std::io::{ErrorKind, Read as _};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::SystemTime;

use serde::de::DeserializeOwned;
use tokio::sync::Semaphore;
use tokio_util::task::TaskTracker;
use tracing::{debug, info, warn};

const FORMAT_VERSION: u8 = 1;
const HEADER_LEN: usize = 1 + 8;
const ZSTD_LEVEL: i32 = 3;
/// Writes in flight at once; a result arriving while all are busy is not persisted.
const MAX_CONCURRENT_WRITES: usize = 4;
const PRUNE_INTERVAL: Duration = Duration::from_mins(10);
/// A temporary file older than this was left behind by a crashed write.
const STALE_TMP_AGE: Duration = Duration::from_hours(1);

static GLOBAL: OnceLock<DiskTier> = OnceLock::new();

/// Enables the process-wide disk tier in `dir` and starts its pruner.
pub(crate) fn init(dir: PathBuf) {
    if let Err(e) = std::fs::create_dir_all(&dir) {
        warn!("Query cache disk tier disabled, cannot create {dir:?}: {e}");
        return;
    }
    info!("Query cache disk tier in {dir:?}");
    if GLOBAL.set(DiskTier::new(dir)).is_ok()
        && let Some(tier) = GLOBAL.get()
    {
        tokio::spawn(tier.prune_loop());
    }
}

/// The process-wide disk tier, if [`init`] enabled one.
pub(crate) fn global() -> Option<&'static DiskTier> {
    GLOBAL.get()
}

pub(crate) struct DiskTier {
    dir: PathBuf,
    writes: Arc<Semaphore>,
    tasks: TaskTracker,
}

impl DiskTier {
    pub(crate) fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            writes: Arc::new(Semaphore::new(MAX_CONCURRENT_WRITES)),
            tasks: TaskTracker::new(),
        }
    }

    fn path(&self, cache: &str, key: u128) -> PathBuf {
        self.dir.join(cache).join(format!("{key:032x}"))
    }

    /// The stored result of `key`, its deadline and its encoded size, if one is stored, unexpired
    /// and decodable.
    pub(crate) async fn load<T>(&self, cache: &str, key: u128) -> Option<(T, SystemTime, usize)>
    where
        T: DeserializeOwned + Send + 'static,
    {
        let path = self.path(cache, key);
        let read = tokio::task::spawn_blocking(move || read_entry::<T>(&path)).await;
        let (result, entry) = match read {
            Ok(Ok(Some(entry))) => ("hit", Some(entry)),
            Ok(Ok(None)) => ("expired", None),
            Ok(Err(e)) if e.kind() == ErrorKind::NotFound => ("miss", None),
            Ok(Err(e)) => {
                warn!("Failed to read query cache entry {cache}/{key:032x}: {e}");
                ("error", None)
            }
            Err(e) => {
                warn!("Query cache read task failed: {e}");
                ("error", None)
            }
        };
        metrics::counter!("ch_cache_disk_reads", "result" => result).increment(1);
        entry
    }

    /// Stores `encoded` (a result as named `MessagePack`) as the result of `key` in the
    /// background. Dropped if too many writes are in flight: the disk tier is an optimization.
    pub(crate) fn store(&self, cache: &str, key: u128, expires_at: SystemTime, encoded: Vec<u8>) {
        let Ok(permit) = Arc::clone(&self.writes).try_acquire_owned() else {
            metrics::counter!("ch_cache_disk_writes", "result" => "dropped").increment(1);
            return;
        };
        let path = self.path(cache, key);
        self.tasks.spawn_blocking(move || {
            let _permit = permit;
            let result = match write_entry(&path, expires_at, &encoded) {
                Ok(()) => "ok",
                Err(e) => {
                    warn!("Failed to write query cache entry {path:?}: {e}");
                    "error"
                }
            };
            metrics::counter!("ch_cache_disk_writes", "result" => result).increment(1);
        });
    }

    /// Waits for the background writes started so far.
    #[cfg(test)]
    pub(crate) async fn flush(&self) {
        self.tasks.close();
        self.tasks.wait().await;
        self.tasks.reopen();
    }

    #[expect(
        clippy::infinite_loop,
        reason = "prunes for the lifetime of the process"
    )]
    async fn prune_loop(&'static self) {
        let mut interval = tokio::time::interval(PRUNE_INTERVAL);
        loop {
            interval.tick().await;
            let dir = self.dir.clone();
            match tokio::task::spawn_blocking(move || prune(&dir, SystemTime::now())).await {
                Ok(removed) => debug!(removed, "Pruned query cache disk tier"),
                Err(e) => warn!("Query cache prune task failed: {e}"),
            }
        }
    }
}

fn unix_secs(time: SystemTime) -> u64 {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

fn header(expires_at: SystemTime) -> [u8; HEADER_LEN] {
    let mut header = [0; HEADER_LEN];
    header[0] = FORMAT_VERSION;
    header[1..].copy_from_slice(&unix_secs(expires_at).to_le_bytes());
    header
}

/// The deadline in `header`, or `None` for another format version.
fn parse_header(header: &[u8; HEADER_LEN]) -> Option<SystemTime> {
    if header[0] != FORMAT_VERSION {
        return None;
    }
    let secs = u64::from_le_bytes(header[1..].try_into().ok()?);
    SystemTime::UNIX_EPOCH.checked_add(Duration::from_secs(secs))
}

fn invalid_data(e: impl core::error::Error + Send + Sync + 'static) -> std::io::Error {
    std::io::Error::new(ErrorKind::InvalidData, e)
}

/// The entry, its deadline and its encoded size; `Ok(None)` for an expired entry or one of
/// another format version.
fn read_entry<T: DeserializeOwned>(path: &Path) -> std::io::Result<Option<(T, SystemTime, usize)>> {
    let mut file = std::fs::File::open(path)?;
    let mut header = [0; HEADER_LEN];
    file.read_exact(&mut header)?;
    let Some(expires_at) = parse_header(&header).filter(|&t| t > SystemTime::now()) else {
        return Ok(None);
    };
    let bytes = zstd::decode_all(file)?;
    let value = rmp_serde::from_slice(&bytes).map_err(invalid_data)?;
    Ok(Some((value, expires_at, bytes.len())))
}

fn write_entry(path: &Path, expires_at: SystemTime, encoded: &[u8]) -> std::io::Result<()> {
    static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    let mut contents = header(expires_at).to_vec();
    contents.extend(zstd::bulk::compress(encoded, ZSTD_LEVEL)?);

    let dir = path
        .parent()
        .ok_or_else(|| invalid_data(core::fmt::Error))?;
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join(format!(
        ".{}.{}.{}.tmp",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default(),
        std::process::id(),
        TMP_COUNTER.fetch_add(1, Ordering::Relaxed),
    ));
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, path).inspect_err(|_| {
        // Best effort; the rename error is the one worth reporting.
        if let Err(e) = std::fs::remove_file(&tmp) {
            debug!("Failed to remove query cache temp file {tmp:?}: {e}");
        }
    })
}

/// Whether the file at `path` should be deleted at `now`: an expired or foreign-format entry, or
/// a temporary file left behind by a crashed write.
fn is_prunable(path: &Path, now: SystemTime) -> bool {
    let is_tmp = path.extension().is_some_and(|ext| ext == "tmp");
    if is_tmp {
        return std::fs::metadata(path)
            .and_then(|m| m.modified())
            .is_ok_and(|modified| {
                now.duration_since(modified).unwrap_or_default() > STALE_TMP_AGE
            });
    }
    let mut header = [0; HEADER_LEN];
    let Ok(()) = std::fs::File::open(path).and_then(|mut f| f.read_exact(&mut header)) else {
        return true;
    };
    parse_header(&header).is_none_or(|expires_at| expires_at <= now)
}

/// Deletes the prunable files under `dir`; returns how many.
fn prune(dir: &Path, now: SystemTime) -> usize {
    let Ok(caches) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0_usize;
    for cache in caches.flatten().filter(|e| e.path().is_dir()) {
        let Ok(files) = std::fs::read_dir(cache.path()) else {
            continue;
        };
        for file in files.flatten() {
            let path = file.path();
            if is_prunable(&path, now) && std::fs::remove_file(&path).is_ok() {
                removed = removed.saturating_add(1);
            }
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use serde::Serialize;

    use super::*;

    fn write_value<T: Serialize>(path: &Path, expires_at: SystemTime, value: &T) {
        write_entry(path, expires_at, &rmp_serde::to_vec_named(value).unwrap()).unwrap();
    }

    fn in_secs(secs: u64) -> SystemTime {
        // Whole seconds, as the header stores them.
        SystemTime::UNIX_EPOCH + Duration::from_secs(unix_secs(SystemTime::now()) + secs)
    }

    #[test]
    fn entries_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache").join("key");
        let expires_at = in_secs(60);
        let value = vec![(1u32, "a".to_owned())];
        write_value(&path, expires_at, &value);
        let (read, read_expires_at, encoded_len) =
            read_entry::<Vec<(u32, String)>>(&path).unwrap().unwrap();
        assert_eq!(read, value);
        assert_eq!(read_expires_at, expires_at);
        assert_eq!(encoded_len, rmp_serde::to_vec_named(&value).unwrap().len());
    }

    #[test]
    fn expired_entries_read_as_none() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache").join("key");
        write_value(
            &path,
            SystemTime::UNIX_EPOCH + Duration::from_secs(1),
            &1u32,
        );
        assert!(read_entry::<u32>(&path).unwrap().is_none());
    }

    #[test]
    fn changed_row_types_fail_to_decode() {
        #[derive(Serialize)]
        struct Old {
            wins: u32,
        }
        #[derive(serde::Deserialize, Debug)]
        #[expect(dead_code, reason = "only decoded to check the failure")]
        struct New {
            wins: u32,
            losses: u32,
        }
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache").join("key");
        write_value(&path, in_secs(60), &vec![Old { wins: 1 }]);
        let err = read_entry::<Vec<New>>(&path).unwrap_err();
        assert_eq!(err.kind(), ErrorKind::InvalidData);
    }

    #[test]
    fn prune_removes_expired_foreign_and_stale_files_only() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        write_value(&cache.join("live"), in_secs(60), &1u32);
        write_value(&cache.join("expired"), in_secs(0), &1u32);
        std::fs::write(cache.join("foreign"), [FORMAT_VERSION + 1; HEADER_LEN]).unwrap();
        std::fs::write(cache.join(".fresh.tmp"), b"partial").unwrap();

        let now = in_secs(1);
        assert_eq!(prune(dir.path(), now), 2);
        assert!(cache.join("live").exists());
        assert!(cache.join(".fresh.tmp").exists());

        assert_eq!(
            prune(dir.path(), now + STALE_TMP_AGE + Duration::from_secs(1)),
            2
        );
        assert!(!cache.join(".fresh.tmp").exists());
    }

    #[tokio::test]
    async fn store_then_load() {
        let dir = tempfile::tempdir().unwrap();
        let tier = DiskTier::new(dir.path().to_owned());
        let encoded = rmp_serde::to_vec_named(&vec![1u64, 2]).unwrap();
        tier.store("cache", 42, in_secs(60), encoded);
        tier.flush().await;
        let (value, _, _) = tier.load::<Vec<u64>>("cache", 42).await.unwrap();
        assert_eq!(value, vec![1, 2]);
        assert!(tier.load::<Vec<u64>>("cache", 43).await.is_none());
    }
}
