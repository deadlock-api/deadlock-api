//! The tiers of the `cached_ch_query!` caches ([`clickhouse_utils::cache`]).

use std::sync::Arc;

use clickhouse_utils::cache::{DiskTier, MemoryTier, Tiers};
use tracing::{info, warn};

const MIB: u64 = 1024 * 1024;

/// Installs the process-wide cache tiers: a memory tier of `CH_CACHE_MEMORY_MB` (default 2 GiB)
/// and, if `CH_CACHE_PATH` is set, a disk tier there, shared by all instances so a restarted one
/// does not re-run every cached query. Unset (local runs, tests): memory only.
pub(crate) fn init() {
    let default_mb = MemoryTier::DEFAULT_BUDGET_BYTES / MIB;
    let memory_mb = std::env::var("CH_CACHE_MEMORY_MB").map_or(default_mb, |value| {
        value.parse().unwrap_or_else(|e| {
            warn!("Invalid CH_CACHE_MEMORY_MB {value:?} ({e}), using {default_mb}");
            default_mb
        })
    });
    let memory = Arc::new(MemoryTier::new(memory_mb.saturating_mul(MIB)));
    let disk = std::env::var_os("CH_CACHE_PATH").and_then(|dir| match DiskTier::open(&dir) {
        Ok(disk) => {
            info!("Query cache disk tier in {dir:?}");
            Some(Arc::new(disk))
        }
        Err(e) => {
            warn!("Query cache disk tier disabled, cannot create {dir:?}: {e}");
            None
        }
    });
    if (Tiers { memory, disk }).install().is_err() {
        warn!("Query cache tiers were already in use, not installing them");
        return;
    }
    let tiers = Tiers::global();
    Arc::clone(&tiers.memory).spawn_metrics();
    if let Some(disk) = &tiers.disk {
        Arc::clone(disk).spawn_pruner();
    }
}
