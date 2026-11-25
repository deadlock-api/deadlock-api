use crate::error::{Error, Result};
use crate::types::bf16;
use crate::types::int256;
use crate::{Row, row::RowKind, row_metadata::RowMetadata};
use clickhouse_types::data_types::{Column, DataTypeNode, DecimalType, EnumType};
use core::fmt::Display;
use core::marker::PhantomData;
use std::collections::HashMap;

/// How a `ClickHouse` column encodes NULL on the wire.
/// Different column types use different encodings; the deserializer
/// needs to know which strategy to use when reading `Option<T>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NullEncoding {
    /// `Nullable(T)`: a leading byte where 0 = not null, 1 = null.
    Nullable,
    /// `Variant(T1, T2, ...)`: NULL is encoded as discriminator 0xFF,
    /// with no separate null byte and no value bytes following.
    Discriminator,
}

/// This trait is used to validate the schema of a [`crate::Row`] against the parsed RBWNAT schema.
/// Note that [`SchemaValidator`] is also implemented for `()`,
/// which is used to skip validation if the user disabled it.
pub(crate) trait SchemaValidator<R: Row>: Sized {
    type Inner<'serde>: SchemaValidator<R>
    where
        Self: 'serde;
    /// The main entry point. The validation flow based on the [`Row::KIND`].
    /// For container types (nullable, array, map, tuple, variant, etc.),
    /// it will return an [`InnerDataTypeValidator`] instance (see [`InnerDataTypeValidatorKind`]),
    /// which has its own implementation of this method, allowing recursive validation.
    fn validate(&mut self, serde_type: SerdeType) -> Result<Self::Inner<'_>>;
    /// Validates that an identifier exists in the values map for enums,
    /// or stores the variant identifier for the next serde call.
    fn validate_identifier<T: EnumOrVariantIdentifier>(&mut self, value: T) -> Result<()>;
    /// Having the database schema from RBWNAT, the crate can detect that
    /// while the field names and the types are correct, the field order in the struct
    /// does not match the column order in the database schema, and we should use
    /// `MapAccess` instead of `SeqAccess` to seamlessly deserialize the struct.
    fn is_field_order_wrong(&self) -> bool;
    /// Returns the "restored" index of the schema column for the given struct field index.
    /// It is used only if the crate detects that while the field names and the types are correct,
    /// the field order in the struct does not match the column order in the database schema.
    fn get_schema_index(&self, struct_idx: usize) -> Result<usize>;
    // If the database schema contains a tuple with more elements than it is defined in the struct,
    // this method will emit an error indicating that the struct definition is incomplete.
    fn check_tuple_fully_validated(&self) -> Result<()>;
    /// Returns the null encoding of the current column, if known.
    /// Called by the deserializer before reading any bytes in `deserialize_option`
    /// to determine which null-reading strategy to use.
    fn null_encoding(&self) -> Option<NullEncoding> {
        None
    }
}

pub(crate) struct DataTypeValidator<'caller, R: Row> {
    metadata: &'caller RowMetadata,
    current_column_idx: usize,
    _marker: PhantomData<R>,
}

impl<'caller, R: Row> DataTypeValidator<'caller, R> {
    pub(crate) const fn new(metadata: &'caller RowMetadata) -> Self {
        Self {
            metadata,
            current_column_idx: 0,
            _marker: PhantomData::<R>,
        }
    }

    fn get_current_column(&self) -> Result<Option<&Column>> {
        if self.current_column_idx > self.metadata.columns.len() {
            return Ok(None);
        }
        // index is immediately moved to the next column after the root validator is called
        let Some(struct_idx) = self.current_column_idx.checked_sub(1) else {
            return Ok(None);
        };
        let schema_index = self.get_schema_index(struct_idx)?;
        Ok(self.metadata.columns.get(schema_index))
    }

    fn get_current_column_name_and_type(&self) -> Result<(String, &DataTypeNode)> {
        let current_column = self.get_current_column()?;
        Ok(current_column.map_or_else(
            // both should be defined at this point
            || ("Struct".to_owned(), &DataTypeNode::Bool),
            |c| (format!("{}.{}", R::NAME, c.name), &c.data_type),
        ))
    }

    fn err_on_schema_mismatch<'serde>(
        &'serde self,
        data_type: &DataTypeNode,
        serde_type: &SerdeType,
        is_inner: bool,
    ) -> Result<Option<InnerDataTypeValidator<'serde, 'caller, R>>> {
        match R::KIND {
            RowKind::Primitive => Err(Error::SchemaMismatch(format!(
                "While processing row as a primitive: attempting to (de)serialize \
                 ClickHouse type {data_type} as {serde_type} which is not compatible"
            ))),
            RowKind::Vec => Err(Error::SchemaMismatch(format!(
                "While processing row as a vector: attempting to (de)serialize \
                 ClickHouse type {data_type} as {serde_type} which is not compatible"
            ))),
            RowKind::Tuple => Err(Error::SchemaMismatch(format!(
                "While processing row as a tuple: attempting to (de)serialize \
                 ClickHouse type {data_type} as {serde_type} which is not compatible"
            ))),
            RowKind::Struct => {
                if is_inner {
                    let (full_name, full_data_type) = self.get_current_column_name_and_type()?;
                    Err(Error::SchemaMismatch(format!(
                        "While processing column {full_name} defined as {full_data_type}: attempting to (de)serialize \
                        nested ClickHouse type {data_type} as {serde_type} which is not compatible"
                    )))
                } else {
                    Err(Error::SchemaMismatch(format!(
                        "While processing column {}: attempting to (de)serialize \
                        ClickHouse type {} as {} which is not compatible",
                        self.get_current_column_name_and_type()?.0,
                        data_type,
                        serde_type
                    )))
                }
            }
        }
    }
}

impl<'caller, R: Row> SchemaValidator<R> for DataTypeValidator<'caller, R> {
    type Inner<'serde>
        = Option<InnerDataTypeValidator<'serde, 'caller, R>>
    where
        Self: 'serde;

    #[inline]
    fn validate(&'_ mut self, serde_type: SerdeType) -> Result<Self::Inner<'_>> {
        let metadata = self.metadata;
        match R::KIND {
            // `fetch::<i32>` for a "primitive row" type
            RowKind::Primitive => {
                if self.current_column_idx == 0
                    && let [column] = metadata.columns.as_slice()
                {
                    validate_impl(self, &column.data_type, &serde_type, false)
                } else {
                    Err(Error::SchemaMismatch(format!(
                        "Primitive row is expected to be a single value, got columns: {:?}",
                        self.metadata.columns
                    )))
                }
            }
            // `fetch::<(i16, i32)>` or `fetch::<(T, u64)>` for a "tuple row" type
            RowKind::Tuple => {
                match serde_type {
                    SerdeType::Tuple(_) => Ok(Some(InnerDataTypeValidator {
                        root: self,
                        kind: InnerDataTypeValidatorKind::RootTuple(&self.metadata.columns, 0),
                    })),
                    _ => {
                        // should be unreachable
                        Err(Error::SchemaMismatch(format!(
                            "While processing tuple row: expected serde type Tuple(N), got {serde_type}"
                        )))
                    }
                }
            }
            // `fetch::<Vec<i32>>` for a "vector row" type
            RowKind::Vec => {
                let Some(column) = metadata.columns.first() else {
                    return Err(Error::SchemaMismatch(
                        "Expected Array type when validating root level sequence, \
                         but got no columns"
                            .to_owned(),
                    ));
                };
                match &column.data_type {
                    DataTypeNode::Array(inner_type) => {
                        let kind = InnerDataTypeValidatorKind::RootArray(inner_type);
                        Ok(Some(InnerDataTypeValidator { root: self, kind }))
                    }
                    data_type => Err(Error::SchemaMismatch(format!(
                        "Expected Array type when validating root level sequence, but got {data_type}"
                    ))),
                }
            }
            // `fetch::<T>` for a "struct row" type, which is supposed to be the default flow
            RowKind::Struct => {
                if let Some(current_column) = metadata.columns.get(self.current_column_idx) {
                    self.current_column_idx = self.current_column_idx.saturating_add(1);
                    validate_impl(self, &current_column.data_type, &serde_type, false)
                } else {
                    Err(Error::SchemaMismatch(format!(
                        "Struct {} has more fields than columns in the database schema",
                        R::NAME
                    )))
                }
            }
        }
    }

    #[inline]
    fn is_field_order_wrong(&self) -> bool {
        self.metadata.is_field_order_wrong()
    }

    #[inline]
    fn get_schema_index(&self, struct_idx: usize) -> Result<usize> {
        self.metadata.get_schema_index(struct_idx)
    }

    #[cold]
    fn validate_identifier<T: EnumOrVariantIdentifier>(&mut self, _value: T) -> Result<()> {
        Err(internal_error(
            "validate_identifier called on the root validator",
        ))
    }

    #[cold]
    fn check_tuple_fully_validated(&self) -> Result<()> {
        Err(internal_error(
            "check_tuple_fully_validated called on the root validator",
        ))
    }

    fn null_encoding(&self) -> Option<NullEncoding> {
        null_encoding_for(
            &self
                .metadata
                .columns
                .get(self.current_column_idx)?
                .data_type,
        )
    }
}

/// An invariant of the (de)serializer/validator protocol was broken; reported as an error
/// instead of panicking.
#[cold]
fn internal_error(msg: &str) -> Error {
    Error::Custom(format!("internal error in RowBinary validation: {msg}"))
}

/// Returns the wire-level null encoding of the given type, transparently
/// stripping `LowCardinality(T)` and `SimpleAggregateFunction(_, T)` since
/// those are encoded identically to the inner `T`.
///
/// This must stay aligned with the same wrapper stripping in `validate_impl`.
/// If the two drift, `deserialize_option` and `validate(SerdeType::Option)`
/// will disagree on the NULL marker length and the input stream goes out of sync.
fn null_encoding_for(node: &DataTypeNode) -> Option<NullEncoding> {
    let node = node
        .remove_low_cardinality()
        .remove_simple_aggregate_function();
    match node {
        DataTypeNode::Nullable(_) => Some(NullEncoding::Nullable),
        DataTypeNode::Variant(_) => Some(NullEncoding::Discriminator),
        _ => None,
    }
}

/// Having a `ClickHouse` `Map<K, V>` defined as a `HashMap<K, V>` in Rust, Serde will call:
/// - `deserialize_map`     for `Vec<(K, V)>`
/// - `deserialize_<key>`   suitable for `K`
/// - `deserialize_<value>` suitable for `V`
#[derive(Debug)]
pub(crate) enum MapValidatorState {
    Key,
    Value,
}

/// Having a `ClickHouse` `Map<K, V>` defined as `Vec<(K, V)>` in Rust, Serde will call:
/// - `deserialize_seq`     for `Vec<(K, V)>`
/// - `deserialize_tuple`   for `(K, V)`
/// - `deserialize_<key>`   suitable for `K`
/// - `deserialize_<value>` suitable for `V`
#[derive(Debug)]
pub(crate) enum MapAsSequenceValidatorState {
    Tuple,
    Key,
    Value,
}

pub(crate) struct InnerDataTypeValidator<'serde, 'caller, R: Row> {
    root: &'serde DataTypeValidator<'caller, R>,
    kind: InnerDataTypeValidatorKind<'caller>,
}

#[derive(Debug)]
pub(crate) enum InnerDataTypeValidatorKind<'caller> {
    Array(&'caller DataTypeNode),
    FixedString(usize),
    Map(&'caller [Box<DataTypeNode>; 2], MapValidatorState),
    /// Allows supporting `ClickHouse` `Map<K, V>` defined as `Vec<(K, V)>` in Rust
    MapAsSequence(&'caller [Box<DataTypeNode>; 2], MapAsSequenceValidatorState),
    JsonWithHint(&'caller Vec<(String, Box<DataTypeNode>)>),
    Tuple(&'caller [DataTypeNode]),
    /// This is a hack to support deserializing tuples/arrays (and not structs) from fetch calls
    RootTuple(&'caller [Column], usize),
    RootArray(&'caller DataTypeNode),
    Enum(&'caller HashMap<i16, String>),
    Variant(&'caller [DataTypeNode], VariantValidationState),
    Nullable(&'caller DataTypeNode),
}

#[derive(Debug)]
pub(crate) enum VariantValidationState {
    Pending,
    Identifier(u8),
}

impl<R: Row> SchemaValidator<R> for Option<InnerDataTypeValidator<'_, '_, R>> {
    type Inner<'serde>
        = Self
    where
        Self: 'serde;

    #[inline]
    fn validate(&mut self, serde_type: SerdeType) -> Result<Self> {
        let Some(inner) = self.as_mut() else {
            return Ok(None);
        };
        match &mut inner.kind {
            InnerDataTypeValidatorKind::Map(kv, state) => match state {
                MapValidatorState::Key => {
                    let result = validate_impl(inner.root, &kv[0], &serde_type, true);
                    *state = MapValidatorState::Value;
                    result
                }
                MapValidatorState::Value => {
                    let result = validate_impl(inner.root, &kv[1], &serde_type, true);
                    *state = MapValidatorState::Key;
                    result
                }
            },
            InnerDataTypeValidatorKind::MapAsSequence(kv, state) => {
                match state {
                    // the first state is simply skipped, as the same validator
                    // will be called again for the Key and then the Value types
                    MapAsSequenceValidatorState::Tuple => {
                        *state = MapAsSequenceValidatorState::Key;
                        Ok(self.take())
                    }
                    MapAsSequenceValidatorState::Key => {
                        let result = validate_impl(inner.root, &kv[0], &serde_type, true);
                        *state = MapAsSequenceValidatorState::Value;
                        result
                    }
                    MapAsSequenceValidatorState::Value => {
                        let result = validate_impl(inner.root, &kv[1], &serde_type, true);
                        *state = MapAsSequenceValidatorState::Tuple;
                        result
                    }
                }
            }
            InnerDataTypeValidatorKind::JsonWithHint(kv) => {
                kv.iter().try_for_each(|(_, value)| {
                    validate_impl(inner.root, value, &serde_type, true).map(|_| ())
                })?;

                Ok(None)
            }
            InnerDataTypeValidatorKind::Array(inner_type)
            | InnerDataTypeValidatorKind::Nullable(inner_type)
            | InnerDataTypeValidatorKind::RootArray(inner_type) => {
                validate_impl(inner.root, inner_type, &serde_type, true)
            }
            InnerDataTypeValidatorKind::Tuple(elements_types) => {
                if let Some((first, rest)) = elements_types.split_first() {
                    *elements_types = rest;
                    validate_impl(inner.root, first, &serde_type, true)
                } else {
                    let (full_name, full_data_type) =
                        inner.root.get_current_column_name_and_type()?;

                    Err(Error::SchemaMismatch(format!(
                        "While processing column {full_name} defined as {full_data_type}: \
                        attempting to (de)serialize {serde_type} while no more elements are allowed"
                    )))
                }
            }
            InnerDataTypeValidatorKind::FixedString(_len) => {
                Ok(None) // actually unreachable
            }
            InnerDataTypeValidatorKind::RootTuple(columns, current_index) => {
                let columns = *columns;
                if let Some(column) = columns.get(*current_index) {
                    *current_index = current_index.saturating_add(1);

                    validate_impl(inner.root, &column.data_type, &serde_type, true)
                } else {
                    let (full_name, full_data_type) =
                        inner.root.get_current_column_name_and_type()?;

                    Err(Error::SchemaMismatch(format!(
                        "While processing root tuple element {full_name} defined as {full_data_type}: \
                         attempting to (de)serialize {serde_type} while no more elements are allowed"
                    )))
                }
            }
            InnerDataTypeValidatorKind::Variant(possible_types, state) => match state {
                VariantValidationState::Pending => Err(internal_error(
                    "Variant validated before its identifier was read",
                )),
                VariantValidationState::Identifier(value) => {
                    let possible_types = *possible_types;
                    let Some(data_type) = possible_types.get(usize::from(*value)) else {
                        let (full_name, full_data_type) =
                            inner.root.get_current_column_name_and_type()?;

                        return Err(Error::SchemaMismatch(format!(
                            "While processing column {full_name} defined as {full_data_type}: \
                             Variant identifier {value} is out of bounds, max allowed index is {}",
                            possible_types.len().saturating_sub(1)
                        )));
                    };

                    validate_impl(inner.root, data_type, &serde_type, true)
                }
            },
            // TODO - check enum string value correctness in the hashmap?
            //  is this even possible?
            InnerDataTypeValidatorKind::Enum(_values_map) => {
                Err(internal_error("Enum validator called for a nested value"))
            }
        }
    }

    fn validate_identifier<T: EnumOrVariantIdentifier>(&mut self, value: T) -> Result<()> {
        use InnerDataTypeValidatorKind::{Enum, Variant};
        if let Some(inner) = self {
            match T::IDENTIFIER_TYPE {
                IdentifierType::Enum8 | IdentifierType::Enum16 => {
                    if let Enum(values_map) = &inner.kind
                        && !values_map.contains_key(&(value.into_i16()))
                    {
                        let (full_name, full_data_type) =
                            inner.root.get_current_column_name_and_type()?;

                        return Err(Error::SchemaMismatch(format!(
                            "While processing column {full_name} defined as {full_data_type}: \
                            Enum8 value {value} is not present in the database schema"
                        )));
                    }
                }
                IdentifierType::Variant => {
                    if let Variant(possible_types, state) = &mut inner.kind {
                        let id = value.into_u8();
                        if usize::from(id) < possible_types.len() {
                            *state = VariantValidationState::Identifier(id);
                        } else {
                            let (full_name, full_data_type) =
                                inner.root.get_current_column_name_and_type()?;

                            // 0xFF is the NULL discriminator for Variant columns.
                            // reaching here means the Rust field is not Option<T>,
                            // so it cannot represent NULL.
                            let detail = if id == 0xFF {
                                "received NULL (0xFF discriminator), \
                                 but the field is not Option<T>"
                                    .to_owned()
                            } else {
                                format!(
                                    "Variant identifier {id} is out of bounds, \
                                     max allowed index is {}",
                                    possible_types.len().saturating_sub(1)
                                )
                            };

                            return Err(Error::SchemaMismatch(format!(
                                "While processing column {full_name} \
                                 defined as {full_data_type}: {detail}"
                            )));
                        }
                    }
                }
            }
        }

        Ok(())
    }

    #[inline]
    fn is_field_order_wrong(&self) -> bool {
        false
    }

    #[cold]
    fn get_schema_index(&self, _struct_idx: usize) -> Result<usize> {
        Err(internal_error(
            "get_schema_index called on a nested validator",
        ))
    }

    /// Reports the null encoding of the next nested column the validator is
    /// about to descend into. Required so that `deserialize_option` picks the
    /// correct null-reading strategy for nested cases such as
    /// `Vec<Option<Variant>>` (over `Array(Variant(...))`) or
    /// `(_, Option<Variant>)` (over `Tuple(_, Variant(...))`).
    fn null_encoding(&self) -> Option<NullEncoding> {
        let inner = self.as_ref()?;
        let node: &DataTypeNode = match &inner.kind {
            InnerDataTypeValidatorKind::Array(t)
            | InnerDataTypeValidatorKind::RootArray(t)
            | InnerDataTypeValidatorKind::Nullable(t) => t,
            InnerDataTypeValidatorKind::Tuple(elements) => elements.first()?,
            InnerDataTypeValidatorKind::RootTuple(cols, idx) => &cols.get(*idx)?.data_type,
            InnerDataTypeValidatorKind::Map(kv, MapValidatorState::Key) => &kv[0],
            InnerDataTypeValidatorKind::Map(kv, MapValidatorState::Value) => &kv[1],
            InnerDataTypeValidatorKind::MapAsSequence(kv, state) => match state {
                // tuple state is a passthrough: the next validate call only
                // updates state without consuming any wire bytes
                MapAsSequenceValidatorState::Tuple => return None,
                MapAsSequenceValidatorState::Key => &kv[0],
                MapAsSequenceValidatorState::Value => &kv[1],
            },
            InnerDataTypeValidatorKind::Variant(types, VariantValidationState::Identifier(v)) => {
                types.get(*v as usize)?
            }
            // FixedString / Enum / JsonWithHint / Variant(Pending) cannot
            // host an Option<T> at this position
            _ => return None,
        };
        null_encoding_for(node)
    }

    fn check_tuple_fully_validated(&self) -> Result<()> {
        if let Some(inner) = self
            && let InnerDataTypeValidatorKind::Tuple(elements_types) = inner.kind
            && !elements_types.is_empty()
        {
            let (column_name, column_type) = inner.root.get_current_column_name_and_type()?;

            return Err(Error::SchemaMismatch(format!(
                "While processing column {} defined as {}: tuple was not fully (de)serialized; \
                 missing elements: {}; likely, the struct definition for this field is incomplete",
                column_name,
                column_type,
                elements_types
                    .iter()
                    .map(std::string::ToString::to_string)
                    .collect::<Vec<String>>()
                    .join(", ")
            )));
        }

        Ok(())
    }
}

// TODO: is there a way to eliminate multiple branches with similar patterns?
//  static/const dispatch?
//  separate smaller inline functions?
#[inline]
#[expect(
    clippy::too_many_lines,
    reason = "one flat match from serde type to compatible ClickHouse types reads best in one place"
)]
fn validate_impl<'serde, 'caller, R: Row>(
    root: &'serde DataTypeValidator<'caller, R>,
    column_data_type: &'caller DataTypeNode,
    serde_type: &SerdeType,
    is_inner: bool,
) -> Result<Option<InnerDataTypeValidator<'serde, 'caller, R>>> {
    let data_type = column_data_type
        .remove_low_cardinality()
        .remove_simple_aggregate_function();
    match serde_type {
        SerdeType::Bool
            if data_type == &DataTypeNode::Bool || data_type == &DataTypeNode::UInt8 =>
        {
            Ok(None)
        }
        SerdeType::I8 => match data_type {
            DataTypeNode::Int8 => Ok(None),
            DataTypeNode::Enum(EnumType::Enum8, values_map) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Enum(values_map),
            })),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        SerdeType::I16 => match data_type {
            DataTypeNode::Int16 => Ok(None),
            DataTypeNode::Enum(EnumType::Enum16, values_map) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Enum(values_map),
            })),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        SerdeType::I32
            if data_type == &DataTypeNode::Int32
                || data_type == &DataTypeNode::Date32
                || matches!(data_type, DataTypeNode::Time)
                || matches!(
                    data_type,
                    DataTypeNode::Decimal(_, _, DecimalType::Decimal32)
                ) =>
        {
            Ok(None)
        }
        SerdeType::I64
            if data_type == &DataTypeNode::Int64
                || matches!(data_type, DataTypeNode::DateTime64(_, _))
                || matches!(data_type, DataTypeNode::Time64(_))
                || matches!(
                    data_type,
                    DataTypeNode::Decimal(_, _, DecimalType::Decimal64)
                )
                || matches!(data_type, DataTypeNode::Interval(_)) =>
        {
            Ok(None)
        }
        SerdeType::I128
            if data_type == &DataTypeNode::Int128
                || matches!(
                    data_type,
                    DataTypeNode::Decimal(_, _, DecimalType::Decimal128)
                ) =>
        {
            Ok(None)
        }
        SerdeType::U8 if data_type == &DataTypeNode::UInt8 => Ok(None),
        SerdeType::U16
            if data_type == &DataTypeNode::UInt16 || data_type == &DataTypeNode::Date =>
        {
            Ok(None)
        }
        SerdeType::U32
            if data_type == &DataTypeNode::UInt32
                || matches!(data_type, DataTypeNode::DateTime(_))
                || data_type == &DataTypeNode::IPv4 =>
        {
            Ok(None)
        }
        SerdeType::U64 if data_type == &DataTypeNode::UInt64 => Ok(None),
        SerdeType::U128 if data_type == &DataTypeNode::UInt128 => Ok(None),
        SerdeType::F32 if data_type == &DataTypeNode::Float32 => Ok(None),
        SerdeType::F64 if data_type == &DataTypeNode::Float64 => Ok(None),
        SerdeType::Str | SerdeType::String => match data_type {
            DataTypeNode::JsonWithHint(kv) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::JsonWithHint(kv),
            })),
            DataTypeNode::String | DataTypeNode::JSON => Ok(None),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        // allows to work with BLOB strings as well
        SerdeType::Bytes(_) | SerdeType::ByteBuf(_) if data_type == &DataTypeNode::String => {
            Ok(None)
        }
        // Serde's data model doesn't have `(u)int256` so instead we just try to deserialize `[u8; 32]`
        SerdeType::Bytes(int256::BYTE_LEN)
            if data_type == &DataTypeNode::Int256 || data_type == &DataTypeNode::UInt256 =>
        {
            Ok(None)
        }
        SerdeType::Bytes(bf16::BYTE_LEN) if data_type == &DataTypeNode::BFloat16 => Ok(None),
        SerdeType::Option => match data_type {
            DataTypeNode::Nullable(inner_type) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Nullable(inner_type),
            })),
            // variant is implicitly nullable; 0xFF discriminator = NULL.
            // reuse Nullable inner kind as a passthrough so the subsequent
            // SerdeType::Variant call resolves against the Variant data type.
            DataTypeNode::Variant(_) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Nullable(data_type),
            })),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        SerdeType::Seq(_) => match data_type {
            DataTypeNode::Array(inner_type) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(inner_type),
            })),
            // A map can be defined as `Vec<(K, V)>` in the struct
            DataTypeNode::Map(kv) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::MapAsSequence(
                    kv,
                    MapAsSequenceValidatorState::Tuple,
                ),
            })),
            DataTypeNode::Ring | DataTypeNode::LineString => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::Point),
            })),
            DataTypeNode::Polygon => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::Ring),
            })),
            DataTypeNode::MultiPolygon => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::Polygon),
            })),
            DataTypeNode::MultiLineString => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::LineString),
            })),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        SerdeType::Tuple(len) => match data_type {
            DataTypeNode::FixedString(n) => {
                if n == len {
                    Ok(Some(InnerDataTypeValidator {
                        root,
                        kind: InnerDataTypeValidatorKind::FixedString(*n),
                    }))
                } else {
                    let (full_name, full_data_type) = root.get_current_column_name_and_type()?;
                    Err(Error::SchemaMismatch(format!(
                        "While processing column {full_name} defined as {full_data_type}: attempting to (de)serialize \
                        nested ClickHouse type {data_type} as {serde_type}",
                    )))
                }
            }
            DataTypeNode::Tuple(elements) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Tuple(elements),
            })),
            DataTypeNode::Array(inner_type) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(inner_type),
            })),
            DataTypeNode::IPv6 => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::UInt8),
            })),
            DataTypeNode::UUID => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Tuple(UUID_TUPLE_ELEMENTS),
            })),
            DataTypeNode::Point => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Tuple(POINT_TUPLE_ELEMENTS),
            })),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        SerdeType::Map(_) => {
            if let DataTypeNode::Map(kv) = data_type {
                Ok(Some(InnerDataTypeValidator {
                    root,
                    kind: InnerDataTypeValidatorKind::Map(kv, MapValidatorState::Key),
                }))
            } else {
                Err(Error::SchemaMismatch(format!(
                    "Expected Map for {serde_type} call, but got {data_type}"
                )))
            }
        }
        SerdeType::Variant => {
            if let DataTypeNode::Variant(possible_types) = data_type {
                Ok(Some(InnerDataTypeValidator {
                    root,
                    kind: InnerDataTypeValidatorKind::Variant(
                        possible_types,
                        VariantValidationState::Pending,
                    ),
                }))
            } else {
                Err(Error::SchemaMismatch(format!(
                    "Expected Variant for {serde_type} call, but got {data_type}"
                )))
            }
        }

        _ => root.err_on_schema_mismatch(
            data_type,
            serde_type,
            is_inner
                || matches!(column_data_type, DataTypeNode::LowCardinality { .. })
                || matches!(
                    column_data_type,
                    DataTypeNode::SimpleAggregateFunction { .. }
                ),
        ),
    }
}

#[expect(
    clippy::inline_always,
    reason = "validation disabled: these no-ops must vanish from the hot (de)serialization path"
)]
impl<R: Row> SchemaValidator<R> for () {
    type Inner<'serde> = ();

    #[inline(always)]
    fn validate(&mut self, _serde_type: SerdeType) -> Result<()> {
        Ok(())
    }

    #[inline(always)]
    fn is_field_order_wrong(&self) -> bool {
        // We can't detect incorrect field order with just plain `RowBinary` format
        false
    }

    #[inline(always)]
    fn validate_identifier<T: EnumOrVariantIdentifier>(&mut self, _value: T) -> Result<()> {
        Ok(())
    }

    #[cold]
    fn get_schema_index(&self, _struct_idx: usize) -> Result<usize> {
        Err(internal_error("get_schema_index called without validation"))
    }

    #[inline(always)]
    fn check_tuple_fully_validated(&self) -> Result<()> {
        Ok(())
    }
}

/// Which Serde data type (De)serializer used for the given type.
/// Displays into certain Rust types for convenience in errors reporting.
/// See also: available methods in [`serde::Serializer`] and [`serde::Deserializer`].
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum SerdeType {
    Bool,
    I8,
    I16,
    I32,
    I64,
    I128,
    U8,
    U16,
    U32,
    U64,
    U128,
    F32,
    F64,
    Str,
    String,
    Option,
    Variant,
    Bytes(usize),
    ByteBuf(usize),
    Tuple(usize),
    Seq(usize),
    Map(usize),
    // Identifier,
    // Char,
    // Unit,
    // Struct,
    // NewtypeStruct,
    // TupleStruct,
    // UnitStruct,
    // IgnoredAny,
}

impl Display for SerdeType {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Bool => write!(f, "bool"),
            Self::I8 => write!(f, "i8"),
            Self::I16 => write!(f, "i16"),
            Self::I32 => write!(f, "i32"),
            Self::I64 => write!(f, "i64"),
            Self::I128 => write!(f, "i128"),
            Self::U8 => write!(f, "u8"),
            Self::U16 => write!(f, "u16"),
            Self::U32 => write!(f, "u32"),
            Self::U64 => write!(f, "u64"),
            Self::U128 => write!(f, "u128"),
            Self::F32 => write!(f, "f32"),
            Self::F64 => write!(f, "f64"),
            Self::Str => write!(f, "&str"),
            Self::String => write!(f, "String"),
            Self::Bytes(len) => write!(f, "&[u8; {len}]"),
            Self::ByteBuf(_len) => write!(f, "Vec<u8>"),
            Self::Option => write!(f, "Option<T>"),
            Self::Variant => write!(f, "enum"),
            Self::Seq(_len) => write!(f, "Vec<T>"),
            Self::Tuple(len) => write!(f, "a tuple or sequence with length {len}"),
            Self::Map(_len) => write!(f, "Map<K, V>"),
            // SerdeType::Identifier => "identifier",
            // SerdeType::Char => "char",
            // SerdeType::Unit => "()",
            // SerdeType::Struct => "struct",
            // SerdeType::NewtypeStruct => "newtype struct",
            // SerdeType::TupleStruct => "tuple struct",
            // SerdeType::UnitStruct => "unit struct",
            // SerdeType::IgnoredAny => "ignored any",
        }
    }
}

#[derive(Debug)]
pub(crate) enum IdentifierType {
    Enum8,
    Enum16,
    Variant,
}
pub(crate) trait EnumOrVariantIdentifier: Display + Copy {
    const IDENTIFIER_TYPE: IdentifierType;
    fn into_u8(self) -> u8;
    fn into_i16(self) -> i16;
}
impl EnumOrVariantIdentifier for u8 {
    const IDENTIFIER_TYPE: IdentifierType = IdentifierType::Variant;
    // none of these should be ever called
    #[inline]
    fn into_u8(self) -> u8 {
        self
    }
    #[inline]
    fn into_i16(self) -> i16 {
        i16::from(self)
    }
}
impl EnumOrVariantIdentifier for i8 {
    const IDENTIFIER_TYPE: IdentifierType = IdentifierType::Enum8;
    #[inline]
    fn into_i16(self) -> i16 {
        i16::from(self)
    }
    // we need only i16 for enum values HashMap
    #[inline]
    fn into_u8(self) -> u8 {
        self.cast_unsigned()
    }
}
impl EnumOrVariantIdentifier for i16 {
    const IDENTIFIER_TYPE: IdentifierType = IdentifierType::Enum16;
    #[inline]
    fn into_i16(self) -> i16 {
        self
    }
    // should not be ever called
    #[inline]
    fn into_u8(self) -> u8 {
        // the low byte, same as an `as u8` cast
        let [low, _] = self.to_le_bytes();
        low
    }
}

const UUID_TUPLE_ELEMENTS: &[DataTypeNode; 2] = &[DataTypeNode::UInt64, DataTypeNode::UInt64];
const POINT_TUPLE_ELEMENTS: &[DataTypeNode; 2] = &[DataTypeNode::Float64, DataTypeNode::Float64];
