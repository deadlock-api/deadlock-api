use core::cmp::max;

use arrow_duckdb::json::WriterBuilder;
use arrow_duckdb::json::writer::JsonArray;
use duckdb::arrow::datatypes::DataType;
use duckdb::arrow::error::ArrowError;
use duckdb::arrow::record_batch::RecordBatch;
use serde::Serialize;
use serde_json::Value;

use super::catalog::QueryOutput;

const MAX_CHARS: usize = 50_000;
const MAX_ROWS_WARNING: &str = "Results limited to 1,024 rows. Query returned more data.";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct QueryResult {
    success: bool,
    columns: Vec<String>,
    column_types: Vec<String>,
    rows: Vec<Vec<Value>>,
    row_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    truncated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    warning: Option<String>,
}

pub(super) fn format_query_output(output: &QueryOutput) -> Result<QueryResult, ArrowError> {
    let columns: Vec<String> = output
        .schema
        .fields()
        .iter()
        .map(|f| f.name().clone())
        .collect();
    let column_types = output
        .schema
        .fields()
        .iter()
        .map(|f| sql_type_name(f.data_type()))
        .collect();
    let rows = rows_as_arrays(&columns, &output.batches)?;
    let mut result = QueryResult {
        success: true,
        columns,
        column_types,
        row_count: rows.len(),
        rows,
        truncated: output.truncated.then_some(true),
        warning: output.truncated.then(|| MAX_ROWS_WARNING.to_owned()),
    };
    let mut chars = compact_len(&result);
    while !result.rows.is_empty() && chars > MAX_CHARS {
        let remove = max(1, result.rows.len() / 10);
        result.rows.truncate(result.rows.len() - remove);
        result.row_count = result.rows.len();
        result.truncated = Some(true);
        result.warning = Some(format!(
            "Results limited to {} rows due to {}KB output size limit.",
            result.rows.len(),
            MAX_CHARS / 1000
        ));
        chars = compact_len(&result);
    }
    Ok(result)
}

fn compact_len(result: &QueryResult) -> usize {
    serde_json::to_vec(result).map_or(0, |v| v.len())
}

/// Serializes rows as arrays in column order, with JSON values as arrow-json renders them.
fn rows_as_arrays(
    columns: &[String],
    batches: &[RecordBatch],
) -> Result<Vec<Vec<Value>>, ArrowError> {
    let mut writer = WriterBuilder::new()
        .with_explicit_nulls(true)
        .build::<_, JsonArray>(Vec::new());
    for batch in batches.iter().filter(|b| b.num_rows() > 0) {
        writer.write(batch)?;
    }
    writer.finish()?;
    let objects: Vec<serde_json::Map<String, Value>> = serde_json::from_slice(&writer.into_inner())
        .map_err(|e| ArrowError::JsonError(e.to_string()))?;
    Ok(objects
        .into_iter()
        .map(|mut object| {
            columns
                .iter()
                .map(|column| object.remove(column).unwrap_or(Value::Null))
                .collect()
        })
        .collect())
}

/// SQL-style type names, matching what `list_columns` reports and what `CAST(x AS ...)` accepts.
pub(super) fn sql_type_name(data_type: &DataType) -> String {
    match data_type {
        DataType::Null => "NULL".to_owned(),
        DataType::Boolean => "BOOLEAN".to_owned(),
        DataType::Int8 => "TINYINT".to_owned(),
        DataType::Int16 => "SMALLINT".to_owned(),
        DataType::Int32 => "INTEGER".to_owned(),
        DataType::Int64 => "BIGINT".to_owned(),
        DataType::UInt8 => "UTINYINT".to_owned(),
        DataType::UInt16 => "USMALLINT".to_owned(),
        DataType::UInt32 => "UINTEGER".to_owned(),
        DataType::UInt64 => "UBIGINT".to_owned(),
        DataType::Float16 | DataType::Float32 => "FLOAT".to_owned(),
        DataType::Float64 => "DOUBLE".to_owned(),
        DataType::Utf8 | DataType::LargeUtf8 | DataType::Utf8View => "VARCHAR".to_owned(),
        DataType::Binary
        | DataType::LargeBinary
        | DataType::BinaryView
        | DataType::FixedSizeBinary(_) => "BLOB".to_owned(),
        DataType::Date32 | DataType::Date64 => "DATE".to_owned(),
        DataType::Time32(_) | DataType::Time64(_) => "TIME".to_owned(),
        DataType::Timestamp(_, None) => "TIMESTAMP".to_owned(),
        DataType::Timestamp(_, Some(_)) => "TIMESTAMP WITH TIME ZONE".to_owned(),
        DataType::Duration(_) | DataType::Interval(_) => "INTERVAL".to_owned(),
        DataType::Decimal32(p, s)
        | DataType::Decimal64(p, s)
        | DataType::Decimal128(p, s)
        | DataType::Decimal256(p, s) => format!("DECIMAL({p},{s})"),
        DataType::List(field)
        | DataType::LargeList(field)
        | DataType::FixedSizeList(field, _)
        | DataType::ListView(field)
        | DataType::LargeListView(field) => format!("{}[]", sql_type_name(field.data_type())),
        DataType::Struct(fields) => format!(
            "STRUCT({})",
            fields
                .iter()
                .map(|f| format!("{} {}", f.name(), sql_type_name(f.data_type())))
                .collect::<Vec<_>>()
                .join(", ")
        ),
        DataType::Map(field, _) => match field.data_type() {
            DataType::Struct(kv) if kv.len() == 2 => format!(
                "MAP({}, {})",
                sql_type_name(kv[0].data_type()),
                sql_type_name(kv[1].data_type())
            ),
            other => format!("MAP({})", sql_type_name(other)),
        },
        DataType::Dictionary(_, value) => sql_type_name(value),
        DataType::RunEndEncoded(_, value) => sql_type_name(value.data_type()),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use duckdb::Connection;

    use super::super::catalog::run_query;
    use super::*;

    fn run(sql: &str) -> QueryResult {
        let conn = Connection::open_in_memory().unwrap();
        format_query_output(&run_query(&conn, sql).unwrap()).unwrap()
    }

    #[test]
    fn formats_rows_as_arrays_in_column_order() {
        let result = run(
            "SELECT 1 AS a, 'x' AS b, NULL AS c, 1.5::DOUBLE AS d, [1, 2] AS e, DATE '2026-09-05' AS f",
        );
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(
            json["columns"],
            serde_json::json!(["a", "b", "c", "d", "e", "f"])
        );
        assert_eq!(json["columnTypes"][0], "INTEGER");
        assert_eq!(json["columnTypes"][1], "VARCHAR");
        assert_eq!(json["columnTypes"][3], "DOUBLE");
        assert_eq!(json["columnTypes"][4], "INTEGER[]");
        assert_eq!(json["columnTypes"][5], "DATE");
        assert_eq!(
            json["rows"],
            serde_json::json!([[1, "x", null, 1.5, [1, 2], "2026-09-05"]])
        );
        assert_eq!(json["rowCount"], 1);
        assert!(json.get("truncated").is_none());
    }

    #[test]
    fn empty_result_has_columns_and_no_rows() {
        let json = serde_json::to_value(run("SELECT 1 AS a WHERE false")).unwrap();
        assert_eq!(json["columns"], serde_json::json!(["a"]));
        assert_eq!(json["rows"], serde_json::json!([]));
        assert_eq!(json["rowCount"], 0);
    }

    #[test]
    fn truncates_to_max_rows() {
        let json =
            serde_json::to_value(run("SELECT range AS i FROM range(1, 5001) ORDER BY i")).unwrap();
        assert_eq!(json["rowCount"], 1024);
        assert_eq!(json["rows"].as_array().unwrap().len(), 1024);
        assert_eq!(json["rows"][0], serde_json::json!([1]));
        assert_eq!(json["truncated"], true);
        assert_eq!(json["warning"], MAX_ROWS_WARNING);
    }

    #[test]
    fn exactly_max_rows_is_not_truncated() {
        let json = serde_json::to_value(run("SELECT range AS i FROM range(1, 1025)")).unwrap();
        assert_eq!(json["rowCount"], 1024);
        assert!(json.get("truncated").is_none());
    }

    #[test]
    fn truncates_to_output_size_limit() {
        let json =
            serde_json::to_value(run("SELECT repeat('x', 1000) AS s FROM range(200)")).unwrap();
        let rows = json["rowCount"].as_u64().unwrap();
        assert!(rows < 200 && rows > 0, "rows = {rows}");
        assert_eq!(json["truncated"], true);
        assert!(
            json["warning"]
                .as_str()
                .unwrap()
                .ends_with("due to 50KB output size limit."),
            "{}",
            json["warning"]
        );
        assert!(serde_json::to_string(&json).unwrap().len() <= MAX_CHARS + 200);
    }
}
