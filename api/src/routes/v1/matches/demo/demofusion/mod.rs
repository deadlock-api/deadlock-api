//! SQL queries and schema discovery over Valve Source 2 demo files via Apache `DataFusion`.
//!
//! [`schema`] inspects a demo's queryable tables (entities + events) and their columns;
//! [`query`] runs a SQL query over a demo and streams the result rows back.
//!
//! Only [`schema`] is wired to an endpoint so far; the [`query`] path (and the Arrow
//! batch builders behind it) is kept ready for a future query endpoint, hence the
//! module-wide `dead_code`/`unused_imports` allowances.

mod catalog;
mod dynamic_builder;
mod entity_batch_builder;
mod error;
mod event_batch_builder;
mod events;
mod query;
mod schema;
mod table_extractor;
mod visitor;

pub(crate) use catalog::{TableKind, TableSchema, schema};
pub(crate) use error::Error;
pub(crate) use query::query;
