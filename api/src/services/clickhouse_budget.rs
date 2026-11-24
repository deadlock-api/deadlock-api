//! The budget of `ClickHouse` reads shared by the analytics endpoints, bulk metadata and GraphQL.
//! They all run arbitrary-cost queries on the same database, so separate budgets would let a
//! client throttled on one move its load to another.
//!
//! A request is charged each started megabyte `ClickHouse` reads for it. Bytes read track the CPU
//! a query takes far better than its parameters do (a time-window scan reads from a few MB to GBs)
//! and, unlike its duration, do not grow while `ClickHouse` is busy. The cost is only known once
//! the queries have run, so [`admit`] admits a request while one unit is left, and [`record`] adds
//! its measured cost afterwards, taking the client past its budget until enough of it has left the
//! window.

use core::num::NonZeroU64;
use core::time::Duration;
use std::sync::LazyLock;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::ch_cost;
use crate::services::client_slots::{ClientSlot, ClientSlots};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Limits, Quota, RateLimit, Scope, Status};

/// One unit of [`BUDGET`].
const COST_UNIT_BYTES: u64 = 1_000_000;

/// Budgets of [`COST_UNIT_BYTES`]. Replayed on the week to 2026-11-24, when analytics, bulk
/// metadata and GraphQL read ~427 TB a day, these reject ~37% of what clients without a key read,
/// and only 344 of their 174k addresses lose more than 5% of their reads (21 of them browsers).
/// Only one key reaches them, deadlocklabs (~5.8 TB/h on average, ~66% rejected). The per-minute
/// budgets are generous on purpose: one page firing several uncached ~1 GB analytics queries at
/// once is a normal burst, and a 50 GB/min budget cut off 119 browsers; the hourly ones are what
/// hold back sustained sweeps.
pub(crate) const BUDGET: RateLimit = RateLimit::new(
    "clickhouse_cost",
    &[
        Quota::new(Scope::Ip, 100_000, Duration::from_mins(1)),
        Quota::new(Scope::Ip, 250_000, Duration::from_hours(1)),
        Quota::new(Scope::Key, 400_000, Duration::from_mins(1)),
        Quota::new(Scope::Key, 2_000_000, Duration::from_hours(1)),
    ],
);

/// How [`BUDGET`] counts, for the endpoint docs.
macro_rules! cost_docs {
    () => {
        "Requests are charged the megabytes ClickHouse reads to answer them (see the \
         `X-CH-Read-Bytes` response header), once they have run. Responses served from a cache \
         cost next to nothing. A request is admitted while any budget is left, so an expensive one \
         can take you past the limit until its cost leaves the window. Narrow time ranges and \
         filters, request fewer matches or select fewer fields to read less. At most 16 of your \
         requests to these endpoints run at once on each server; more get a 429 with \
         `Retry-After: 1`."
    };
}
pub(crate) use cost_docs;

/// [`BUDGET`] for an endpoint's rate limit table.
pub(crate) fn limits() -> Limits<'static> {
    Limits::from(BUDGET).unit(" MB").note(concat!(
        "These limits are **shared by all analytics endpoints, `GET /v1/matches/metadata` and \
         `POST /v1/graphql`**. ",
        cost_docs!()
    ))
}

/// Requests a client may have in flight at once on one replica, over all of these endpoints.
/// [`BUDGET`] admits every request while one unit is left, so without it a burst sent all at once
/// would run in full before its cost is recorded. The busiest bulk metadata clients peaked at
/// 24–30 in flight across both replicas in the week to 2026-11-19.
static SLOTS: LazyLock<ClientSlots> = LazyLock::new(|| ClientSlots::new(16));

/// Takes one of the client's in-flight slots, held until the returned [`ClientSlot`] drops.
pub(crate) fn acquire_slot(client: &RateLimitKey) -> APIResult<ClientSlot> {
    SLOTS
        .acquire(client.client_id())
        .ok_or(APIError::TooManyInFlight {
            limit: SLOTS.limit(),
        })
}

/// Admits a request if the client has budget left, charging the first unit of its cost. Returns
/// the status of the tightest quota for the rate limit headers.
pub(crate) async fn admit(state: &AppState, client: &RateLimitKey) -> APIResult<Option<Status>> {
    state.rate_limit_client.check(client, BUDGET).await
}

/// Records what the request's `ClickHouse` queries read so far past the unit [`admit`] charged.
/// Call it once they have finished.
pub(crate) async fn record(state: &AppState, client: &RateLimitKey) {
    let cost = cost_units(ch_cost::current().read_bytes);
    if let Some(rest) = NonZeroU64::new(cost.get().saturating_sub(1)) {
        state.rate_limit_client.record(client, BUDGET, rest).await;
    }
}

/// The [`BUDGET`] units for `read_bytes`, at least 1.
fn cost_units(read_bytes: u64) -> NonZeroU64 {
    NonZeroU64::new(read_bytes.div_ceil(COST_UNIT_BYTES)).unwrap_or(NonZeroU64::MIN)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn costs_each_started_megabyte_and_at_least_one() {
        assert_eq!(cost_units(0).get(), 1);
        assert_eq!(cost_units(1).get(), 1);
        assert_eq!(cost_units(1_000_000).get(), 1);
        assert_eq!(cost_units(1_000_001).get(), 2);
        assert_eq!(cost_units(2_500_000_000).get(), 2_500);
        assert_eq!(cost_units(u64::MAX).get(), u64::MAX.div_ceil(1_000_000));
    }
}
