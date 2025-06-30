#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::pedantic)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::missing_errors_doc)]
#![allow(clippy::missing_panics_doc)]
#![allow(clippy::implicit_hasher)]

pub mod config;
pub mod glicko;
pub mod types;
pub mod utils;
