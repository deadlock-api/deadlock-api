#![forbid(unsafe_code)]
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
#![allow(clippy::unreadable_literal)]

mod assets;
mod clients;
mod steam;
mod telemetry;
mod utils;

pub use assets::*;
pub use clients::*;
pub use steam::*;
pub use telemetry::*;
pub use utils::*;
