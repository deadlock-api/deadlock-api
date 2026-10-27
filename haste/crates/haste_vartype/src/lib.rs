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

//! overengineered piece of crap.

mod error;
mod parser;
mod span;
mod tokenizer;

pub use error::VarTypeError;
pub use parser::{Expr, Lit, parse};
pub use span::Span;
pub use tokenizer::{Token, TokenKind, Tokenizer};
