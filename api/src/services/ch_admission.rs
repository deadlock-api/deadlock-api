//! Admission control for user-triggered `ClickHouse` queries ([`clickhouse_utils::admission`]).
//!
//! Cache misses of the analytics endpoints (and a few other heavy reads) take a slot from
//! [`CH_ADMISSION`] before they query `ClickHouse`; a query that finds no free slot in time fails
//! with [`Busy`], which the API reports as `503`. A request burst, however many IPs it comes from,
//! thus queues in the API instead of overloading `ClickHouse` until every query (including other
//! users') runs into the 20 s timeout.

use std::sync::LazyLock;

pub(crate) use clickhouse_utils::admission::QueryError as ChQueryError;
use clickhouse_utils::admission::{Admission, ControllerConfig};
pub(crate) use clickhouse_utils::admission::{Busy, Caller, Permit};

tokio::task_local! {
    /// The client (API key, IP or Cloudflare worker) the current request comes from, set by
    /// [`crate::middleware::ch_client::scope_ch_client`]. Unless it has a valid API key, its share
    /// of the slots is capped, so one client cannot take all of them.
    pub(crate) static CH_CLIENT: Caller;
}

/// The process-wide admission limiter. A static, as the `cached_ch_query!` bodies get no state.
/// Caddy sends all traffic to one instance (`lb_policy first`), so its defaults are sized for
/// all of it.
static CH_ADMISSION: LazyLock<Admission> = LazyLock::new(Admission::default);

/// Adapts [`CH_ADMISSION`]'s limit to `ClickHouse`'s CPU pressure, polled through `ch_client`.
pub(crate) fn spawn_controller(ch_client: clickhouse::Client) {
    LazyLock::force(&CH_ADMISSION).spawn_controller(ch_client, ControllerConfig::default());
}

/// Waits for a query slot for the current request's client (see [`CH_CLIENT`]).
pub(crate) async fn acquire() -> Result<Permit<'static>, Busy> {
    let caller = CH_CLIENT
        .try_with(Clone::clone)
        .unwrap_or_else(|_| Caller::new("unknown", true));
    CH_ADMISSION.acquire(caller).await
}
