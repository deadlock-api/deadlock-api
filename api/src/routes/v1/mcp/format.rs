use core::cmp::max;
use std::sync::Arc;

use arrow_duckdb::compute::cast;
use arrow_duckdb::json::WriterBuilder;
use arrow_duckdb::json::writer::JsonArray;
use duckdb::arrow::array::{AsArray, StructArray};
use duckdb::arrow::datatypes::{DataType, FieldRef, Fields};
use duckdb::arrow::error::ArrowError;
use duckdb::arrow::record_batch::RecordBatch;
use serde::Serialize;
use serde_json::{Map, Value};

use super::catalog::QueryOutput;
use super::server::toon;

const MAX_CHARS: usize = 50_000;
const MAX_ROWS_WARNING: &str = "Results limited to 1,024 rows. Query returned more data.";
/// Strings up to this many bytes are never cut, so ids, timestamps and short text stay whole.
const MIN_CUT_LEN: usize = 256;
const CUT_MARKER: char = '…';

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct QueryResult {
    success: bool,
    columns: Vec<String>,
    column_types: Vec<String>,
    /// Objects keyed by column, so TOON writes them as a table.
    rows: Vec<Map<String, Value>>,
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
    let rows = rows_as_objects(&output.batches)?;
    let mut result = QueryResult {
        success: true,
        columns,
        column_types,
        row_count: rows.len(),
        rows,
        truncated: output.truncated.then_some(true),
        warning: output.truncated.then(|| MAX_ROWS_WARNING.to_owned()),
    };
    fit_output_limit(&mut result);
    Ok(result)
}

/// Fits `result` into the output limit. Long strings are cut before any row is dropped, so a
/// single huge value does not cost every other row; rows are dropped only while cutting alone
/// cannot make them fit.
fn fit_output_limit(result: &mut QueryResult) {
    let mut size = toon(result).len();
    if size <= MAX_CHARS {
        return;
    }
    let total_rows = result.rows.len();
    let row_limited = result.truncated.is_some();
    loop {
        if !result.rows.is_empty() {
            mark_cut(result, total_rows, row_limited, None);
            size = toon(result).len();
            if size <= MAX_CHARS {
                return;
            }
            if cut_strings(result, total_rows, row_limited, size) {
                return;
            }
        }
        if result.rows.is_empty() {
            mark_cut(result, total_rows, row_limited, None);
            return;
        }
        // Drops at least the share of rows the output is over by, so a far too large result
        // does not take dozens of serializations to shrink.
        let rows = result.rows.len();
        let remove = max(1, max(rows / 10, rows - rows * MAX_CHARS / size));
        result.rows.truncate(rows - remove);
    }
}

/// Cuts the strings of `result`, which serializes to `size` bytes, to the longest length that
/// makes it fit. Returns false, leaving the rows as they were, if even cutting every string down
/// to `MIN_CUT_LEN` bytes is not enough.
fn cut_strings(
    result: &mut QueryResult,
    total_rows: usize,
    row_limited: bool,
    size: usize,
) -> bool {
    let mut lengths = Vec::new();
    for value in result.rows.iter().flat_map(Map::values) {
        long_string_lengths(value, &mut lengths);
    }
    let mut over = size - MAX_CHARS;
    // The length is computed from the raw string bytes; TOON quoting and escaping can make the
    // first guess slightly too long, so it is corrected by the remaining overflow.
    for _ in 0..3 {
        let Some(cut_len) = cut_len_saving(&lengths, over) else {
            return false;
        };
        let mut rows = result.rows.clone();
        for value in rows.iter_mut().flat_map(Map::values_mut) {
            shorten_strings(value, cut_len);
        }
        let uncut = core::mem::replace(&mut result.rows, rows);
        mark_cut(result, total_rows, row_limited, Some(cut_len));
        let cut_size = toon(result).len();
        if cut_size <= MAX_CHARS {
            return true;
        }
        result.rows = uncut;
        over += cut_size - MAX_CHARS;
    }
    false
}

/// The longest cut length, at least `MIN_CUT_LEN`, that saves `over` bytes on strings of
/// `lengths` bytes.
fn cut_len_saving(lengths: &[usize], over: usize) -> Option<usize> {
    let saved = |cut_len: usize| -> usize {
        lengths
            .iter()
            .map(|&len| len.saturating_sub(cut_len + CUT_MARKER.len_utf8()))
            .sum()
    };
    if saved(MIN_CUT_LEN) < over {
        return None;
    }
    // `saved` only falls as the cut length grows.
    let (mut lo, mut hi) = (
        MIN_CUT_LEN,
        lengths.iter().copied().max().unwrap_or(MIN_CUT_LEN),
    );
    while lo < hi {
        let mid = lo + (hi - lo).div_ceil(2);
        if saved(mid) >= over {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    Some(lo)
}

/// Records that the output limit cut `result` from `total_rows` to its current rows, and its
/// strings to `cut_len` bytes.
fn mark_cut(
    result: &mut QueryResult,
    total_rows: usize,
    row_limited: bool,
    cut_len: Option<usize>,
) {
    result.row_count = result.rows.len();
    result.truncated = Some(true);
    let limit = MAX_CHARS / 1000;
    let size_warning = if result.rows.is_empty() {
        format!(
            "No row fits the {limit}KB output size limit, even with strings cut to \
             {MIN_CUT_LEN} bytes. Select fewer or smaller columns."
        )
    } else {
        let rows = result.row_count;
        let marked = format!("(marked with {CUT_MARKER})");
        let cuts = match (rows < total_rows, cut_len) {
            (true, Some(n)) => {
                format!("Results limited to {rows} rows and strings cut to {n} bytes {marked}")
            }
            (false, Some(n)) => format!("Strings cut to {n} bytes {marked}"),
            _ => format!("Results limited to {rows} rows"),
        };
        format!("{cuts} due to {limit}KB output size limit.")
    };
    result.warning = Some(if row_limited {
        format!("{MAX_ROWS_WARNING} {size_warning}")
    } else {
        size_warning
    });
}

/// Pushes the byte length of every string in `value`, map keys included, that is longer than
/// `MIN_CUT_LEN`.
fn long_string_lengths(value: &Value, lengths: &mut Vec<usize>) {
    let long = |s: &str| (s.len() > MIN_CUT_LEN).then_some(s.len());
    match value {
        Value::String(s) => lengths.extend(long(s)),
        Value::Array(values) => values.iter().for_each(|v| long_string_lengths(v, lengths)),
        Value::Object(map) => {
            for (key, value) in map {
                lengths.extend(long(key));
                long_string_lengths(value, lengths);
            }
        }
        _ => {}
    }
}

/// Cuts every string in `value`, map keys included, that `cut` shortens.
fn shorten_strings(value: &mut Value, cut_len: usize) {
    match value {
        Value::String(s) => cut(s, cut_len),
        Value::Array(values) => values.iter_mut().for_each(|v| shorten_strings(v, cut_len)),
        Value::Object(map) => {
            let mut shortened = Map::new();
            for (key, mut value) in core::mem::take(map) {
                shorten_strings(&mut value, cut_len);
                let mut short_key = key.clone();
                cut(&mut short_key, cut_len);
                // Two keys with the same prefix keep the second one whole rather than lose a value.
                let key = if shortened.contains_key(&short_key) {
                    key
                } else {
                    short_key
                };
                shortened.insert(key, value);
            }
            *map = shortened;
        }
        _ => {}
    }
}

/// Cuts `s` to at most `cut_len` bytes plus `…`, if that makes it shorter.
fn cut(s: &mut String, cut_len: usize) {
    if s.len() > cut_len + CUT_MARKER.len_utf8() {
        s.truncate(s.floor_char_boundary(cut_len));
        s.push(CUT_MARKER);
    }
}

/// Serializes rows as objects in column order, with JSON values as arrow-json renders them.
fn rows_as_objects(batches: &[RecordBatch]) -> Result<Vec<Map<String, Value>>, ArrowError> {
    let mut writer = WriterBuilder::new()
        .with_explicit_nulls(true)
        .build::<_, JsonArray>(Vec::new());
    for batch in batches.iter().filter(|b| b.num_rows() > 0) {
        writer.write(&with_string_map_keys(batch)?)?;
    }
    writer.finish()?;
    serde_json::from_slice(&writer.into_inner()).map_err(|e| ArrowError::JsonError(e.to_string()))
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
    fn formats_rows_as_objects_in_column_order() {
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
            serde_json::json!([{ "a": 1, "b": "x", "c": null, "d": 1.5, "e": [1, 2], "f": "2026-09-05" }])
        );
        let keys: Vec<_> = json["rows"][0].as_object().unwrap().keys().collect();
        assert_eq!(keys, ["a", "b", "c", "d", "e", "f"]);
        assert_eq!(json["rowCount"], 1);
        assert!(json.get("truncated").is_none());
    }

    #[test]
    fn formats_maps_with_any_key_type() {
        let result = run("SELECT
                MAP {1::UINTEGER: 2, 3: 4} AS ints,
                MAP {-1::BIGINT: 2::BIGINT} AS bigints,
                [MAP {1: 'a'}] AS list_of_maps,
                [MAP {1: 'a'}]::MAP(INTEGER, VARCHAR)[1] AS array_of_maps,
                {'s': MAP {1.5: true}} AS struct_of_map,
                MAP {1: MAP {2: 3}} AS map_of_maps,
                MAP {'k': 1} AS strings,
                NULL::MAP(INTEGER, INTEGER) AS null_map");
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["columnTypes"][0], "MAP(UINTEGER, INTEGER)");
        assert_eq!(
            json["rows"][0],
            serde_json::json!({
                "ints": { "1": 2, "3": 4 },
                "bigints": { "-1": 2 },
                "list_of_maps": [{ "1": "a" }],
                "array_of_maps": [{ "1": "a" }],
                "struct_of_map": { "s": { "1.5": true } },
                "map_of_maps": { "1": { "2": 3 } },
                "strings": { "k": 1 },
                "null_map": null,
            })
        );
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
        assert_eq!(json["rows"][0], serde_json::json!({ "i": 1 }));
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
        assert!(toon(&json).len() <= MAX_CHARS + 200);
    }

    fn warning(json: &Value) -> &str {
        json["warning"].as_str().unwrap()
    }

    #[test]
    fn cuts_the_strings_of_a_single_oversized_row() {
        let result =
            run("SELECT 1 AS id, repeat('é', 60000) AS s, ['short', repeat('x', 60000)] AS l");
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["rowCount"], 1);
        assert_eq!(json["rows"][0]["id"], 1);
        let s = json["rows"][0]["s"].as_str().unwrap();
        assert!(s.ends_with('…') && s.starts_with("éé"), "{s}");
        assert_eq!(json["rows"][0]["l"][0], "short");
        assert!(json["rows"][0]["l"][1].as_str().unwrap().ends_with('…'));
        assert_eq!(json["truncated"], true);
        assert!(
            warning(&json).starts_with("Strings cut to"),
            "{}",
            warning(&json)
        );
        assert!(toon(&result).len() <= MAX_CHARS);
    }

    #[test]
    fn cuts_one_long_string_instead_of_dropping_other_rows() {
        let result = run(
            "SELECT i, CASE WHEN i = 0 THEN repeat('x', 60000) ELSE 'short' END AS s
                FROM range(200) t(i) ORDER BY i",
        );
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["rowCount"], 200);
        assert!(json["rows"][0]["s"].as_str().unwrap().ends_with('…'));
        assert_eq!(json["rows"][199]["s"], "short");
        assert!(toon(&result).len() <= MAX_CHARS);
    }

    #[test]
    fn keeps_short_strings_whole() {
        let result = run("SELECT list(lpad(i::VARCHAR, 19, '0')) AS ids FROM range(3000) t(i)");
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["rowCount"], 0);
        assert!(
            warning(&json).starts_with("No row fits"),
            "{}",
            warning(&json)
        );
    }

    #[test]
    fn cuts_long_map_keys() {
        let result = run(
            "SELECT map_from_entries(list((i::VARCHAR || repeat('k', 1000), i))) AS m FROM range(100) t(i)",
        );
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["rowCount"], 1);
        let m = json["rows"][0]["m"].as_object().unwrap();
        assert_eq!(m.len(), 100);
        assert!(m.keys().all(|k| k.ends_with('…')));
        assert!(toon(&result).len() <= MAX_CHARS);
    }

    #[test]
    fn cut_strings_only_get_shorter() {
        let mut s = "x".repeat(MIN_CUT_LEN + 1);
        cut(&mut s, MIN_CUT_LEN);
        assert_eq!(s.len(), MIN_CUT_LEN + 1);
        let mut s = "é".repeat(MIN_CUT_LEN);
        cut(&mut s, MIN_CUT_LEN + 1);
        assert_eq!(s, format!("{}…", "é".repeat(MIN_CUT_LEN / 2)));
    }

    #[test]
    fn drops_a_single_oversized_row_without_long_strings() {
        let json = serde_json::to_value(run("SELECT range(20000) AS l")).unwrap();
        assert_eq!(json["rowCount"], 0);
        assert_eq!(json["truncated"], true);
        assert!(
            warning(&json).starts_with("No row fits"),
            "{}",
            warning(&json)
        );
    }

    #[test]
    fn keeps_the_row_limit_warning_when_cutting() {
        let json = serde_json::to_value(run("SELECT range(20000) AS l FROM range(2000)")).unwrap();
        assert_eq!(json["rowCount"], 0);
        assert!(
            warning(&json).starts_with(&format!("{MAX_ROWS_WARNING} No row fits")),
            "{}",
            warning(&json)
        );
    }

    #[test]
    fn encodes_rows_as_toon_table() {
        let text = toon(&run(
            "SELECT 1 AS a, 'x' AS b UNION ALL SELECT 2, 'y' ORDER BY a",
        ));
        assert!(text.contains("rows[2]{a,b}:\n  1,x\n  2,y"), "{text}");
    }
}
