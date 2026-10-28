//! Sliding-window rate limiting.
//!
//! A [`RateLimit`] names a bucket and the [`Quota`]s that guard it. What a quota counts per is up
//! to the caller: a [`Scope`] maps a client to the subject its requests count under, or to none
//! for a count shared by everyone. Policies are plain data, so they are usually `const`s next to
//! the code they protect:
//!
//! ```
//! use core::time::Duration;
//! use std::borrow::Cow;
//!
//! use rate_limit::{Quota, RateLimit, Scope};
//!
//! #[derive(Clone, Copy)]
//! enum By {
//!     User,
//!     Everyone,
//! }
//!
//! impl Scope for By {
//!     type Client = str;
//!
//!     fn subject<'c>(&self, user: &'c str) -> Option<Cow<'c, str>> {
//!         match self {
//!             Self::User => Some(user.into()),
//!             Self::Everyone => None,
//!         }
//!     }
//! }
//!
//! const SEARCH: RateLimit<By> = RateLimit::new(
//!     "search",
//!     &[
//!         Quota::new(By::User, 20, Duration::from_mins(1)),
//!         Quota::new(By::Everyone, 500, Duration::from_mins(1)),
//!     ],
//! );
//! ```
//!
//! A [`RateLimiter`] counts requests against a policy in a [`Store`]: [`RedisStore`] (feature
//! `redis`) shares the counts across replicas, [`MemoryStore`] keeps them in the process.
#![forbid(unsafe_code)]
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

mod limiter;
mod policy;
mod status;
mod store;

pub use limiter::RateLimiter;
pub use policy::{Quota, RateLimit, Scope};
pub use status::{Exceeded, Status};
#[cfg(feature = "redis")]
pub use store::RedisStore;
pub use store::{Charge, Log, MemoryStore, Store, Usage, Window};
