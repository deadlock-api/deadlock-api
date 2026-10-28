use core::time::Duration;
use std::borrow::Cow;

/// What a quota is counted per.
///
/// Each scope maps a client to the subject its requests count under: an address, an account, an
/// API key, or `None` for one count shared by all clients. Scopes that map a client to the same
/// subject share that subject's count.
pub trait Scope: Copy + Send + Sync {
    /// Whatever identifies a request's sender.
    type Client: ?Sized + Sync;

    fn subject<'c>(&self, client: &'c Self::Client) -> Option<Cow<'c, str>>;
}

/// At most `limit` requests, or units of cost, within any `period`, counted per `scope`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Quota<S> {
    pub scope: S,
    pub limit: u64,
    pub period: Duration,
}

impl<S> Quota<S> {
    #[must_use]
    pub const fn new(scope: S, limit: u64, period: Duration) -> Self {
        Self {
            scope,
            limit,
            period,
        }
    }
}

/// A named bucket and the quotas guarding it. Requests count against the quotas of every policy
/// with the same bucket, so policies that share a budget share a bucket.
#[derive(Debug, PartialEq, Eq, Hash)]
pub struct RateLimit<'a, S> {
    pub bucket: &'a str,
    pub quotas: &'a [Quota<S>],
}

// Not derived: the derives would require `S: Clone`, though only references are copied.
impl<S> Clone for RateLimit<'_, S> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<S> Copy for RateLimit<'_, S> {}

impl<'a, S> RateLimit<'a, S> {
    #[must_use]
    pub const fn new(bucket: &'a str, quotas: &'a [Quota<S>]) -> Self {
        Self { bucket, quotas }
    }

    /// The same quotas counted in another bucket.
    #[must_use]
    pub const fn with_bucket(self, bucket: &'a str) -> Self {
        Self { bucket, ..self }
    }
}
