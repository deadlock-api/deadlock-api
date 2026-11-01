//! Query results as JSON, for `/v1/sql` and the MCP tools.

use std::sync::Arc;

use arrow_duckdb::compute::cast;
use arrow_duckdb::json::WriterBuilder;
use arrow_duckdb::json::writer::JsonFormat;
use duckdb::arrow::array::{AsArray as _, StructArray};
use duckdb::arrow::datatypes::{DataType, FieldRef, Fields};
use duckdb::arrow::error::ArrowError;
use duckdb::arrow::record_batch::RecordBatch;

/// Writes rows as JSON objects in column order, framed by `F`: a JSON array or NDJSON.
pub(crate) fn write_json<F: JsonFormat>(batches: &[RecordBatch]) -> Result<Vec<u8>, ArrowError> {
    let mut writer = WriterBuilder::new()
        .with_explicit_nulls(true)
        .build::<_, F>(Vec::new());
    for batch in batches.iter().filter(|b| b.num_rows() > 0) {
        writer.write(&with_string_map_keys(batch)?)?;
    }
    writer.finish()?;
    Ok(writer.into_inner())
}

/// `batch` with the keys of every map cast to strings: arrow-json writes maps as JSON objects
/// and rejects any other key type, such as the `MAP(UINTEGER, INTEGER)` stats columns of
/// `match_player`. Integer and float keys come out as `DuckDB`'s own `map::JSON` writes them.
fn with_string_map_keys(batch: &RecordBatch) -> Result<RecordBatch, ArrowError> {
    let data_type = DataType::Struct(batch.schema().fields().clone());
    let with_string_keys = string_map_keys(&data_type);
    if with_string_keys == data_type {
        return Ok(batch.clone());
    }
    let columns = StructArray::from(batch.clone());
    Ok(cast(&columns, &with_string_keys)?.as_struct().into())
}

/// `data_type` with every map key, however deeply nested, cast to `Utf8`.
fn string_map_keys(data_type: &DataType) -> DataType {
    let with_type =
        |f: &FieldRef, new_type: DataType| Arc::new(f.as_ref().clone().with_data_type(new_type));
    let with_string_keys = |f: &FieldRef| with_type(f, string_map_keys(f.data_type()));
    match data_type {
        // Map entries are a struct of the key and the value.
        DataType::Map(entries, sorted) => {
            let DataType::Struct(fields) = entries.data_type() else {
                return data_type.clone();
            };
            let [key, value] = fields.as_ref() else {
                return data_type.clone();
            };
            let entry = Fields::from(vec![
                with_type(key, DataType::Utf8),
                with_string_keys(value),
            ]);
            DataType::Map(with_type(entries, DataType::Struct(entry)), *sorted)
        }
        DataType::List(f) => DataType::List(with_string_keys(f)),
        DataType::LargeList(f) => DataType::LargeList(with_string_keys(f)),
        DataType::FixedSizeList(f, size) => DataType::FixedSizeList(with_string_keys(f), *size),
        DataType::Struct(fields) => DataType::Struct(fields.iter().map(with_string_keys).collect()),
        other => other.clone(),
    }
}
