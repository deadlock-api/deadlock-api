//! Admission control for user-triggered `ClickHouse` queries.
//!
//! Cache misses of the analytics endpoints (and a few other heavy reads) take a slot from
//! [`CH_ADMISSION`] before they query `ClickHouse`. The number of slots adapts to the server's CPU
//! pressure ([`controller`]); a query that finds no free slot queues for a few seconds and then
//! fails with [`Busy`], which the API reports as `503`. A request burst, however many IPs it
//! comes from, thus queues in the API instead of overloading `ClickHouse` until every query
//! (including other users') runs into the 20 s timeout.

mod controller;
mod limiter;

use std::sync::{Arc, LazyLock};

pub(crate) use controller::spawn_controller;
pub(crate) use limiter::{Busy, ChAdmission, ChClient, ChPermit};
use thiserror::Error;

tokio::task_local! {
    /// The client (API key, IP or Cloudflare worker) the current request comes from, set by
    /// [`crate::middleware::ch_client::scope_ch_client`]. Unless it has a valid API key, its share
    /// of the slots is capped, so one client cannot take all of them.
    pub(crate) static CH_CLIENT: ChClient;
}

/// The process-wide admission limiter. A static, as the `cached_ch_query!` bodies get no state.
pub(crate) static CH_ADMISSION: LazyLock<ChAdmission> = LazyLock::new(ChAdmission::default);

/// Waits for a query slot for the current request's client (see [`CH_CLIENT`]).
pub(crate) async fn acquire() -> Result<ChPermit<'static>, Busy> {
    let client = CH_CLIENT
        .try_with(Clone::clone)
        .unwrap_or_else(|_| ChClient {
            id: Arc::from("unknown"),
            capped: true,
        });
    CH_ADMISSION.acquire(client).await
}

/// Error of an admission-controlled `ClickHouse` query. Cloneable, as concurrent misses of one
/// cached query share its result ([`crate::services::ch_cache`]).
#[derive(Debug, Clone, Error)]
pub(crate) enum ChQueryError {
    #[error("{0}")]
    Busy(#[from] Busy),
    #[error("{0}")]
    Clickhouse(Arc<clickhouse::error::Error>),
}

impl From<clickhouse::error::Error> for ChQueryError {
    fn from(e: clickhouse::error::Error) -> Self {
        Self::Clickhouse(Arc::new(e))
    }
}
