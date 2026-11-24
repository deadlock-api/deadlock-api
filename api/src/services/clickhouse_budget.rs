//! The budget of `ClickHouse` work shared by the analytics endpoints, bulk metadata and GraphQL.
//! They all run arbitrary-cost queries on the same database, so separate budgets would let a
//! client throttled on one move its load to another.
//!
//! A request is charged what its queries cost the database, CPU, memory and disk combined
//! ([`ch_usage::Usage::core_ms`]), once they show up in `system.query_log` a few seconds after
//! they ran. [`admit`] admits a request while one core-millisecond of budget is left, and
//! [`charged`] runs the request so that its queries are charged afterwards, taking the client
//! past its budget until enough of the cost has left the window.

use core::time::Duration;
use std::sync::LazyLock;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::ch_usage;
use crate::services::client_slots::{ClientSlot, ClientSlots};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Limits, Quota, RateLimit, Scope};

/// Budgets in core-milliseconds: without a key, a client may average 1 of the database's 64 cores
/// over an hour and burst to 8 within a minute; with one, 8 and 32.
///
/// Replayed on the week to 2026-11-24 (costs estimated from bytes read: analytics 6.9, bulk
/// metadata 33.8 and GraphQL 24.1 core-ms per MB): analytics + bulk metadata + GraphQL averaged
/// 37 cores. These budgets reject ~19% of the cost of clients without a key (223 of their addresses
/// in at least one hour) and only one key, deadlocklabs (11 cores on average, a third of all
/// analytics work, ~33% of it rejected). The old bulk metadata budget (10 GB/h per address, ~0.1
/// core) turned away 68% of its requests; counting those back in at each client's average cost,
/// these budgets admit ~32 cores, against ~37 at 2 cores per address.
pub(crate) const BUDGET: RateLimit = RateLimit::new(
    "clickhouse_cost",
    &[
        Quota::new(Scope::Ip, 480_000, Duration::from_mins(1)),
        Quota::new(Scope::Ip, 3_600_000, Duration::from_hours(1)),
        Quota::new(Scope::Key, 1_920_000, Duration::from_mins(1)),
        Quota::new(Scope::Key, 28_800_000, Duration::from_hours(1)),
    ],
);

/// What the endpoint docs say about [`BUDGET`].
pub(crate) const DOCS_NOTE: &str = "These limits are **shared by all analytics endpoints, \
     `GET /v1/matches/metadata` and `POST /v1/graphql`** and count what your requests cost the \
     database once they have run, in core-seconds: CPU time, plus memory held and data read from \
     disk as their share of the server (holding all of its memory or reading at the full speed of \
     its disks for a second costs as much as all 64 CPU cores for a second). Responses served from \
     a cache cost next to nothing. A request is admitted while any budget is left, so an expensive \
     one can take you past the limit until its cost leaves the window; the cost is charged within \
     about 15 seconds. Narrow time ranges and filters, request fewer matches or select fewer \
     fields to make a request cheaper. At most 16 of your requests to these endpoints run at once \
     on each server; more get a 429 with `Retry-After: 1`.";

/// [`BUDGET`] for an endpoint's rate limit table, in core-seconds.
pub(crate) fn limits() -> Limits<'static> {
    Limits::from(BUDGET)
        .scaled_unit(" core-s", 1000)
        .note(DOCS_NOTE)
}

/// Requests a client may have in flight at once on one replica, over all of these endpoints.
/// [`BUDGET`] admits every request while one unit is left and charges it only after it has run,
/// so without it a burst sent all at once would run in full before any of it is charged. The
/// busiest bulk metadata clients peaked at 24–30 in flight across both replicas in the week to
/// 2026-11-19.
static SLOTS: LazyLock<ClientSlots> = LazyLock::new(|| ClientSlots::new(16));

/// Takes one of the client's in-flight slots, held until the returned [`ClientSlot`] drops.
pub(crate) fn acquire_slot(client: &RateLimitKey) -> APIResult<ClientSlot> {
    SLOTS
        .acquire(client.client_id())
        .ok_or(APIError::TooManyInFlight {
            limit: SLOTS.limit(),
            endpoints: "the analytics, bulk metadata and GraphQL endpoints",
        })
}

/// Admits a request if the client has budget left, charging the first core-millisecond.
pub(crate) async fn admit(state: &AppState, client: &RateLimitKey) -> APIResult<()> {
    state.rate_limit_client.check(client, BUDGET).await?;
    Ok(())
}

/// Runs `future`, charging the cost of its tracked queries to `client` against [`BUDGET`].
pub(crate) async fn charged<F: Future>(client: &RateLimitKey, future: F) -> F::Output {
    ch_usage::charge_to(client.clone(), BUDGET, future).await
}
