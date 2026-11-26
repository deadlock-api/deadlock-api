//! Match metadata files (`{match_id}.meta.bz2` and friends) packed into large immutable objects.
//!
//! A pack (`{prefix}/{pack_id:010}.pack`) is the concatenation of whole files, byte for byte as
//! they were stored (bzip2 or zstd). Its sidecar
//! (`{prefix}/{pack_id:010}.idx`, see [`format`]) lists every file's offset, length, crc and the
//! source object's md5. The sidecar is written only after the pack was read back from the bucket
//! and matched what was built, so a valid sidecar means a complete, verified pack: everything the
//! Postgres [`Index`] holds can be rebuilt from the sidecars alone.
//!
//! Readers ([`PackReader`]) look a match up in the index and fetch its bytes with one range GET.

#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

/// The key prefix of packs and sidecars in the pack bucket.
pub const DEFAULT_PREFIX: &str = "packs/v1";

pub mod format;
mod index;
mod kind;
mod pack;
mod reader;
mod source;

pub use index::{Index, Location, PublishSources};
pub use kind::{Codec, Kind};
pub use pack::{BuiltPack, PART_SIZE, PackError, SourceFile, Verify, build_pack, upload_pack};
pub use reader::{PackReader, ReadError};
pub use source::{SOURCE_PREFIXES, parse_source_key};
