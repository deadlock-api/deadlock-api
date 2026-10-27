#![deny(unsafe_code)]
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

mod broadcastfile;
mod broadcasthttp;
pub(crate) mod demostream;
mod httpclient;

pub use broadcastfile::BroadcastFile;
pub use broadcasthttp::{BroadcastHttp, BroadcastHttpClientError, FragmentType, default_headers};
pub use httpclient::HttpClient;
