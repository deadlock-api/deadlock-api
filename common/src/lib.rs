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

#[cfg(feature = "clients")]
mod assets;
#[cfg(feature = "clients")]
mod batch_inserter;
#[cfg(feature = "clients")]
mod ch;
#[cfg(feature = "clients")]
mod clients;
mod http;
#[cfg(feature = "clients")]
mod prioritization;
mod retry;
mod shutdown;
mod steam;
#[cfg(feature = "steam-proxy")]
mod steam_proxy;
mod telemetry;
mod utils;

#[cfg(feature = "clients")]
pub use assets::*;
#[cfg(feature = "clients")]
pub use batch_inserter::*;
#[cfg(feature = "clients")]
pub use ch::*;
#[cfg(feature = "clients")]
pub use clients::*;
pub use http::*;
#[cfg(feature = "clients")]
pub use prioritization::*;
pub use retry::*;
pub use shutdown::*;
pub use steam::*;
#[cfg(feature = "steam-proxy")]
pub use steam_proxy::*;
pub use telemetry::*;
pub use utils::*;
