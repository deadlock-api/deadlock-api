#![doc=include_str!("mod.md")]
#![deny(missing_docs)]

use crate::error::Error;
use crate::native::string::MaybeUtf8;
use bytes::Bytes;
use core::fmt::{Debug, Formatter};
use std::borrow::Cow;

use hashbrown::HashMap;

pub use array::{ArrayData, ArrayReader};
pub use reader::BlockReadError;

use crate::native::decode::Decode;
pub use clickhouse_types::DataTypeNode;

pub(crate) mod array;
pub mod builder;
pub mod decode;
pub mod encode;
pub(crate) mod reader;
pub(crate) mod string;
mod utils;
pub(crate) mod varuint;
pub(crate) mod writer;

pub(crate) mod block_encoder;
#[cfg(feature = "tcp")]
pub(crate) mod from_row_binary;
#[cfg(feature = "tcp")]
pub(crate) mod to_row_binary;

#[cfg(test)]
mod tests;

/// A block of data in columnar format.
pub struct Block {
    column_names: HashMap<MaybeUtf8, usize>,
    columns: Box<[Column]>,
    num_rows: usize,
}

impl Block {
    /// A block without rows with columns of the given names and types, for tests.
    #[cfg(all(test, feature = "tcp"))]
    pub(crate) fn header(columns: &[(&str, &str)]) -> Self {
        let columns = columns
            .iter()
            .map(|&(name, type_name)| Column {
                name: MaybeUtf8::from_string(name.to_owned()),
                data_type: DataTypeNode::new(type_name).expect("invalid type"),
                type_name: Some(MaybeUtf8::from_string(type_name.to_owned())),
                layout: Layout {
                    kind: LayoutKind::Fixed {
                        type_width: 0,
                        data: Bytes::new(),
                    },
                    nulls: None,
                    num_values: 0,
                },
            })
            .collect();

        Self::from_columns(columns, 0)
    }

    fn from_columns(columns: Vec<Column>, num_rows: usize) -> Self {
        Self {
            column_names: columns
                .iter()
                .enumerate()
                .map(|(i, column)| (column.name.clone(), i))
                .collect(),
            columns: columns.into(),
            num_rows,
        }
    }

    /// The number of rows in this block.
    ///
    /// Note that the size of a single block in a query resultset can be influenced by many things
    /// and does not necessarily represent the full result.
    #[must_use]
    pub const fn num_rows(&self) -> usize {
        self.num_rows
    }

    /// The list of columns in the order returned by the server.
    #[must_use]
    pub fn columns(&self) -> &[Column] {
        &self.columns
    }

    /// Look up a column by name, returning `None` if it is not found (note: case-sensitive).
    #[must_use]
    pub fn column_by_name(&self, name: &str) -> Option<&Column> {
        // Requires `hashbrown` for the `Equivalent` trait
        let idx = *self.column_names.get(name)?;

        self.columns.get(idx)
    }
}

impl Debug for Block {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Block")
            .field("columns", &self.columns)
            .field("num_rows", &self.num_rows)
            .finish_non_exhaustive()
    }
}

/// A single column of data in a [`Block`].
///
/// Decode with [`Column::iter()`].
pub struct Column {
    name: MaybeUtf8,
    data_type: DataTypeNode,
    /// The data type as the server wrote it, if the column was read.
    type_name: Option<MaybeUtf8>,
    layout: Layout,
}

struct Layout {
    kind: LayoutKind,
    nulls: Option<Bytes>,
    // Equivalent to `num_rows` for top-level values, but may be different for nested values
    num_values: usize,
}

enum LayoutKind {
    /// Fixed layout. Width of each cell depends only on [`DataTypeNode`].
    Fixed {
        type_width: usize,
        data: Bytes,
    },
    /// Variable-length data (namely strings)
    Variable {
        /// Ending offset of each string in `data`.
        ///
        /// The offset of the first string is always `0` unless this is empty.
        end_offsets: Box<[usize]>,
        // Each `Bytes` instance is 4 `usizes` (32 bytes on 64-bit),
        // so we save 24 bytes per string by linearizing the string data and storing offsets,
        // assuming many small strings instead of fewer big ones, which also amortizes allocations
        data: Bytes,
    },
    /// Layout determined by `LowCardinality` metadata.
    LowCardinality(LayoutLowCardinality),
    /// Array data. Element data governed by `elem_layout`.
    Array {
        /// Ending index of each array in `elem_layout`.
        end_indices: Box<[usize]>,
        elem_layout: Box<Layout>,
    },
    Tuple {
        layouts: Box<[Layout]>,
    },
    Map {
        key_val_layouts: Box<[Layout; 2]>,
        end_indices: Box<[usize]>,
    },
    /// `Variant` data: one discriminator per value (`0xFF` is `NULL`), and the values of each
    /// variant type in the order of rows.
    Variant {
        discriminators: Bytes,
        variants: Box<[Layout]>,
    },
}

struct LayoutLowCardinality {
    keys: Box<[usize]>,
    dict: Box<Layout>,
    /// If `true`, `key = 0` should decode as `NULL` instead of the placeholder value given.
    is_nullable: bool,
}

impl Column {
    /// Get the column name as returned by the server, or `None` if it is not valid UTF-8.
    ///
    /// This is unlikely to happen if you have control over the column set returned by the query.
    ///
    /// Use [`Self::name_bytes()`] for the raw name.
    pub fn name(&self) -> Option<&str> {
        self.name.as_str()
    }

    /// Get the raw column name as returned by the server.
    pub fn name_bytes(&self) -> &[u8] {
        self.name.as_bytes()
    }

    /// Get the parsed data type of this column.
    pub const fn data_type(&self) -> &DataTypeNode {
        &self.data_type
    }

    /// The width and the data of a fixed-width column without `NULL` values.
    #[cfg(feature = "tcp")]
    pub(crate) fn fixed_data(&self) -> Option<(usize, &[u8])> {
        match (&self.layout.kind, &self.layout.nulls) {
            (LayoutKind::Fixed { type_width, data }, None) => Some((*type_width, data)),
            _ => None,
        }
    }

    /// The values of a `String` column without `NULL` values, one after another.
    ///
    /// The values are raw bytes: they can be invalid UTF-8.
    #[cfg(feature = "tcp")]
    pub(crate) fn string_data(&self) -> Option<&[u8]> {
        match (&self.data_type, &self.layout.kind, &self.layout.nulls) {
            (DataTypeNode::String, LayoutKind::Variable { end_offsets, data }, None) => {
                data.get(..end_offsets.last().copied().unwrap_or(0))
            }
            _ => None,
        }
    }

    /// The data type as the server wrote it, or as [`DataTypeNode`] formats it.
    pub(crate) fn type_name(&self) -> Cow<'_, [u8]> {
        self.type_name.as_ref().map_or_else(
            || Cow::Owned(self.data_type.to_string().into_bytes()),
            |name| Cow::Borrowed(name.as_bytes()),
        )
    }

    /// Decode the data of this column as the given type.
    ///
    /// # Errors
    /// Returns [`Error::SchemaMismatch`] if the type is not compatible with the column type
    /// (as determined by [`Decode::compatible()`]).
    ///
    /// If the column data type is `LowCardinality(_)` or `SimpleAggregateFunction(_)`,
    /// the outer type is removed before the compatibility check.
    #[expect(
        clippy::iter_not_returning_iterator,
        reason = "public API; the iterator is behind the compatibility check's `Result`"
    )]
    pub fn iter<'a, T: Decode<'a>>(&'a self) -> Result<ColumnIter<'a, T>, Error> {
        if !T::compatible(self.data_type.remove_compatible_wrappers()) {
            return Err(Error::SchemaMismatch(format!(
                "incompatible data type {:?} of column {:?}",
                self.data_type, self.name
            )));
        }

        Ok(ColumnIter {
            column: self,
            iter: ArrayData {
                elem_type: &self.data_type,
                layout: &self.layout,
                indices: 0..self.layout.num_values,
            }
            .into_reader_unchecked()?, // we already checked above with a more specific error
        })
    }
}

impl Debug for Column {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Column")
            .field("name", &self.name)
            .field("data_type", &self.data_type)
            .field("num_values", &self.layout.num_values)
            .finish_non_exhaustive()
    }
}

/// Typed iterator over data in a [`Column`].
pub struct ColumnIter<'a, T> {
    column: &'a Column,
    iter: ArrayReader<'a, T>,
}

impl<'a, T> Iterator for ColumnIter<'a, T>
where
    T: Decode<'a> + 'a,
{
    type Item = Result<T, Error>;

    fn next(&mut self) -> Option<Self::Item> {
        self.iter.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.iter.size_hint()
    }
}

impl<T> Debug for ColumnIter<'_, T> {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("ColumnIter")
            .field("column", &self.column)
            .finish_non_exhaustive()
    }
}

impl<'a, T> ColumnIter<'a, T> {
    /// Get the source column of this iterator.
    #[must_use]
    pub const fn column(&self) -> &'a Column {
        self.column
    }
}
