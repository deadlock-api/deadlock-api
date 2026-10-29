//! Connections to the services' databases and stores (`ClickHouse`, Postgres, Redis, S3 and the
//! local file cache), configured from the environment, the shared Postgres queries, and a Redis
//! lease for single-replica background jobs.

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

mod clients;
mod lease;
mod prioritization;

pub use clients::*;
pub use lease::*;
pub use prioritization::*;
