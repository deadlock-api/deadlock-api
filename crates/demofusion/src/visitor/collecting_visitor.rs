//! Single-pass collecting visitor.
//!
//! Parses a demo once and accumulates every tracked entity/event row into a
//! single in-memory Arrow `RecordBatch` per table. Builders grow for the whole
//! demo and are finished exactly once at the end — there is no per-chunk
//! flushing, so each table ends up as one contiguous batch with no intermediate
//! copies. Nothing is emitted until the whole demo has been parsed.

use std::collections::HashMap;
use std::sync::Arc;

use datafusion::arrow::record_batch::RecordBatch;
use haste_core::entities::{DeltaHeader, Entity};
use haste_core::parser::{Context, Visitor};

use super::super::entity_batch_builder::EntityBatchBuilder;
use super::super::error::DemoError;
use super::super::event_batch_builder::EventBatchBuilder;
use super::super::events::{EventType, decode_event};
use super::super::schema::EntitySchema;

/// One collected batch per referenced table, keyed by table name.
pub(crate) struct CollectedBatches {
    pub(crate) entities: HashMap<Arc<str>, RecordBatch>,
    pub(crate) events: HashMap<&'static str, RecordBatch>,
}

struct EntityCollector {
    name: Arc<str>,
    builder: EntityBatchBuilder,
}

struct EventCollector {
    table_name: &'static str,
    builder: EventBatchBuilder,
}

pub(crate) struct CollectingVisitor {
    // NOTE: a query references a handful of tables, so these are searched linearly; that beats
    // hashing the key (std's SipHash) on every entity update and packet.
    /// collectors by serializer name hash.
    entities: Vec<(u64, EntityCollector)>,
    /// collectors by event message id.
    events: Vec<(u32, EventCollector)>,
    /// When false, callbacks update no builders. Set during the warm-up fast-forward that
    /// establishes parser state for a later segment without emitting its rows.
    collecting: bool,
}

impl CollectingVisitor {
    /// `entities` pairs each referenced entity schema with the projection
    /// (column indices into the full entity schema) the queries actually need.
    /// `None` means all columns. Only the projected columns are materialized
    /// into Arrow arrays — for wide tables this is the dominant cost.
    pub(crate) fn new(
        entities: &[(EntitySchema, Option<Arc<[usize]>>)],
        event_types: &[EventType],
    ) -> Result<Self, DemoError> {
        let mut entity_map: Vec<(u64, EntityCollector)> = Vec::with_capacity(entities.len());
        for (schema, projection) in entities {
            let collector = EntityCollector {
                name: Arc::clone(&schema.serializer_name),
                builder: EntityBatchBuilder::new_projected(schema, projection.as_deref())?,
            };
            // later entries replace earlier ones with the same key, as a map insert would.
            match entity_map
                .iter_mut()
                .find(|(hash, _)| *hash == schema.serializer_hash)
            {
                Some((_, slot)) => *slot = collector,
                None => entity_map.push((schema.serializer_hash, collector)),
            }
        }

        let mut events: Vec<(u32, EventCollector)> = Vec::with_capacity(event_types.len());
        for &event_type in event_types {
            let collector = EventCollector {
                table_name: event_type.table_name(),
                builder: EventBatchBuilder::try_new(event_type)?,
            };
            match events
                .iter_mut()
                .find(|(id, _)| *id == event_type.message_id())
            {
                Some((_, slot)) => *slot = collector,
                None => events.push((event_type.message_id(), collector)),
            }
        }

        Ok(Self {
            entities: entity_map,
            events,
            collecting: true,
        })
    }

    /// Finish every builder into its single table batch.
    pub(crate) fn finish(self) -> Result<CollectedBatches, DemoError> {
        let mut entity_out = HashMap::with_capacity(self.entities.len());
        for (_, mut collector) in self.entities {
            entity_out.insert(collector.name, collector.builder.finish()?);
        }

        let mut event_out = HashMap::with_capacity(self.events.len());
        for (_, mut collector) in self.events {
            event_out.insert(collector.table_name, collector.builder.finish()?);
        }

        Ok(CollectedBatches {
            entities: entity_out,
            events: event_out,
        })
    }
}

impl Visitor for CollectingVisitor {
    type Error = DemoError;

    fn should_track_entity(&self, serializer_name_hash: u64) -> bool {
        self.entities
            .iter()
            .any(|(hash, _)| *hash == serializer_name_hash)
    }

    /// event-only queries need no entity state (events only use the tick), so entity packets are
    /// not decoded at all.
    fn decode_entities(&self) -> bool {
        !self.entities.is_empty()
    }

    fn set_collecting(&mut self, collecting: bool) {
        self.collecting = collecting;
    }

    fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), Self::Error> {
        if !self.collecting {
            return Ok(());
        }
        let hash = entity.serializer().serializer_name.hash;
        if let Some((_, collector)) = self.entities.iter_mut().find(|(h, _)| *h == hash) {
            collector
                .builder
                .append_entity(ctx.tick(), entity.index(), delta_header, entity);
        }
        Ok(())
    }

    fn on_packet(
        &mut self,
        ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> Result<(), Self::Error> {
        if !self.collecting {
            return Ok(());
        }
        if let Some((_, collector)) = self.events.iter_mut().find(|(id, _)| *id == packet_type)
            && let Some(event) = decode_event(packet_type, data)
        {
            collector.builder.append(ctx.tick(), &event)?;
        }
        Ok(())
    }
}
