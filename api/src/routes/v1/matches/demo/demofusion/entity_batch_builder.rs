//! Builder for accumulating entity updates into Arrow `RecordBatches`.
//!
//! This accumulates entity data and builds `RecordBatches` for `DataFusion` consumption.
//!
//! The builder is projection-aware: it only materializes the columns requested by
//! the query's projection. Decoding still happens for the full entity (the wire
//! format is delta-encoded and cannot be partially decoded), but Arrow column
//! construction — the dominant cost for wide entity tables like `CCitadelPlayerPawn`
//! — is limited to the projected columns.

use std::sync::Arc;

use datafusion::arrow::array::{ArrayRef, Int32Builder, StringBuilder};
use datafusion::arrow::datatypes::SchemaRef;
use datafusion::arrow::record_batch::{RecordBatch, RecordBatchOptions};

use super::dynamic_builder::DynamicBuilder;
use super::schema::{ArrayLen, ElemExtract, EntitySchema, FieldKind};
use haste_core::entities::DeltaHeader;
use haste_core::fieldvalue::FieldValue;
use haste_core::fxhash::add_u64_to_hash;

/// Initial column capacity. Builders grow past this as the demo is parsed; it
/// only sizes the first allocation.
const INITIAL_CAPACITY: usize = 8192;

/// One projected entity field. A single entity field key may expand into multiple
/// Arrow columns (e.g. a `Vector3` → 3 `Float32` columns); `subcols` lists only the
/// projected sub-columns as `(offset_within_value, field_builder_index)`.
struct ProjField {
    key: u64,
    subcols: Vec<(usize, usize)>,
}

/// A projected dynamic-array field. `base_key` holds the element count; each entry in `cols`
/// pairs an [`ElemExtract`] with the field-builder index of its `List` column.
struct ArrayField {
    base_key: u64,
    len: ArrayLen,
    cols: Vec<(ElemExtract, usize)>,
}

/// Assembly source for one output column, in projected-schema order.
enum OutCol {
    Tick,
    EntityIndex,
    DeltaType,
    Field(usize),
}

pub(super) struct EntityBatchBuilder {
    schema: SchemaRef,
    out_cols: Vec<OutCol>,
    proj_fields: Vec<ProjField>,
    array_fields: Vec<ArrayField>,
    tick_builder: Option<Int32Builder>,
    entity_index_builder: Option<Int32Builder>,
    delta_type_builder: Option<StringBuilder>,
    field_builders: Vec<DynamicBuilder>,
    row_count: usize,
}

impl EntityBatchBuilder {
    /// Build for a projection — `projection` is a list of column indices into the
    /// full entity schema, in output order (matching `DataFusion`'s `scan` contract).
    /// `None` means all columns.
    pub(super) fn new_projected(
        entity_schema: &EntitySchema,
        projection: Option<&[usize]>,
    ) -> Self {
        let batch_size = INITIAL_CAPACITY;
        let full_schema = &entity_schema.arrow_schema;
        let total_cols = full_schema.fields().len();

        let proj: Vec<usize> = match projection {
            Some(p) => p.to_vec(),
            None => (0..total_cols).collect(),
        };

        let output_schema: SchemaRef = Arc::new(
            full_schema
                .project(&proj)
                .expect("projection indices valid for entity schema"),
        );

        // Map each entity-field Arrow column (index >= 3) to (field_index, offset).
        let field_col_info = build_field_col_info(&entity_schema.field_column_counts);

        let mut out_cols = Vec::with_capacity(proj.len());
        let mut field_builders = Vec::new();
        let mut tick_builder = None;
        let mut entity_index_builder = None;
        let mut delta_type_builder = None;

        // field_index -> index into proj_fields / array_fields (for grouping projected sub-columns)
        let mut proj_field_index: std::collections::HashMap<usize, usize> =
            std::collections::HashMap::new();
        let mut proj_fields: Vec<ProjField> = Vec::new();
        let mut array_field_index: std::collections::HashMap<usize, usize> =
            std::collections::HashMap::new();
        let mut array_fields: Vec<ArrayField> = Vec::new();

        for &col in &proj {
            match col {
                0 => {
                    tick_builder = Some(Int32Builder::with_capacity(batch_size));
                    out_cols.push(OutCol::Tick);
                }
                1 => {
                    entity_index_builder = Some(Int32Builder::with_capacity(batch_size));
                    out_cols.push(OutCol::EntityIndex);
                }
                2 => {
                    delta_type_builder =
                        Some(StringBuilder::with_capacity(batch_size, batch_size * 8));
                    out_cols.push(OutCol::DeltaType);
                }
                c => {
                    let (field_index, offset) = field_col_info[c - 3];
                    let fb_idx = field_builders.len();
                    field_builders.push(DynamicBuilder::new(
                        full_schema.field(c).data_type(),
                        batch_size,
                    ));
                    out_cols.push(OutCol::Field(fb_idx));

                    let key = entity_schema.field_keys[field_index];
                    match &entity_schema.field_kinds[field_index] {
                        FieldKind::Plain => {
                            let pf_idx =
                                *proj_field_index.entry(field_index).or_insert_with(|| {
                                    proj_fields.push(ProjField {
                                        key,
                                        subcols: Vec::new(),
                                    });
                                    proj_fields.len() - 1
                                });
                            proj_fields[pf_idx].subcols.push((offset, fb_idx));
                        }
                        FieldKind::DynList { extracts, len } => {
                            let af_idx =
                                *array_field_index.entry(field_index).or_insert_with(|| {
                                    array_fields.push(ArrayField {
                                        base_key: key,
                                        len: *len,
                                        cols: Vec::new(),
                                    });
                                    array_fields.len() - 1
                                });
                            array_fields[af_idx]
                                .cols
                                .push((extracts[offset].clone(), fb_idx));
                        }
                    }
                }
            }
        }

        Self {
            schema: output_schema,
            out_cols,
            proj_fields,
            array_fields,
            tick_builder,
            entity_index_builder,
            delta_type_builder,
            field_builders,
            row_count: 0,
        }
    }

    pub(super) fn append_entity(
        &mut self,
        tick: i32,
        entity_index: i32,
        delta_type: DeltaHeader,
        entity: &haste_core::entities::Entity,
    ) {
        if let Some(b) = &mut self.tick_builder {
            b.append_value(tick);
        }
        if let Some(b) = &mut self.entity_index_builder {
            b.append_value(entity_index);
        }
        if let Some(b) = &mut self.delta_type_builder {
            b.append_value(delta_header_to_str(delta_type));
        }

        if delta_type == DeltaHeader::DELETE || delta_type == DeltaHeader::LEAVE {
            // append_null on a list builder yields a null list, so this nulls every column kind.
            for builder in &mut self.field_builders {
                builder.append_null();
            }
        } else {
            for pf in &self.proj_fields {
                if let Some(value) = entity.get_field_value(&pf.key) {
                    for &(offset, fb_idx) in &pf.subcols {
                        append_subcol(&mut self.field_builders[fb_idx], value, offset);
                    }
                } else {
                    for &(_, fb_idx) in &pf.subcols {
                        self.field_builders[fb_idx].append_null();
                    }
                }
            }
            for af in &self.array_fields {
                // Dynamic arrays store their element count at the base key (absent ⇒ never set);
                // fixed arrays have a statically known length and are always present.
                let (count, present) = match af.len {
                    ArrayLen::Dynamic => match entity.get_field_value(&af.base_key) {
                        Some(FieldValue::U64(n)) => (*n, true),
                        _ => (0, false),
                    },
                    ArrayLen::Fixed(n) => (n as u64, true),
                };
                for (extract, fb_idx) in &af.cols {
                    let builder = &mut self.field_builders[*fb_idx];
                    for i in 0..count {
                        let elem_key = add_u64_to_hash(af.base_key, add_u64_to_hash(0, i));
                        match extract {
                            ElemExtract::Whole => {
                                builder.push_list_element(entity.get_field_value(&elem_key));
                            }
                            ElemExtract::Component(c) => {
                                let v = entity
                                    .get_field_value(&elem_key)
                                    .and_then(|v| vector_component(v, *c));
                                builder.push_list_component(v);
                            }
                            ElemExtract::SubKey { steps, comp } => {
                                let key = fold_key(elem_key, steps);
                                let v = entity.get_field_value(&key);
                                match comp {
                                    None => builder.push_list_element(v),
                                    Some(c) => builder.push_list_component(
                                        v.and_then(|v| vector_component(v, *c)),
                                    ),
                                }
                            }
                        }
                    }
                    builder.end_list_row(present);
                }
            }
        }

        self.row_count += 1;
    }

    /// Finish all builders into the table's single `RecordBatch`.
    pub(super) fn finish(&mut self) -> Result<RecordBatch, datafusion::arrow::error::ArrowError> {
        let row_count = self.row_count;
        let mut field_arrays: Vec<Option<ArrayRef>> = self
            .field_builders
            .iter_mut()
            .map(|b| Some(b.finish()))
            .collect();
        let mut tick = self
            .tick_builder
            .as_mut()
            .map(datafusion::arrow::array::PrimitiveBuilder::finish);
        let mut entity_index = self
            .entity_index_builder
            .as_mut()
            .map(datafusion::arrow::array::PrimitiveBuilder::finish);
        let mut delta_type = self
            .delta_type_builder
            .as_mut()
            .map(datafusion::arrow::array::GenericByteBuilder::finish);

        let mut arrays: Vec<ArrayRef> = Vec::with_capacity(self.out_cols.len());
        for out in &self.out_cols {
            match out {
                OutCol::Tick => arrays.push(Arc::new(tick.take().unwrap())),
                OutCol::EntityIndex => arrays.push(Arc::new(entity_index.take().unwrap())),
                OutCol::DeltaType => arrays.push(Arc::new(delta_type.take().unwrap())),
                OutCol::Field(idx) => arrays.push(field_arrays[*idx].take().unwrap()),
            }
        }

        self.row_count = 0;

        RecordBatch::try_new_with_options(
            self.schema.clone(),
            arrays,
            &RecordBatchOptions::new().with_row_count(Some(row_count)),
        )
    }
}

/// Fold `var_name`-hash steps onto a dynamic array element key to reach a struct leaf,
/// matching haste's positional field-path key construction.
fn fold_key(mut key: u64, steps: &[u64]) -> u64 {
    for &step in steps {
        key = add_u64_to_hash(key, step);
    }
    key
}

/// View a vector-valued field's components as a slice, or `None` if it isn't a vector.
fn vector_slice(value: &FieldValue) -> Option<&[f32]> {
    match value {
        FieldValue::Vector3(a) | FieldValue::QAngle(a) => Some(&a[..]),
        FieldValue::Vector2(a) => Some(&a[..]),
        FieldValue::Vector4(a) => Some(&a[..]),
        _ => None,
    }
}

/// Extract component `c` of a vector-valued field, or `None` if the value isn't a vector.
fn vector_component(value: &FieldValue, c: usize) -> Option<f32> {
    vector_slice(value).and_then(|a| a.get(c).copied())
}

fn append_subcol(builder: &mut DynamicBuilder, value: &FieldValue, offset: usize) {
    match vector_slice(value) {
        // Scalar value: append it directly.
        None => {
            let _ = builder.append_field_value(value);
        }
        Some(arr) => match arr.get(offset).copied() {
            Some(v) => {
                let _ = builder.append_field_value(&FieldValue::F32(v));
            }
            None => builder.append_null(),
        },
    }
}

/// For each entity-field Arrow column (in order, starting at Arrow index 3),
/// record which entity field it belongs to and the offset within that field's value.
fn build_field_col_info(field_column_counts: &[usize]) -> Vec<(usize, usize)> {
    field_column_counts
        .iter()
        .enumerate()
        .flat_map(|(field_index, &count)| (0..count).map(move |offset| (field_index, offset)))
        .collect()
}

fn delta_header_to_str(delta: DeltaHeader) -> &'static str {
    match delta {
        DeltaHeader::CREATE => "create",
        DeltaHeader::UPDATE => "update",
        DeltaHeader::DELETE => "delete",
        DeltaHeader::LEAVE => "leave",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use datafusion::arrow::datatypes::{DataType, Field, Schema};

    fn make_simple_entity_schema() -> EntitySchema {
        let arrow_schema = Arc::new(Schema::new(vec![
            Field::new("tick", DataType::Int32, false),
            Field::new("entity_index", DataType::Int32, false),
            Field::new("delta_type", DataType::Utf8, false),
            Field::new("health", DataType::Int32, true),
        ]));

        EntitySchema {
            serializer_name: Arc::from("TestEntity"),
            serializer_hash: 12345,
            arrow_schema,
            field_keys: vec![100],
            field_column_counts: vec![1],
            field_kinds: vec![FieldKind::Plain],
        }
    }

    #[test]
    fn test_new_creates_empty_builder() {
        let schema = make_simple_entity_schema();
        let builder = EntityBatchBuilder::new_projected(&schema, None);

        assert_eq!(builder.row_count, 0);
    }

    #[test]
    fn test_projection_subset_and_order() {
        let schema = make_simple_entity_schema();
        // Project delta_type (2), tick (0) — reordered subset, omitting health.
        let builder = EntityBatchBuilder::new_projected(&schema, Some(&[2, 0]));

        assert_eq!(builder.schema.fields().len(), 2);
        assert_eq!(builder.schema.field(0).name(), "delta_type");
        assert_eq!(builder.schema.field(1).name(), "tick");
        // No field builders since "health" was not projected.
        assert!(builder.field_builders.is_empty());
        assert!(builder.proj_fields.is_empty());
    }
}
