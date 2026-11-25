use clickhouse_types::DataTypeNode;
use clickhouse_types::data_types::{DecimalType, EnumType};
use core::fmt::{Debug, Formatter, Write as _};

pub(super) struct DebugNullMap<'a>(pub &'a [u8]);

impl Debug for DebugNullMap<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        for b in self.0 {
            match b {
                0 => f.write_char('0')?,
                1 => f.write_char('1')?,
                // Flag invalid bytes with brackets
                _ => write!(f, "{{{b:x}}}")?,
            }
        }

        Ok(())
    }
}

pub(super) struct DebugFixedData<'a> {
    pub(super) type_width: usize,
    pub(super) data: &'a [u8],
}

pub(super) struct DebugHex<'a>(&'a [u8]);

impl Debug for DebugFixedData<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.debug_list()
            // `chunks()` rejects a zero width; such data is empty anyway
            .entries(self.data.chunks(self.type_width.max(1)).map(DebugHex))
            .finish()
    }
}

impl Debug for DebugHex<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str("0x")?;

        // Write the data as it appears so there's no confusion;
        // for little-endian values this may be in reverse
        for b in self.0 {
            write!(f, "{b:02x}")?;
        }

        Ok(())
    }
}

pub(super) struct DebugVariableData<'a> {
    pub end_offsets: &'a [usize],
    pub data: &'a [u8],
}

impl Debug for DebugVariableData<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        let mut list = f.debug_list();

        let mut start_offset = 0;

        for &end_offset in self.end_offsets {
            // `impl Debug for fmt::Arguments` forwards to `Display`
            list.entry(&format_args!(
                "\"{}\"",
                self.data
                    .get(start_offset..end_offset)
                    .unwrap_or_default()
                    .escape_ascii()
            ));
            start_offset = end_offset;
        }

        list.finish()
    }
}

pub(super) fn type_fixed_width(data_type: &DataTypeNode) -> Option<usize> {
    match data_type {
        // `Nothing` has one placeholder byte per value
        DataTypeNode::Bool
        | DataTypeNode::UInt8
        | DataTypeNode::Int8
        | DataTypeNode::Enum(EnumType::Enum8, _)
        | DataTypeNode::Nothing => Some(1),
        DataTypeNode::UInt16
        | DataTypeNode::Int16
        | DataTypeNode::BFloat16
        | DataTypeNode::Date
        | DataTypeNode::Enum(EnumType::Enum16, _) => Some(2),
        DataTypeNode::UInt32
        | DataTypeNode::Int32
        | DataTypeNode::Float32
        | DataTypeNode::Decimal(_, _, DecimalType::Decimal32)
        | DataTypeNode::Date32
        | DataTypeNode::DateTime(_)
        | DataTypeNode::Time
        | DataTypeNode::IPv4 => Some(4),
        DataTypeNode::UInt64
        | DataTypeNode::Int64
        | DataTypeNode::Float64
        | DataTypeNode::Decimal(_, _, DecimalType::Decimal64)
        | DataTypeNode::DateTime64(_, _)
        | DataTypeNode::Time64(_)
        | DataTypeNode::Interval(_) => Some(8),
        // `Point` is `Tuple(Float64, Float64)`
        DataTypeNode::UInt128
        | DataTypeNode::Int128
        | DataTypeNode::Decimal(_, _, DecimalType::Decimal128)
        | DataTypeNode::UUID
        | DataTypeNode::IPv6
        | DataTypeNode::Point => Some(16),
        DataTypeNode::UInt256
        | DataTypeNode::Int256
        | DataTypeNode::Decimal(_, _, DecimalType::Decimal256) => Some(32),
        DataTypeNode::FixedString(len) => Some(*len),
        DataTypeNode::SimpleAggregateFunction(_, inner) => type_fixed_width(inner),
        // Not fixed-width: `String`; `Nullable` needs to be handled specially; the width of
        // `LowCardinality` is determined by metadata that comes before column data; `Tuple`s are
        // serialized column-by-column and need a structural layout; `Array`, `Map`,
        // `AggregateFunction`, `Variant`, `Dynamic`, `JSON` and the geo types other than `Point`.
        _ => None,
    }
}
