//! The API's rate limiting: [`rate_limit`] policies scoped to client addresses, API keys and
//! everyone, applied through Redis.

use std::borrow::Cow;

use strum::{IntoStaticStr, VariantArray};

mod client;
mod docs;
pub(crate) mod extractor;
mod headers;

pub(crate) use client::RateLimitClient;
pub(crate) use docs::{DOCUMENTED_DEFAULT, Limits, describe};
use extractor::RateLimitKey;
pub(crate) use headers::RateLimitHeaders;

pub(crate) type Quota = rate_limit::Quota<Scope>;
pub(crate) type RateLimit<'a> = rate_limit::RateLimit<'a, Scope>;
pub(crate) type Status = rate_limit::Status<Scope>;
pub(crate) type Exceeded = rate_limit::Exceeded<Scope>;

/// Who an API quota counts.
///
/// IP and key quotas both count per client: under its API key if it sent one, else under its
/// address. What sets them apart is which clients they hold: once a policy has key quotas, they
/// replace its IP quotas for clients with a key, and a policy with key quotas but no IP quotas
/// only admits clients with a key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, IntoStaticStr, VariantArray)]
pub(crate) enum Scope {
    #[strum(serialize = "IP")]
    Ip,
    Key,
    Global,
}

impl Scope {
    pub(crate) fn as_str(self) -> &'static str {
        self.into()
    }
}

impl rate_limit::Scope for Scope {
    type Client = RateLimitKey;

    fn subject<'c>(&self, client: &'c RateLimitKey) -> Option<Cow<'c, str>> {
        match self {
            Self::Ip | Self::Key => Some(client.client_id().into()),
            Self::Global => None,
        }
    }
}
