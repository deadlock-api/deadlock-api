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

//! this is a partial port of valve's bitbuf. original implementation can be found on github
//! <https://github.com/ValveSoftware/source-sdk-2013>.

mod bitreader;
mod bitwriter;
mod common;
mod error;

pub use bitreader::BitReader;
pub use bitwriter::BitWriter;
pub use common::get_bit_for_bit_num;
pub(crate) use common::{BIT_WRITE_MASKS, EXTRA_MASKS};
pub use error::BitError;
