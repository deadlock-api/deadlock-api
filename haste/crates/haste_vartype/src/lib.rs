#![deny(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::correctness)]
#![deny(clippy::suspicious)]
#![deny(clippy::style)]
#![deny(clippy::complexity)]
#![deny(clippy::perf)]
#![deny(clippy::pedantic)]
#![deny(clippy::std_instead_of_core)]
#![allow(clippy::missing_errors_doc)]
#![allow(clippy::cast_possible_truncation)]

//! overengineered piece of crap.

mod error;
mod parser;
mod span;
mod tokenizer;

pub use error::Error;
pub use parser::{Expr, Lit, parse};
pub use span::Span;
pub use tokenizer::{Token, TokenKind, Tokenizer};
