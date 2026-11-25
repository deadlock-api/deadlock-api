//! Conversion of the `RowBinary` format to [`Block`]s.
//!
//! The native TCP protocol accepts only columnar blocks for `INSERT`.
//! [`Insert`](crate::insert::Insert) writes `RowBinary`, so the rows are converted to columns
//! with the column types that the server sent for the target table.

use crate::error::Error;
use crate::native::reader::{VARIANT_NULL_DISCRIMINATOR, lc_dict_type, variant_counts, wire_type};
use crate::native::string::MaybeUtf8;
use crate::native::utils::type_fixed_width;
use crate::native::varuint::ParseVarUInt;
use crate::native::{Block, Column, Layout, LayoutKind, LayoutLowCardinality};
use bytes::BytesMut;
use clickhouse_types::DataTypeNode;
use core::ops::ControlFlow;
use hashbrown::HashMap;

type Step = Result<ControlFlow<()>, Error>;

/// Not enough data for the current row.
const INCOMPLETE: Step = Ok(ControlFlow::Break(()));
const DONE: Step = Ok(ControlFlow::Continue(()));

/// Get the value of a `ControlFlow`, or return `INCOMPLETE`.
macro_rules! try_step {
    ($step:expr) => {
        match $step {
            ControlFlow::Continue(value) => value,
            ControlFlow::Break(()) => return INCOMPLETE,
        }
    };
}

/// Accumulates `RowBinary` rows as columns.
pub(crate) struct RowBinaryColumns {
    columns: Vec<ColumnBuilder>,
    num_rows: usize,
}

struct ColumnBuilder {
    name: MaybeUtf8,
    data_type: DataTypeNode,
    /// The type as the server wrote it.
    type_name: Option<MaybeUtf8>,
    builder: Builder,
}

enum Builder {
    /// `Nothing`: `RowBinary` has no data, the native format has a placeholder byte.
    Nothing {
        len: usize,
    },
    Fixed {
        width: usize,
        data: BytesMut,
    },
    Strings {
        end_offsets: Vec<usize>,
        data: BytesMut,
    },
    Nullable {
        nulls: Vec<u8>,
        inner: Box<Self>,
    },
    Array {
        end_indices: Vec<usize>,
        elem: Box<Self>,
    },
    Tuple(Vec<Self>),
    Map {
        end_indices: Vec<usize>,
        key: Box<Self>,
        value: Box<Self>,
    },
    Variant {
        discriminators: Vec<u8>,
        variants: Vec<Self>,
    },
    LowCardinality(Box<LowCardinalityBuilder>),
}

/// Builds the dictionary and the keys of a `LowCardinality` column.
struct LowCardinalityBuilder {
    keys: Vec<usize>,
    /// The values of the dictionary. For `LowCardinality(Nullable(T))`, the first value means `NULL`.
    dict: Builder,
    /// The `RowBinary` encoding of each value of the dictionary, mapped to its key.
    index: HashMap<Vec<u8>, usize>,
    nullable: bool,
}

impl LowCardinalityBuilder {
    fn new(inner: &DataTypeNode) -> Result<Self, String> {
        let (dict_type, nullable) = lc_dict_type(inner);

        let mut builder = Self {
            keys: Vec::new(),
            dict: Builder::new(dict_type)?,
            index: HashMap::new(),
            nullable,
        };
        builder.reset_dict();
        Ok(builder)
    }

    fn reset_dict(&mut self) {
        self.index.clear();
        self.dict.truncate(0);

        if self.nullable {
            // The key of `NULL`
            self.dict.push_default();
        }
    }

    fn read(&mut self, input: &mut &[u8]) -> Step {
        if self.nullable {
            match try_step!(read_u8(input)) {
                0 => {}
                1 => {
                    self.keys.push(0);
                    return DONE;
                }
                other => {
                    return Err(Error::DataFormat(
                        format!("invalid Nullable flag in RowBinary data: {other}").into(),
                    ));
                }
            }
        }

        let before = *input;
        try_step!(self.dict.read(input)?);

        // `input` is the rest of `before`
        let encoded = before
            .get(..before.len().saturating_sub(input.len()))
            .unwrap_or_default();
        // The value was just read, so the dictionary is not empty
        let new_key = self.dict.len().saturating_sub(1);

        if let Some(&key) = self.index.get(encoded) {
            // The value is in the dictionary already.
            self.dict.truncate(new_key);
            self.keys.push(key);
        } else {
            self.index.insert(encoded.to_vec(), new_key);
            self.keys.push(new_key);
        }

        DONE
    }

    fn take(&mut self) -> Result<LayoutLowCardinality, Error> {
        let dict = self.dict.take(self.dict.len())?;
        let keys = core::mem::take(&mut self.keys);
        self.reset_dict();

        Ok(LayoutLowCardinality {
            keys: keys.into(),
            dict: Box::new(dict),
            is_nullable: self.nullable,
        })
    }
}

impl RowBinaryColumns {
    /// Prepare to read rows with the columns of `header`.
    pub(crate) fn new(header: &Block) -> Result<Self, Error> {
        let columns = header
            .columns
            .iter()
            .map(|column| {
                let data_type = column.data_type.clone();
                let builder = Builder::new(&data_type).map_err(|e| {
                    Error::Unsupported(format!(
                        "cannot insert column `{}` of type {}: {e}",
                        column.name, column.data_type
                    ))
                })?;

                Ok(ColumnBuilder {
                    name: column.name.clone(),
                    data_type,
                    type_name: column.type_name.clone(),
                    builder,
                })
            })
            .collect::<Result<_, Error>>()?;

        Ok(Self {
            columns,
            num_rows: 0,
        })
    }

    pub(crate) const fn num_rows(&self) -> usize {
        self.num_rows
    }

    /// Read one row from `input` and advance it.
    ///
    /// Returns `Ok(false)` and leaves `input` and the columns unchanged
    /// if `input` does not contain a complete row.
    pub(crate) fn read_row(&mut self, input: &mut &[u8]) -> Result<bool, Error> {
        let mut rest = *input;

        for index in 0..self.columns.len() {
            let result = match self.columns.get_mut(index) {
                Some(column) => column.builder.read(&mut rest),
                None => Ok(ControlFlow::Continue(())),
            };

            match result {
                Ok(ControlFlow::Continue(())) => {}
                // `index < self.columns.len()`, so this cannot overflow
                Ok(ControlFlow::Break(())) => {
                    self.truncate_columns(index.saturating_add(1));
                    return Ok(false);
                }
                Err(e) => {
                    self.truncate_columns(index.saturating_add(1));
                    return Err(e);
                }
            }
        }

        // Every row takes memory, so this cannot overflow
        self.num_rows = self.num_rows.saturating_add(1);
        *input = rest;
        Ok(true)
    }

    /// Remove the partially read row from the first `count` columns.
    fn truncate_columns(&mut self, count: usize) {
        let num_rows = self.num_rows;

        for column in self.columns.iter_mut().take(count) {
            column.builder.truncate(num_rows);
        }
    }

    /// Return the accumulated rows as a block and start a new one.
    pub(crate) fn take_block(&mut self) -> Result<Block, Error> {
        let num_rows = core::mem::take(&mut self.num_rows);

        let columns = self
            .columns
            .iter_mut()
            .map(|column| {
                Ok(Column {
                    name: column.name.clone(),
                    type_name: column.type_name.clone(),
                    data_type: column.data_type.clone(),
                    layout: column.builder.take(num_rows)?,
                })
            })
            .collect::<Result<_, Error>>()?;

        Ok(Block::from_columns(columns, num_rows))
    }
}

const fn take<'a>(input: &mut &'a [u8], len: usize) -> ControlFlow<(), &'a [u8]> {
    match input.split_at_checked(len) {
        Some((value, rest)) => {
            *input = rest;
            ControlFlow::Continue(value)
        }
        None => ControlFlow::Break(()),
    }
}

fn read_u8(input: &mut &[u8]) -> ControlFlow<(), u8> {
    let (&byte, rest) = input
        .split_first()
        .map_or(ControlFlow::Break(()), ControlFlow::Continue)?;
    *input = rest;
    ControlFlow::Continue(byte)
}

fn read_len(input: &mut &[u8]) -> Result<ControlFlow<(), usize>, Error> {
    match ParseVarUInt::default()
        .feed(&mut *input)
        .map_err(|e| Error::DataFormat(format!("invalid length in RowBinary data: {e}").into()))?
    {
        ControlFlow::Break(len) => {
            let len = usize::try_from(len).ok().ok_or_else(|| {
                Error::DataFormat(format!("length in RowBinary data is out of range: {len}").into())
            })?;

            // Every value takes at least one byte.
            if len > input.len() {
                return Ok(ControlFlow::Break(()));
            }

            Ok(ControlFlow::Continue(len))
        }
        ControlFlow::Continue(()) => Ok(ControlFlow::Break(())),
    }
}

impl Builder {
    fn new(data_type: &DataTypeNode) -> Result<Self, String> {
        let wire = wire_type(data_type);

        if *wire == DataTypeNode::Nothing {
            return Ok(Self::Nothing { len: 0 });
        }

        if let Some(width) = type_fixed_width(&wire).filter(|&width| width > 0) {
            return Ok(Self::Fixed {
                width,
                data: BytesMut::new(),
            });
        }

        Ok(match &*wire {
            DataTypeNode::String | DataTypeNode::JSON | DataTypeNode::JsonWithHint(_) => {
                Self::Strings {
                    end_offsets: Vec::new(),
                    data: BytesMut::new(),
                }
            }
            DataTypeNode::Nullable(inner) => Self::Nullable {
                nulls: Vec::new(),
                inner: Box::new(Self::new(inner)?),
            },
            DataTypeNode::LowCardinality(inner) => {
                Self::LowCardinality(Box::new(LowCardinalityBuilder::new(inner)?))
            }
            DataTypeNode::Array(elem) => Self::Array {
                end_indices: Vec::new(),
                elem: Box::new(Self::new(elem)?),
            },
            DataTypeNode::Tuple(types) => {
                Self::Tuple(types.iter().map(Self::new).collect::<Result<_, _>>()?)
            }
            DataTypeNode::Map([key, value]) => Self::Map {
                end_indices: Vec::new(),
                key: Box::new(Self::new(key)?),
                value: Box::new(Self::new(value)?),
            },
            DataTypeNode::Variant(types) => Self::Variant {
                discriminators: Vec::new(),
                variants: types.iter().map(Self::new).collect::<Result<_, _>>()?,
            },
            other => return Err(format!("type {other} is not supported")),
        })
    }

    fn read(&mut self, input: &mut &[u8]) -> Step {
        match self {
            // One per row, so this cannot overflow
            Self::Nothing { len } => *len = len.saturating_add(1),
            Self::Fixed { width, data } => {
                data.extend_from_slice(try_step!(take(input, *width)));
            }
            Self::Strings { end_offsets, data } => {
                let len = try_step!(read_len(input)?);
                data.extend_from_slice(try_step!(take(input, len)));
                end_offsets.push(data.len());
            }
            Self::Nullable { nulls, inner } => match try_step!(read_u8(input)) {
                0 => {
                    nulls.push(0);
                    try_step!(inner.read(input)?);
                }
                1 => {
                    nulls.push(1);
                    inner.push_default();
                }
                other => {
                    return Err(Error::DataFormat(
                        format!("invalid Nullable flag in RowBinary data: {other}").into(),
                    ));
                }
            },
            Self::Array { end_indices, elem } => {
                let len = try_step!(read_len(input)?);

                for _ in 0..len {
                    try_step!(elem.read(input)?);
                }

                end_indices.push(elem.len());
            }
            Self::Tuple(elements) => {
                for element in elements {
                    try_step!(element.read(input)?);
                }
            }
            Self::Map {
                end_indices,
                key,
                value,
            } => {
                let len = try_step!(read_len(input)?);

                for _ in 0..len {
                    try_step!(key.read(input)?);
                    try_step!(value.read(input)?);
                }

                end_indices.push(key.len());
            }
            Self::Variant {
                discriminators,
                variants,
            } => {
                let discriminator = try_step!(read_u8(input));

                if discriminator != VARIANT_NULL_DISCRIMINATOR {
                    let variant =
                        variants
                            .get_mut(usize::from(discriminator))
                            .ok_or_else(|| {
                                Error::DataFormat(
                                    format!(
                                        "Variant discriminator {discriminator} is out of range"
                                    )
                                    .into(),
                                )
                            })?;
                    try_step!(variant.read(input)?);
                }

                discriminators.push(discriminator);
            }
            Self::LowCardinality(lc) => {
                try_step!(lc.read(input)?);
            }
        }

        DONE
    }

    /// Append the default value, which is stored for `NULL`.
    fn push_default(&mut self) {
        match self {
            Self::Nothing { len } => *len = len.saturating_add(1),
            Self::Fixed { width, data } => data.resize(data.len().saturating_add(*width), 0),
            Self::Strings { end_offsets, data } => end_offsets.push(data.len()),
            Self::Nullable { nulls, inner } => {
                nulls.push(1);
                inner.push_default();
            }
            Self::Array { end_indices, elem } => end_indices.push(elem.len()),
            Self::Tuple(elements) => elements.iter_mut().for_each(Self::push_default),
            Self::Map {
                end_indices, key, ..
            } => end_indices.push(key.len()),
            Self::Variant { discriminators, .. } => {
                discriminators.push(VARIANT_NULL_DISCRIMINATOR);
            }
            // Only for `LowCardinality(Nullable(T))`: `Nullable(LowCardinality(T))` is not allowed.
            Self::LowCardinality(lc) => lc.keys.push(0),
        }
    }

    /// The number of values.
    fn len(&self) -> usize {
        match self {
            Self::Nothing { len } => *len,
            Self::Fixed { width, data } => data.len().checked_div(*width).unwrap_or(0),
            Self::Strings { end_offsets, .. } => end_offsets.len(),
            Self::Nullable { nulls, .. } => nulls.len(),
            Self::Array { end_indices, .. } | Self::Map { end_indices, .. } => end_indices.len(),
            Self::Tuple(elements) => elements.first().map_or(0, Self::len),
            Self::Variant { discriminators, .. } => discriminators.len(),
            Self::LowCardinality(lc) => lc.keys.len(),
        }
    }

    /// Keep only the first `len` values.
    fn truncate(&mut self, len: usize) {
        match self {
            Self::Nothing { len: current } => *current = len.min(*current),
            Self::Fixed { width, data } => data.truncate(len.saturating_mul(*width)),
            Self::Strings { end_offsets, data } => {
                end_offsets.truncate(len);
                data.truncate(end_offsets.last().copied().unwrap_or(0));
            }
            Self::Nullable { nulls, inner } => {
                nulls.truncate(len);
                inner.truncate(len);
            }
            Self::Array { end_indices, elem } => {
                end_indices.truncate(len);
                elem.truncate(end_indices.last().copied().unwrap_or(0));
            }
            Self::Tuple(elements) => {
                for element in elements {
                    element.truncate(len);
                }
            }
            Self::Map {
                end_indices,
                key,
                value,
            } => {
                end_indices.truncate(len);
                let entries = end_indices.last().copied().unwrap_or(0);
                key.truncate(entries);
                value.truncate(entries);
            }
            Self::Variant {
                discriminators,
                variants,
            } => {
                discriminators.truncate(len);

                // The discriminators were checked when they were read.
                if let Ok(counts) = variant_counts(discriminators, variants.len()) {
                    for (variant, count) in variants.iter_mut().zip(counts) {
                        variant.truncate(count);
                    }
                }
            }
            // Values that only removed rows use stay in the dictionary, which is valid.
            Self::LowCardinality(lc) => lc.keys.truncate(len),
        }
    }

    /// Return the accumulated values as a layout and start again.
    fn take(&mut self, num_values: usize) -> Result<Layout, Error> {
        let len = self.len();

        if len != num_values {
            return Err(Error::Other(
                format!("BUG: column has {len} values, expected {num_values}").into(),
            ));
        }

        let (kind, nulls) = match self {
            Self::Nothing { len } => {
                *len = 0;
                (
                    LayoutKind::Fixed {
                        type_width: 1,
                        data: vec![b'0'; num_values].into(),
                    },
                    None,
                )
            }
            Self::Fixed { width, data } => (
                LayoutKind::Fixed {
                    type_width: *width,
                    data: data.split().freeze(),
                },
                None,
            ),
            Self::Strings { end_offsets, data } => (
                LayoutKind::Variable {
                    end_offsets: core::mem::take(end_offsets).into(),
                    data: data.split().freeze(),
                },
                None,
            ),
            Self::Nullable { nulls, inner } => {
                let layout = inner.take(num_values)?;
                return Ok(Layout {
                    nulls: Some(core::mem::take(nulls).into()),
                    ..layout
                });
            }
            Self::Array { end_indices, elem } => {
                let elem_layout = elem.take(elem.len())?;
                (
                    LayoutKind::Array {
                        end_indices: core::mem::take(end_indices).into(),
                        elem_layout: Box::new(elem_layout),
                    },
                    None,
                )
            }
            Self::Tuple(elements) => (
                LayoutKind::Tuple {
                    layouts: elements
                        .iter_mut()
                        .map(|element| element.take(num_values))
                        .collect::<Result<_, _>>()?,
                },
                None,
            ),
            Self::Map {
                end_indices,
                key,
                value,
            } => {
                let entries = key.len();
                let key_layout = key.take(entries)?;
                let value_layout = value.take(entries)?;
                (
                    LayoutKind::Map {
                        key_val_layouts: Box::new([key_layout, value_layout]),
                        end_indices: core::mem::take(end_indices).into(),
                    },
                    None,
                )
            }
            Self::Variant {
                discriminators,
                variants,
            } => (
                LayoutKind::Variant {
                    discriminators: core::mem::take(discriminators).into(),
                    variants: variants
                        .iter_mut()
                        .map(|variant| variant.take(variant.len()))
                        .collect::<Result<_, _>>()?,
                },
                None,
            ),
            Self::LowCardinality(lc) => (LayoutKind::LowCardinality(lc.take()?), None),
        };

        Ok(Layout {
            kind,
            nulls,
            num_values,
        })
    }
}
