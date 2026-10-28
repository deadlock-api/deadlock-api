//! SQL queries and schema discovery over Valve Source 2 demo files via Apache `DataFusion`.
//!
//! [`schema`] inspects a demo's queryable tables (entities + events) and their columns;
//! [`query`] runs a SQL query over a demo and streams the result rows back;
//! [`query_live`] does the same over a live GOTV broadcast while the match plays.

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

mod catalog;
mod dynamic_builder;
mod entity_batch_builder;
mod error;
mod event_batch_builder;
mod events;
mod live;
mod query;
mod schema;
mod session;
mod table_extractor;
mod visitor;

pub use catalog::{TableKind, TableSchema, schema, validate};
pub use error::{DemoError, Result};
pub use live::query_live;
pub use query::query;
