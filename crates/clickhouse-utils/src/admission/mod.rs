//! Admission control for `ClickHouse` queries.
//!
//! A query takes a slot from an [`Admission`] before it runs. The number of slots adapts to the
//! server's CPU pressure ([`Admission::spawn_controller`]); a query that finds no free slot queues
//! for a few seconds and then fails with [`Busy`]. A burst of queries thus queues in front of
//! `ClickHouse` instead of overloading it until every query runs into its timeout.

mod controller;
mod limiter;

use core::time::Duration;
use std::sync::Arc;

pub use controller::ControllerConfig;
pub use limiter::{Admission, AdmissionConfig, Busy, Caller, Load, Permit};
use thiserror::Error;

/// Error of an admission-controlled query. Cloneable, as concurrent misses of one cached query
/// share its result ([`crate::cache`]).
#[derive(Debug, Clone, Error)]
pub enum QueryError {
    #[error(transparent)]
    Busy(#[from] Busy),
    #[error("{0}")]
    Clickhouse(Arc<clickhouse::error::Error>),
    /// The query ran into the timeout, now or within a cache's timeout cooldown, and fails fast
    /// until `retry_after` has passed.
    #[error("{error}")]
    TimedOut {
        error: Arc<clickhouse::error::Error>,
        retry_after: Duration,
    },
}

impl From<clickhouse::error::Error> for QueryError {
    fn from(e: clickhouse::error::Error) -> Self {
        Self::Clickhouse(Arc::new(e))
    }
}
