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
#![expect(clippy::missing_errors_doc)]
#![expect(clippy::cast_possible_truncation)]
#![expect(clippy::unreadable_literal)]

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
