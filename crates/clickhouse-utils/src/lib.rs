//! `ClickHouse` helpers for the API and the workers: one-shot inserts, a retrying batch inserter,
//! batched key lookups, match id bounds and error classification.
//!
//! Features:
//! - `admission`: [`admission`], a concurrency limiter for queries that adapts to the server's CPU
//!   pressure.
//! - `cache`: [`cache`], memory and shared disk caches of query results.

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

#[cfg(feature = "admission")]
pub mod admission;
mod batch_inserter;
mod batch_query;
#[cfg(feature = "cache")]
pub mod cache;
mod ch;
mod error;

pub use batch_inserter::*;
pub use batch_query::*;
pub use ch::*;
pub use error::*;
