//! Inspect the full SQL schema of a demo: every queryable table and its columns.
//!
//! [`schema`] returns everything needed to author a [`query`](super::query) —
//! table names, column names, and column types — for both the entity tables
//! discovered from a demo's send-tables and the event tables common to every demo.

use bytes::Bytes;
use datafusion::arrow::datatypes::SchemaRef;

use super::error::Result;
use super::events::{EventType, event_schema};
use super::visitor::discover_all_schemas_from_demo;

/// Which kind of table a [`TableSchema`] describes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TableKind {
    /// An entity table, named after its Source 2 serializer (e.g. `CCitadelPlayerPawn`).
    /// Discovered from the demo's send-tables, so the set varies per demo.
    Entity,
    /// An event table, named `<EventName>Event` (e.g. `BossDamagedEvent`).
    /// The same set is available for every demo.
    Event,
}

/// One queryable table: its SQL name, kind, and Arrow schema (column names + types).
#[derive(Debug, Clone)]
pub(crate) struct TableSchema {
    /// The table name to use in `FROM` (case-insensitive in SQL, but given here verbatim).
    pub(crate) name: String,
    pub(crate) kind: TableKind,
    /// Column names and Arrow types. `tick` is always present; entity tables also
    /// carry `entity_index` and `delta_type`.
    pub(crate) schema: SchemaRef,
}

/// Return every table queryable against `demo` — both entity tables (discovered
/// from the demo's send-tables) and event tables — along with each table's columns
/// and types. This is everything needed to write a SQL query with
/// [`query`](super::query).
///
/// Unlike [`query`](super::query), this builds schemas for *all* entity types in
/// the demo, not just the ones a query references, so it parses the demo header
/// and flattens every serializer.
///
/// Only the demo's prefix is read — the parse stops as soon as the send-tables
/// have been decoded — so a partial download is enough as long as it contains the
/// send-tables. If it doesn't, this returns [`Error::IncompleteDemo`](super::Error::IncompleteDemo).
///
/// # Errors
///
/// Returns an error if the demo header cannot be parsed or the send-tables are
/// missing or malformed (see [`Error`](super::Error)).
pub(crate) fn schema(demo: Bytes) -> Result<Vec<TableSchema>> {
    let mut tables = Vec::new();

    for entity in discover_all_schemas_from_demo(demo)? {
        tables.push(TableSchema {
            name: entity.serializer_name.to_string(),
            kind: TableKind::Entity,
            schema: entity.arrow_schema,
        });
    }

    for event_type in EventType::all() {
        let name = event_type.table_name();
        let Some(schema) = event_schema(name) else {
            continue;
        };
        tables.push(TableSchema {
            name: name.to_string(),
            kind: TableKind::Event,
            schema,
        });
    }

    Ok(tables)
}
