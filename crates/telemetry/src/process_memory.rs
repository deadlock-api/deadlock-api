//! Exports the process's memory by owner every minute, so that when it grows the metrics show which
//! part grows:
//!
//! - `process_memory_bytes{kind}`: resident memory from `/proc/self/status` (`rss`, `anon`,
//!   `file`, `shmem`).
//! - `process_anon_memory_bytes{region}`: resident anonymous memory from `/proc/self/smaps`, by
//!   the shape of its mapping, which tells the allocators apart:
//!   - `large`: mappings of at least 256 MiB, mimalloc's arenas. mimalloc is the Rust global
//!     allocator of the services, so this is the Rust heap.
//!   - `glibc_heaps`: `[heap]` and the 64 MiB-aligned mappings of at most 64 MiB that glibc's
//!     malloc uses as per-thread arenas. C and C++ libraries (`DuckDB`, zstd, `BoringSSL`, ...)
//!     allocate there instead of through the Rust global allocator.
//!   - `other`: the rest (thread stacks, blocks malloc maps on their own, ...).

use core::time::Duration;

use tracing::{debug, warn};

const INTERVAL: Duration = Duration::from_mins(1);

/// The `/proc/self/status` fields exported, with their `kind` label.
const STATUS_FIELDS: [(&str, &str); 4] = [
    ("VmRSS:", "rss"),
    ("RssAnon:", "anon"),
    ("RssFile:", "file"),
    ("RssShmem:", "shmem"),
];

/// mimalloc reserves its arenas in 1 GiB steps; no other anonymous mapping gets this large.
const LARGE_MAPPING_BYTES: u64 = 256 << 20;
/// glibc's per-thread arenas are heaps of up to 64 MiB, aligned to their maximum size.
const GLIBC_HEAP_BYTES: u64 = 64 << 20;
const GLIBC_HEAP_ALIGN_BITS: u32 = GLIBC_HEAP_BYTES.trailing_zeros();

/// Starts the export loop on the current Tokio runtime.
pub fn spawn() {
    tokio::spawn(async {
        let mut interval = tokio::time::interval(INTERVAL);
        loop {
            interval.tick().await;
            // smaps lists thousands of mappings: parse it off the async workers.
            if let Err(e) = tokio::task::spawn_blocking(export).await {
                warn!("Process memory export task failed: {e}");
            }
        }
    });
}

#[expect(clippy::cast_precision_loss, reason = "gauges take f64")]
fn export() {
    match std::fs::read_to_string("/proc/self/status") {
        Ok(status) => {
            for (field, kind) in STATUS_FIELDS {
                if let Some(kib) = status_kib(&status, field) {
                    metrics::gauge!("process_memory_bytes", "kind" => kind)
                        .set(kib.saturating_mul(1024) as f64);
                }
            }
        }
        Err(e) => debug!("Cannot read /proc/self/status: {e}"),
    }
    match std::fs::read_to_string("/proc/self/smaps") {
        Ok(smaps) => {
            let regions = anon_regions_kib(&smaps);
            for (region, kib) in [
                ("large", regions.large),
                ("glibc_heaps", regions.glibc_heaps),
                ("other", regions.other),
            ] {
                metrics::gauge!("process_anon_memory_bytes", "region" => region)
                    .set(kib.saturating_mul(1024) as f64);
            }
        }
        Err(e) => debug!("Cannot read /proc/self/smaps: {e}"),
    }
}

/// The value in KiB of a `/proc/self/status` line such as `VmRSS:\t 6025412 kB`.
fn status_kib(status: &str, field: &str) -> Option<u64> {
    status
        .lines()
        .find_map(|line| line.strip_prefix(field))?
        .split_whitespace()
        .next()?
        .parse()
        .ok()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Region {
    Large,
    GlibcHeaps,
    Other,
}

/// A mapping header line of smaps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mapping {
    Anonymous(Region),
    /// File-backed, or a named kernel mapping such as `[stack]`.
    Other,
}

/// Resident anonymous memory in KiB per [`Region`].
#[derive(Debug, Default, PartialEq, Eq)]
struct AnonRegions {
    large: u64,
    glibc_heaps: u64,
    other: u64,
}

/// Sums the `Rss:` of each anonymous mapping in `smaps` by its [`Region`].
fn anon_regions_kib(smaps: &str) -> AnonRegions {
    let mut regions = AnonRegions::default();
    let mut current = None;
    for line in smaps.lines() {
        if let Some(mapping) = mapping(line) {
            current = match mapping {
                Mapping::Anonymous(region) => Some(region),
                Mapping::Other => None,
            };
        } else if let Some(region) = current
            && let Some(kib) = line.strip_prefix("Rss:").and_then(|rest| {
                rest.split_whitespace()
                    .next()
                    .and_then(|kib| kib.parse::<u64>().ok())
            })
        {
            let total = match region {
                Region::Large => &mut regions.large,
                Region::GlibcHeaps => &mut regions.glibc_heaps,
                Region::Other => &mut regions.other,
            };
            *total = total.saturating_add(kib);
        }
    }
    regions
}

/// The mapping a header line of smaps (`start-end perms offset dev inode [name]`) starts; `None`
/// for the other lines.
fn mapping(line: &str) -> Option<Mapping> {
    let mut fields = line.split_whitespace();
    let (start, end) = fields.next()?.split_once('-')?;
    let start = u64::from_str_radix(start, 16).ok()?;
    let end = u64::from_str_radix(end, 16).ok()?;
    let _perms = fields.next()?;
    let _offset = fields.next()?;
    let _dev = fields.next()?;
    let inode = fields.next()?;
    let name = fields.next();
    let size = end.checked_sub(start)?;
    Some(match (inode, name) {
        (_, Some("[heap]")) => Mapping::Anonymous(Region::GlibcHeaps),
        ("0", None) if size >= LARGE_MAPPING_BYTES => Mapping::Anonymous(Region::Large),
        ("0", None)
            if size <= GLIBC_HEAP_BYTES && start.trailing_zeros() >= GLIBC_HEAP_ALIGN_BITS =>
        {
            Mapping::Anonymous(Region::GlibcHeaps)
        }
        ("0", None) => Mapping::Anonymous(Region::Other),
        _ => Mapping::Other,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_fields_parse() {
        let status = "Name:\tdeadlock-api\nVmRSS:\t 6025412 kB\nRssAnon:\t 5300000 kB\n";
        assert_eq!(status_kib(status, "VmRSS:"), Some(6_025_412));
        assert_eq!(status_kib(status, "RssAnon:"), Some(5_300_000));
        assert_eq!(status_kib(status, "RssFile:"), None);
    }

    #[test]
    fn anonymous_mappings_split_by_shape() {
        let smaps = "\
7f0000000000-7f0040000000 rw-p 00000000 00:00 0
Size:            1048576 kB
Rss:              400000 kB
7f6224000000-7f6225940000 rw-p 00000000 00:00 0
Rss:               20000 kB
7f6225940000-7f6228000000 ---p 00000000 00:00 0
Rss:                   0 kB
55d000000000-55d000100000 rw-p 00000000 00:00 0                          [heap]
Rss:                1000 kB
7f6300001000-7f6300201000 rw-p 00000000 00:00 0
Rss:                 300 kB
7f6400000000-7f6400100000 r-xp 00000000 08:02 1234                       /usr/lib/libc.so.6
Rss:                5000 kB
7ffc00000000-7ffc00021000 rw-p 00000000 00:00 0                          [stack]
Rss:                  50 kB
";
        assert_eq!(
            anon_regions_kib(smaps),
            AnonRegions {
                large: 400_000,
                glibc_heaps: 21_000,
                other: 300,
            }
        );
    }

    #[test]
    fn own_process_parses() {
        let smaps = std::fs::read_to_string("/proc/self/smaps").unwrap();
        let regions = anon_regions_kib(&smaps);
        assert!(regions.large + regions.glibc_heaps + regions.other > 0);
    }
}
