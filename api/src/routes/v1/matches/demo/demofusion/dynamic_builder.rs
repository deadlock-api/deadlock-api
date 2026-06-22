use std::sync::Arc;

use datafusion::arrow::array::{
    ArrayRef, BinaryBuilder, BooleanBuilder, Float32Builder, Float64Builder, Int32Builder,
    Int64Builder, ListBuilder, NullBuilder, StringBuilder, UInt32Builder, UInt64Builder,
    new_null_array,
};
use datafusion::arrow::datatypes::{DataType, Field};
use haste_core::fieldvalue::FieldValue;

use super::error::Result;

#[allow(
    clippy::cast_possible_truncation,
    reason = "dynamic FieldValue coerced to the column's declared i32 type"
)]
fn push_i32(b: &mut Int32Builder, v: Option<&FieldValue>) {
    match v {
        Some(FieldValue::I64(x)) => b.append_value(*x as i32),
        Some(FieldValue::U64(x)) => b.append_value(*x as i32),
        _ => b.append_null(),
    }
}

fn push_i64(b: &mut Int64Builder, v: Option<&FieldValue>) {
    match v {
        Some(FieldValue::I64(x)) => b.append_value(*x),
        Some(FieldValue::U64(x)) => b.append_value((*x).cast_signed()),
        _ => b.append_null(),
    }
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "dynamic FieldValue coerced to the column's declared u32 type"
)]
fn push_u32(b: &mut UInt32Builder, v: Option<&FieldValue>) {
    match v {
        Some(FieldValue::U64(x)) => b.append_value(*x as u32),
        Some(FieldValue::I64(x)) => b.append_value(*x as u32),
        _ => b.append_null(),
    }
}

fn push_u64(b: &mut UInt64Builder, v: Option<&FieldValue>) {
    match v {
        Some(FieldValue::U64(x)) => b.append_value(*x),
        Some(FieldValue::I64(x)) => b.append_value((*x).cast_unsigned()),
        _ => b.append_null(),
    }
}

fn push_f32(b: &mut Float32Builder, v: Option<&FieldValue>) {
    match v {
        Some(FieldValue::F32(x)) => b.append_value(*x),
        _ => b.append_null(),
    }
}

fn push_f64(b: &mut Float64Builder, v: Option<&FieldValue>) {
    match v {
        Some(FieldValue::F32(x)) => b.append_value(f64::from(*x)),
        _ => b.append_null(),
    }
}

fn push_bool(b: &mut BooleanBuilder, v: Option<&FieldValue>) {
    match v {
        Some(FieldValue::Bool(x)) => b.append_value(*x),
        _ => b.append_null(),
    }
}

fn push_string(b: &mut StringBuilder, v: Option<&FieldValue>) {
    match v {
        Some(FieldValue::String(x)) => match core::str::from_utf8(x) {
            Ok(s) => b.append_value(s),
            Err(_) => b.append_null(),
        },
        _ => b.append_null(),
    }
}

fn push_binary(b: &mut BinaryBuilder, v: Option<&FieldValue>) {
    match v {
        Some(FieldValue::String(x)) => b.append_value(x.as_ref()),
        Some(FieldValue::U64(x)) => b.append_value(x.to_le_bytes()),
        Some(FieldValue::I64(x)) => b.append_value(x.to_le_bytes()),
        Some(FieldValue::F32(x)) => b.append_value(x.to_le_bytes()),
        Some(FieldValue::Bool(x)) => b.append_value([u8::from(*x)]),
        _ => b.append_null(),
    }
}

/// Declares the `DynamicBuilder` enum and its uniform-dispatch methods from a single table of
/// variants. `scalars` are the plain column builders (each with the `push_*` fn that converts a
/// `FieldValue` into it); `lists` are the matching `ListBuilder` wrappers, which reuse the same
/// inner builder type and `push_*` fn on their `.values()`. `ListNull` and `AllNull` are handled
/// separately because they don't follow the table's shape.
macro_rules! dynamic_builder {
    (
        scalars: [ $($s:ident => $sb:ty : $sp:ident),* $(,)? ],
        lists:   [ $($l:ident => $lb:ty : $lp:ident),* $(,)? ],
    ) => {
        pub(super)  enum DynamicBuilder {
            $($s($sb),)*
            $($l(ListBuilder<$lb>),)*
            ListNull(ListBuilder<NullBuilder>),
            /// An always-null column finished as `new_null_array(data_type, len)`. Covers the `Null`
            /// type (unresolvable nested fields) and `FixedSizeList` columns — haste collides
            /// fixed-array element keys, so those decode to null in practice (see
            /// [`super::schema::FieldKind::Plain`]).
            AllNull { data_type: DataType, len: usize },
        }

        impl DynamicBuilder {
            pub(super)  fn append_null(&mut self) {
                match self {
                    $(Self::$s(b) => b.append_null(),)*
                    $(Self::$l(b) => b.append_null(),)*
                    Self::ListNull(b) => b.append_null(),
                    Self::AllNull { len, .. } => *len += 1,
                }
            }

            pub(super)  fn append_field_value(&mut self, value: &FieldValue) -> Result<()> {
                let v = Some(value);
                match self {
                    $(Self::$s(b) => $sp(b, v),)*
                    _ => self.append_null(),
                }
                Ok(())
            }

            /// Append one element to the inner builder of a `List` column. No-op for non-list builders.
            pub(super)  fn push_list_element(&mut self, value: Option<&FieldValue>) {
                match self {
                    $(Self::$l(b) => $lp(b.values(), value),)*
                    Self::ListNull(b) => b.values().append_null(),
                    _ => {}
                }
            }

            /// Close the current row of a `List` column: a present list of the elements pushed since
            /// the previous row, or a null list. No-op for non-list builders.
            pub(super)  fn end_list_row(&mut self, valid: bool) {
                macro_rules! end {
                    ($b:expr) => {
                        if valid { $b.append(true) } else { $b.append_null() }
                    };
                }
                match self {
                    $(Self::$l(b) => end!(b),)*
                    Self::ListNull(b) => end!(b),
                    _ => {}
                }
            }

            pub(super)  fn finish(&mut self) -> ArrayRef {
                match self {
                    $(Self::$s(b) => Arc::new(b.finish()),)*
                    $(Self::$l(b) => Arc::new(b.finish()),)*
                    Self::ListNull(b) => Arc::new(b.finish()),
                    Self::AllNull { data_type, len } => new_null_array(data_type, *len),
                }
            }
        }
    };
}

dynamic_builder! {
    scalars: [
        Int32 => Int32Builder : push_i32,
        Int64 => Int64Builder : push_i64,
        UInt32 => UInt32Builder : push_u32,
        UInt64 => UInt64Builder : push_u64,
        Float32 => Float32Builder : push_f32,
        Float64 => Float64Builder : push_f64,
        Boolean => BooleanBuilder : push_bool,
        String => StringBuilder : push_string,
        Binary => BinaryBuilder : push_binary,
    ],
    lists: [
        ListInt32 => Int32Builder : push_i32,
        ListInt64 => Int64Builder : push_i64,
        ListUInt32 => UInt32Builder : push_u32,
        ListUInt64 => UInt64Builder : push_u64,
        ListFloat32 => Float32Builder : push_f32,
        ListFloat64 => Float64Builder : push_f64,
        ListBoolean => BooleanBuilder : push_bool,
        ListString => StringBuilder : push_string,
        ListBinary => BinaryBuilder : push_binary,
    ],
}

impl DynamicBuilder {
    pub(super) fn new(data_type: &DataType, capacity: usize) -> Self {
        match data_type {
            DataType::Int32 => Self::Int32(Int32Builder::with_capacity(capacity)),
            DataType::Int64 => Self::Int64(Int64Builder::with_capacity(capacity)),
            DataType::UInt32 => Self::UInt32(UInt32Builder::with_capacity(capacity)),
            DataType::UInt64 => Self::UInt64(UInt64Builder::with_capacity(capacity)),
            DataType::Float32 => Self::Float32(Float32Builder::with_capacity(capacity)),
            DataType::Float64 => Self::Float64(Float64Builder::with_capacity(capacity)),
            DataType::Boolean => Self::Boolean(BooleanBuilder::with_capacity(capacity)),
            DataType::Utf8 => Self::String(StringBuilder::with_capacity(capacity, 1024)),
            DataType::List(field) => Self::new_list(field, capacity),
            DataType::Null | DataType::FixedSizeList(..) => Self::AllNull {
                data_type: data_type.clone(),
                len: 0,
            },
            _ => Self::Binary(BinaryBuilder::with_capacity(capacity, 1024)),
        }
    }

    fn new_list(field: &Arc<Field>, capacity: usize) -> Self {
        macro_rules! list {
            ($variant:ident, $inner:expr) => {
                Self::$variant(
                    ListBuilder::with_capacity($inner, capacity).with_field(field.clone()),
                )
            };
        }
        match field.data_type() {
            DataType::Int32 => list!(ListInt32, Int32Builder::with_capacity(capacity)),
            DataType::Int64 => list!(ListInt64, Int64Builder::with_capacity(capacity)),
            DataType::UInt32 => list!(ListUInt32, UInt32Builder::with_capacity(capacity)),
            DataType::UInt64 => list!(ListUInt64, UInt64Builder::with_capacity(capacity)),
            DataType::Float32 => list!(ListFloat32, Float32Builder::with_capacity(capacity)),
            DataType::Float64 => list!(ListFloat64, Float64Builder::with_capacity(capacity)),
            DataType::Boolean => list!(ListBoolean, BooleanBuilder::with_capacity(capacity)),
            DataType::Utf8 => list!(ListString, StringBuilder::with_capacity(capacity, 1024)),
            DataType::Binary => list!(ListBinary, BinaryBuilder::with_capacity(capacity, 1024)),
            DataType::Null => list!(ListNull, NullBuilder::new()),
            _ => Self::ListBinary(
                ListBuilder::with_capacity(BinaryBuilder::with_capacity(capacity, 1024), capacity)
                    .with_field(Arc::new(Field::new("item", DataType::Binary, true))),
            ),
        }
    }

    /// Append one `f32` component to the inner builder of a `List<Float32/Float64>` column
    /// (vector-valued array elements split into per-axis lists). No-op otherwise.
    pub(super) fn push_list_component(&mut self, value: Option<f32>) {
        match self {
            Self::ListFloat32(b) => match value {
                Some(v) => b.values().append_value(v),
                None => b.values().append_null(),
            },
            Self::ListFloat64(b) => match value {
                Some(v) => b.values().append_value(f64::from(v)),
                None => b.values().append_null(),
            },
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_int64_builder() {
        let mut builder = DynamicBuilder::new(&DataType::Int64, 10);
        builder.append_field_value(&FieldValue::I64(42)).unwrap();
        builder.append_null();
        builder.append_field_value(&FieldValue::I64(-100)).unwrap();

        let array = builder.finish();
        assert_eq!(array.len(), 3);
    }

    #[test]
    fn test_float32_builder() {
        let mut builder = DynamicBuilder::new(&DataType::Float32, 10);
        builder.append_field_value(&FieldValue::F32(1.5)).unwrap();
        builder.append_null();

        let array = builder.finish();
        assert_eq!(array.len(), 2);
    }

    #[test]
    fn test_list_builder() {
        let list_type = DataType::List(Arc::new(Field::new("item", DataType::Int32, true)));
        let mut builder = DynamicBuilder::new(&list_type, 10);
        builder.append_null();
        builder.append_null();

        let array = builder.finish();
        assert_eq!(array.len(), 2);
    }

    #[test]
    fn test_list_builder_appends_values() {
        use datafusion::arrow::array::{Array, ListArray};

        let list_type = DataType::List(Arc::new(Field::new("item", DataType::Int64, true)));
        let mut builder = DynamicBuilder::new(&list_type, 4);

        // Row 0: [10, 20]
        builder.push_list_element(Some(&FieldValue::I64(10)));
        builder.push_list_element(Some(&FieldValue::U64(20)));
        builder.end_list_row(true);
        // Row 1: null list
        builder.end_list_row(false);
        // Row 2: [] (present, empty)
        builder.end_list_row(true);

        let array = builder.finish();
        let list = array.as_any().downcast_ref::<ListArray>().unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list.value_length(0), 2);
        assert!(list.is_null(1));
        assert_eq!(list.value_length(2), 0);
    }

    #[test]
    fn test_list_builder_component() {
        use datafusion::arrow::array::{Array, ListArray};

        let list_type = DataType::List(Arc::new(Field::new("item", DataType::Float32, true)));
        let mut builder = DynamicBuilder::new(&list_type, 4);
        builder.push_list_component(Some(1.5));
        builder.push_list_component(None);
        builder.end_list_row(true);

        let array = builder.finish();
        let list = array.as_any().downcast_ref::<ListArray>().unwrap();
        assert_eq!(list.value_length(0), 2);
    }

    #[test]
    fn test_fixed_size_list_builder() {
        let list_type =
            DataType::FixedSizeList(Arc::new(Field::new("item", DataType::Float32, true)), 4);
        let mut builder = DynamicBuilder::new(&list_type, 10);
        builder.append_null();
        builder.append_null();

        let array = builder.finish();
        assert_eq!(array.len(), 2);
    }
}
