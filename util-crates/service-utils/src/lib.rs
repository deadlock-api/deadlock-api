//! Process plumbing for long-running services: env config, graceful shutdown, retries with
//! backoff, shared HTTP clients and error display.

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

mod http;
mod retry;
mod shutdown;
mod utils;

pub use http::*;
pub use retry::*;
pub use shutdown::*;
pub use utils::*;
