use core::time::Duration;

use service_utils::env_or;

/// Tuning from the environment, every value with a default.
#[derive(Debug, Clone)]
pub(crate) struct Config {
    /// Key prefix of the packs and sidecars in the pack bucket.
    pub(crate) prefix: String,
    /// S3 requests per second the packer may spend (GETs, PUTs, `DeleteObjects` calls), shared
    /// with production traffic from the same IP under Hetzner's 750/s per IP and per bucket.
    pub(crate) requests_per_s: u32,
    /// Packs built at the same time.
    pub(crate) jobs: usize,
    /// Source GETs in flight per job.
    pub(crate) fetch_concurrency: usize,
    /// A pack is sealed once its files add up to this many bytes...
    pub(crate) target_bytes: u64,
    /// ... or hold this many files.
    pub(crate) max_files: usize,
    /// A tail smaller than a full pack is sealed only once its oldest file waited this long.
    pub(crate) seal_after: Duration,
    /// Loose files are deleted this long after their pack was published, so a reader that missed
    /// the index just before still finds the loose object.
    pub(crate) delete_grace: Duration,
    /// How often the main bucket is listed for new files.
    pub(crate) inventory_interval: Duration,
    /// Every n-th pack is downloaded whole after its upload; the others are checked by `ETag`.
    pub(crate) read_back_every: u64,
    /// Stage the damage matrix columns of every packed file (see `dm`).
    pub(crate) dm_backfill: bool,
    /// Blocking threads a pack's damage matrix rows are built on.
    pub(crate) dm_threads: usize,
}

impl Config {
    pub(crate) fn from_env() -> Self {
        Self {
            prefix: env_or(
                "METADATA_PACKS_PREFIX",
                metadata_packs::DEFAULT_PREFIX.to_owned(),
            ),
            requests_per_s: env_or("METADATA_PACKER_REQUESTS_PER_S", 120),
            jobs: env_or("METADATA_PACKER_JOBS", 2),
            fetch_concurrency: env_or("METADATA_PACKER_FETCH_CONCURRENCY", 32),
            target_bytes: env_or("METADATA_PACKER_TARGET_BYTES", 512 * 1024 * 1024),
            max_files: env_or("METADATA_PACKER_MAX_FILES", 8000),
            seal_after: Duration::from_secs(env_or("METADATA_PACKER_SEAL_AFTER_S", 3600)),
            delete_grace: Duration::from_secs(env_or("METADATA_PACKER_DELETE_GRACE_S", 600)),
            read_back_every: env_or("METADATA_PACKER_READ_BACK_EVERY", 20),
            dm_backfill: env_or("METADATA_PACKER_DM_BACKFILL", false),
            dm_threads: env_or("METADATA_PACKER_DM_THREADS", 4),
            inventory_interval: Duration::from_secs(env_or(
                "METADATA_PACKER_INVENTORY_INTERVAL_S",
                600,
            )),
        }
    }
}
