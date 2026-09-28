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
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_possible_wrap)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::missing_errors_doc)]

mod broadcastfile;
mod broadcasthttp;
pub(crate) mod demostream;
mod httpclient;

pub use broadcastfile::BroadcastFile;
pub use broadcasthttp::{BroadcastHttp, BroadcastHttpClientError, FragmentType, default_headers};
pub use httpclient::HttpClient;
