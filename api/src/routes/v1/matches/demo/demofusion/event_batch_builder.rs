use std::sync::Arc;

use datafusion::arrow::array::{
    ArrayBuilder, ArrayRef, BinaryBuilder, BooleanBuilder, Float32Builder, Float64Builder,
    Int32Builder, Int64Builder, ListBuilder, RecordBatch, StringBuilder, StructBuilder,
    UInt32Builder, UInt64Builder,
};
use datafusion::arrow::datatypes::{DataType, Schema, SchemaRef};

use super::events::{DecodedEvent, EventType, append_event_to_builders, event_schema};

/// Initial column capacity; builders grow past this as the demo is parsed.
const INITIAL_CAPACITY: usize = 1024;

pub(super) struct EventBatchBuilder {
    schema: SchemaRef,
    tick_builder: Int32Builder,
    field_builders: Vec<Box<dyn ArrayBuilder>>,
}

impl EventBatchBuilder {
    pub(super) fn new(event_type: EventType) -> Self {
        let schema = event_schema(event_type.table_name()).expect("schema not found");
        let field_builders = create_field_builders(&schema, INITIAL_CAPACITY);
        Self {
            schema,
            tick_builder: Int32Builder::with_capacity(INITIAL_CAPACITY),
            field_builders,
        }
    }

    pub(super) fn append(&mut self, tick: i32, event: &DecodedEvent) {
        self.tick_builder.append_value(tick);
        append_event_to_builders(event, &mut self.field_builders);
    }

    /// Finish all builders into the table's single `RecordBatch`.
    pub(super) fn finish(&mut self) -> Result<RecordBatch, datafusion::arrow::error::ArrowError> {
        let mut columns: Vec<ArrayRef> = Vec::with_capacity(self.field_builders.len() + 1);
        columns.push(Arc::new(self.tick_builder.finish()));
        for builder in &mut self.field_builders {
            columns.push(builder.finish());
        }
        RecordBatch::try_new(self.schema.clone(), columns)
    }
}

fn create_field_builders(schema: &Schema, capacity: usize) -> Vec<Box<dyn ArrayBuilder>> {
    schema
        .fields()
        .iter()
        .skip(1) // Skip tick field
        .map(|field| create_builder_for_type(field.data_type(), capacity))
        .collect()
}

fn create_builder_for_type(data_type: &DataType, capacity: usize) -> Box<dyn ArrayBuilder> {
    match data_type {
        DataType::Int64 => Box::new(Int64Builder::with_capacity(capacity)),
        DataType::UInt32 => Box::new(UInt32Builder::with_capacity(capacity)),
        DataType::UInt64 => Box::new(UInt64Builder::with_capacity(capacity)),
        DataType::Float32 => Box::new(Float32Builder::with_capacity(capacity)),
        DataType::Float64 => Box::new(Float64Builder::with_capacity(capacity)),
        DataType::Boolean => Box::new(BooleanBuilder::with_capacity(capacity)),
        DataType::Utf8 => Box::new(StringBuilder::with_capacity(capacity, capacity * 32)),
        DataType::Binary => Box::new(BinaryBuilder::with_capacity(capacity, capacity * 32)),
        DataType::List(inner) => match inner.data_type() {
            DataType::Int64 => Box::new(ListBuilder::new(Int64Builder::new())),
            DataType::UInt32 => Box::new(ListBuilder::new(UInt32Builder::new())),
            DataType::Float32 => Box::new(ListBuilder::new(Float32Builder::new())),
            DataType::Utf8 => Box::new(ListBuilder::new(StringBuilder::new())),
            _ => Box::new(ListBuilder::new(Int32Builder::new())),
        },
        DataType::Struct(fields) => {
            let child_builders: Vec<Box<dyn ArrayBuilder>> = fields
                .iter()
                .map(|f| create_builder_for_type(f.data_type(), capacity))
                .collect();
            Box::new(StructBuilder::new(fields.clone(), child_builders))
        }
        _ => Box::new(Int32Builder::with_capacity(capacity)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_batch_builder_append_and_finish() {
        use valveprotos::deadlock::CCitadelUserMsgBossDamaged;

        let mut builder = EventBatchBuilder::new(EventType::BossDamaged);

        let msg = CCitadelUserMsgBossDamaged {
            objective_team: Some(1),
            objective_id: Some(42),
            entity_damaged: Some(100),
        };
        let event = DecodedEvent::BossDamaged(msg);

        builder.append(1000, &event);
        builder.append(2000, &event);

        let batch = builder.finish().expect("finish should succeed");
        assert_eq!(batch.num_rows(), 2);
        assert!(batch.schema().field_with_name("tick").is_ok());
        assert!(batch.schema().field_with_name("objective_team").is_ok());
        assert!(batch.schema().field_with_name("entity_damaged").is_ok());
    }
}
