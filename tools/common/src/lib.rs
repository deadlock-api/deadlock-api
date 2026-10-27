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

mod assets;
mod batch_inserter;
mod ch;
mod clients;
mod http;
mod prioritization;
mod retry;
mod shutdown;
mod steam;
mod telemetry;
mod utils;

pub use assets::*;
pub use batch_inserter::*;
pub use ch::*;
pub use clients::*;
pub use http::*;
pub use prioritization::*;
pub use retry::*;
pub use shutdown::*;
pub use steam::*;
pub use telemetry::*;
pub use utils::*;
