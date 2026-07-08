//! SQL queries and schema discovery over Valve Source 2 demo files via Apache `DataFusion`.
//!
//! [`schema`] inspects a demo's queryable tables (entities + events) and their columns;
//! [`query`] runs a SQL query over a demo and streams the result rows back.
//!
//! [`schema`] is exposed via the demo schema API; [`query`] is used by the demo-query worker to
//! execute user-submitted SQL extractions. (The module may still carry allowances for generated/
//! verbose code.)

mod catalog;
mod dynamic_builder;
mod entity_batch_builder;
mod error;
mod event_batch_builder;
mod events;
mod live;
mod query;
mod schema;
mod table_extractor;
mod visitor;

pub(crate) use catalog::{TableKind, TableSchema, schema};
pub(crate) use error::Error;
pub(crate) use live::query_live;
pub(crate) use query::query;
