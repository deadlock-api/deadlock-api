//! Run a SQL query over a demo file and stream the result rows back.
//!
//! [`query`] is the only entrypoint: it parses the demo once, collects only the
//! columns the query references into in-memory Arrow tables, and returns a
//! stream of the query's result batches.
//!
//! # Example
//!
//! ```ignore
//! let demo = bytes::Bytes::from(std::fs::read("match.dem")?);
//! let stream = demofusion::query(
//!     demo,
//!     "SELECT tick, entity_index, \"m_iHealth\" FROM CCitadelPlayerPawn",
//! )
//! .await?;
//! ```

use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::Arc;

use bytes::Bytes;
use datafusion::arrow::datatypes::SchemaRef;
use datafusion::arrow::record_batch::RecordBatch;
use datafusion::common::tree_node::{TreeNode, TreeNodeRecursion};
use datafusion::datasource::MemTable;
use datafusion::execution::SendableRecordBatchStream;
use datafusion::logical_expr::LogicalPlan;
use datafusion::prelude::SessionContext;
use rayon::prelude::*;

use super::error::Result;
use super::events::{EventType, event_schema};
use super::schema::EntitySchema;
use super::table_extractor::extract_table_names;
use super::visitor::{
    BuildStream, CollectedBatches, CollectingVisitor, SyncDemoStream, discover_schemas_from_demo,
    scan_full_packet_ticks, sync_parser,
};

/// Run `query` against a single parse of `demo` and return a stream of its
/// result batches. The demo is parsed exactly once; only the columns the query
/// references are decoded. Results are streamed straight from `DataFusion` — never
/// collected into a `Vec<RecordBatch>`.
///
/// Every referenced table is collected into a single in-memory Arrow
/// `RecordBatch` — and only the columns the query actually needs are decoded.
/// The query then executes against those tables and its result is streamed
/// directly back.
///
/// # Errors
///
/// Returns an error if the table names cannot be extracted from `query`, the
/// demo cannot be parsed, or `DataFusion` fails to plan or execute the query
/// (see [`Error`](super::Error)).
pub(crate) async fn query(demo: Bytes, query: &str) -> Result<SendableRecordBatchStream> {
    query_stream::<SyncDemoStream>(demo, query).await
}

/// The shared batch pipeline, generic over the demo stream format `D` (a `.dem` file or a buffered
/// broadcast). The bytes are parsed once; only the columns the query references are decoded, and
/// only the entity types it references have Arrow schemas built (a demo defines hundreds).
async fn query_stream<D: BuildStream>(
    demo: Bytes,
    query: &str,
) -> Result<SendableRecordBatchStream> {
    let referenced: HashSet<String> = extract_table_names(query)?.into_iter().collect();

    let entity_schemas: Schemas = discover_schemas_from_demo::<D>(demo.clone(), &referenced)?
        .into_iter()
        .map(|s| (Arc::clone(&s.serializer_name), s))
        .collect();

    let (referenced_entities, event_types) = resolve_referenced(&referenced, &entity_schemas);
    let projections =
        discover_entity_projections(query, &referenced_entities, &event_types).await?;
    let entity_specs = build_entity_specs(&referenced_entities, &projections);

    let collected = parse_and_collect::<D>(&demo, &entity_specs, &event_types)?;

    let ctx = SessionContext::new();

    for schema in &referenced_entities {
        let arrow_schema = projected_entity_schema(schema, &projections)?;
        let table = multi_batch_table(
            arrow_schema,
            collected.entities.get(&schema.serializer_name),
        )?;
        ctx.register_table(&*schema.serializer_name, Arc::new(table))?;
    }

    for event_type in &event_types {
        let table_name = event_type.table_name();
        let Some(arrow_schema) = event_schema(table_name) else {
            continue;
        };
        let table = multi_batch_table(arrow_schema, collected.events.get(table_name))?;
        ctx.register_table(table_name, Arc::new(table))?;
    }

    Ok(ctx.sql(query).await?.execute_stream().await?)
}

pub(crate) type Schemas = HashMap<Arc<str>, EntitySchema>;

/// The entity tables a query references, paired with the projection each needs — the shared front
/// half of every query pipeline once schemas have been discovered.
pub(crate) fn resolve_referenced(
    referenced: &HashSet<String>,
    entity_schemas: &Schemas,
) -> (Vec<EntitySchema>, Vec<EventType>) {
    let referenced_entities: Vec<EntitySchema> = referenced
        .iter()
        .filter_map(|name| entity_schemas.get(name.as_str()).cloned())
        .collect();

    let event_types: Vec<EventType> = EventType::all()
        .iter()
        .copied()
        .filter(|event_type| referenced.contains(event_type.table_name()))
        .collect();

    (referenced_entities, event_types)
}

/// Build the per-entity collection specs (full schema + chosen projection). Entities referenced in
/// SQL text but optimized away by the planner (no projection entry) are skipped — no columns are
/// parsed for them, though the caller still registers an empty table so the SQL resolves.
pub(crate) fn build_entity_specs(
    referenced_entities: &[EntitySchema],
    projections: &HashMap<Arc<str>, EntityProjection>,
) -> Vec<(EntitySchema, Option<Arc<[usize]>>)> {
    let mut entity_specs = Vec::with_capacity(referenced_entities.len());
    for schema in referenced_entities {
        match projections.get(schema.serializer_name.as_ref()) {
            Some(EntityProjection::All) => entity_specs.push((schema.clone(), None)),
            Some(EntityProjection::Columns(cols)) => {
                entity_specs.push((schema.clone(), Some(cols.iter().copied().collect())));
            }
            None => {}
        }
    }
    entity_specs
}

/// The Arrow schema an entity table is registered with: the projected columns when the planner
/// pushed a projection, otherwise the full schema (so an optimized-away table still resolves).
pub(crate) fn projected_entity_schema(
    schema: &EntitySchema,
    projections: &HashMap<Arc<str>, EntityProjection>,
) -> Result<SchemaRef> {
    Ok(match projections.get(schema.serializer_name.as_ref()) {
        Some(EntityProjection::Columns(cols)) => Arc::new(
            schema
                .arrow_schema
                .project(&cols.iter().copied().collect::<Vec<_>>())?,
        ),
        Some(EntityProjection::All) | None => schema.arrow_schema.clone(),
    })
}

/// Plan the query against full-schema (empty) tables and read back the
/// column projection the optimizer pushed into each entity `TableScan`.
pub(crate) async fn discover_entity_projections(
    query: &str,
    entities: &[EntitySchema],
    event_types: &[EventType],
) -> Result<HashMap<Arc<str>, EntityProjection>> {
    let ctx = SessionContext::new();
    // DataFusion normalizes unquoted identifiers to lowercase in the plan, so
    // key the lookup by the lowercased table name.
    let mut entity_keys: HashMap<String, Arc<str>> = HashMap::with_capacity(entities.len());
    for schema in entities {
        let table = MemTable::try_new(schema.arrow_schema.clone(), vec![vec![]])?;
        ctx.register_table(&*schema.serializer_name, Arc::new(table))?;
        entity_keys.insert(
            schema.serializer_name.to_ascii_lowercase(),
            Arc::clone(&schema.serializer_name),
        );
    }
    for event_type in event_types {
        let Some(arrow_schema) = event_schema(event_type.table_name()) else {
            continue;
        };
        let table = MemTable::try_new(arrow_schema, vec![vec![]])?;
        ctx.register_table(event_type.table_name(), Arc::new(table))?;
    }

    let mut out: HashMap<Arc<str>, EntityProjection> = HashMap::new();
    let logical = ctx.state().create_logical_plan(query).await?;
    let optimized = ctx.state().optimize(&logical)?;
    optimized.apply(|node| {
        if let LogicalPlan::TableScan(scan) = node
            && let Some(key) = entity_keys.get(&scan.table_name.table().to_ascii_lowercase())
        {
            merge_projection(
                out.entry(Arc::clone(key)).or_default(),
                scan.projection.as_ref(),
            );
        }
        Ok(TreeNodeRecursion::Continue)
    })?;
    Ok(out)
}

/// Per-table collected batches, one `Vec` entry per parsed segment (in tick order).
struct CollectedTables {
    entities: HashMap<Arc<str>, Vec<RecordBatch>>,
    events: HashMap<&'static str, Vec<RecordBatch>>,
}

/// Parse the demo and collect the projected columns of every referenced table.
///
/// The demo is split into one segment per full packet — each full packet is a complete state
/// snapshot, so a segment can be parsed independently — and the segments are parsed in parallel on
/// rayon's pool, which load-balances them across idle workers. Each segment's output batches are
/// concatenated in tick (segment) order, which reproduces a single end-to-end parse exactly.
fn parse_and_collect<D: BuildStream>(
    demo_bytes: &Bytes,
    entity_specs: &[(EntitySchema, Option<Arc<[usize]>>)],
    event_types: &[EventType],
) -> Result<CollectedTables> {
    if entity_specs.is_empty() && event_types.is_empty() {
        return Ok(CollectedTables {
            entities: HashMap::new(),
            events: HashMap::new(),
        });
    }

    let num_full_packets = scan_full_packet_ticks::<D>(demo_bytes.clone())?.len();

    // One segment per full packet, parsed in parallel — rayon load-balances them across idle
    // workers and `into_par_iter` over the range keeps results in tick order. Segment `i` spans
    // full packet `i` up to full packet `i + 1`; segment 0 also covers the pre-first-full-packet
    // signon, and the final segment (`end == None`) runs to EOF. With no full packets there is a
    // single whole-demo segment.
    let num_segments = num_full_packets.max(1);
    let collected: Vec<CollectedBatches> = (0..num_segments)
        .into_par_iter()
        .map(|ordinal| -> Result<CollectedBatches> {
            let visitor = CollectingVisitor::new(entity_specs, event_types);
            let mut parser = sync_parser::<D, _>(demo_bytes.clone(), visitor)?;
            // Mirrors the single-threaded path: parse errors (e.g. a truncated tail) are
            // tolerated and whatever was collected so far is kept.
            let _ = parser.run_full_packet(ordinal);
            parser.into_visitor().finish()
        })
        .collect::<Result<Vec<_>>>()?;

    // Concatenate the per-segment batches in tick order.
    let mut entities: HashMap<Arc<str>, Vec<RecordBatch>> = HashMap::new();
    let mut events: HashMap<&'static str, Vec<RecordBatch>> = HashMap::new();
    for segment in collected {
        for (name, batch) in segment.entities {
            if batch.num_rows() > 0 {
                entities.entry(name).or_default().push(batch);
            }
        }
        for (name, batch) in segment.events {
            if batch.num_rows() > 0 {
                events.entry(name).or_default().push(batch);
            }
        }
    }

    Ok(CollectedTables { entities, events })
}

/// The set of columns a query needs from one entity table.
pub(crate) enum EntityProjection {
    /// At least one scan needs every column.
    All,
    /// The union of column indices needed across all scans.
    Columns(BTreeSet<usize>),
}

impl Default for EntityProjection {
    fn default() -> Self {
        EntityProjection::Columns(BTreeSet::new())
    }
}

fn merge_projection(slot: &mut EntityProjection, scan_projection: Option<&Vec<usize>>) {
    match scan_projection {
        // No projection pushed → the scan needs all columns.
        None => *slot = EntityProjection::All,
        Some(cols) => {
            if let EntityProjection::Columns(set) = slot {
                set.extend(cols.iter().copied());
            }
        }
    }
}

/// Wrap a table's collected batches (one per parsed segment, in tick order) in a
/// one-partition `MemTable`. Keeping the segments as separate batches in a single
/// partition preserves global tick order without copying them into one contiguous batch.
fn multi_batch_table(schema: SchemaRef, batches: Option<&Vec<RecordBatch>>) -> Result<MemTable> {
    let partition: Vec<RecordBatch> = batches.cloned().unwrap_or_default();
    Ok(MemTable::try_new(schema, vec![partition])?)
}
