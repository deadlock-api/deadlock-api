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
#[cfg(feature = "bitbuf")]
pub use dungers_bitbuf as bitbuf;
#[cfg(feature = "charsor")]
pub use dungers_charsor as charsor;
#[cfg(feature = "varint")]
pub use dungers_varint as varint;
