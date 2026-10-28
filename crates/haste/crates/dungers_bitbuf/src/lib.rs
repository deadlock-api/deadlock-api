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

//! this is a partial port of valve's bitbuf. original implementation can be found on github
//! <https://github.com/ValveSoftware/source-sdk-2013>.

mod bitreader;
mod bitwriter;
mod common;
mod error;

pub use bitreader::BitReader;
pub use bitwriter::BitWriter;
pub use common::get_bit_for_bit_num;
pub(crate) use common::{bit_write_mask, extra_mask};
pub use error::BitError;
