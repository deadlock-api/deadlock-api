//! Valve's replay-server files: their URLs and their container format.
//!
//! Valve serves both match metadata and demos under `.bz2` filenames, but switched the
//! actual compression to zstd for matches from 2026-07-20 19:00 UTC onward. Older matches
//! are still bzip2, so the container has to be detected from the magic bytes rather than
//! taken from the file extension.

pub(crate) const ZSTD_MAGIC: [u8; 4] = [0x28, 0xb5, 0x2f, 0xfd];

/// Whether `data` starts with the zstd frame magic.
pub(crate) fn is_zstd(data: &[u8]) -> bool {
    data.starts_with(&ZSTD_MAGIC)
}

/// URL of a match's `.{extension}.bz2` file (`meta` or `dem`) on Valve's replay servers.
pub(crate) fn replay_file_url(
    cluster_id: u32,
    match_id: u64,
    salt: u32,
    extension: &str,
) -> String {
    format!("http://replay{cluster_id}.valve.net/1422450/{match_id}_{salt}.{extension}.bz2")
}
