//! `ClickHouse` statements the dump runs. Every export is an `INSERT INTO FUNCTION s3(...)`, so
//! `ClickHouse` encodes the Parquet and uploads it itself; nothing streams through the API.

use std::collections::BTreeMap;

use super::compaction::Chunk;

pub(crate) const LOG_COMMENT: &str = "data_dump";

/// R2 requires every multipart part except the last to have the same size, so the part size
/// is fixed at 64 MiB and `ClickHouse`'s usual doubling after 500 parts is disabled.
///
/// Readers fetch every column chunk of every row group with its own ranged GET, each one an R2
/// Class B operation. `match_player` rows are wide, so the default 512 MiB (uncompressed) row
/// group held only ~66k rows; 2 GiB cuts those GETs ~4x. Writer memory grows with the row group
/// (~8 GB per export at 4 threads, ~11 GB at 12), so 4 GiB would not fit `dump_user`'s 16 GiB.
const EXPORT_SETTINGS: &str = "s3_truncate_on_insert = 1, \
    s3_min_upload_part_size = 67108864, \
    s3_upload_part_size_multiply_parts_count_threshold = 100000, \
    output_format_parquet_compression_method = 'zstd', \
    output_format_compression_level = 9, \
    output_format_parquet_write_page_index = 1, \
    output_format_parquet_write_bloom_filter = 1, \
    output_format_parquet_string_as_string = 1, \
    output_format_parquet_row_group_size_bytes = 2147483648";

fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn view(table: &str) -> String {
    format!("dump.`{table}`")
}

fn target(named_collection: &str, key: &str) -> String {
    format!("s3({named_collection}, filename = {})", quote(key))
}

/// Columns of the `dump` view with the comment of the same-named base table column (views
/// do not carry column comments).
pub(crate) fn columns(table: &str) -> String {
    format!(
        "SELECT v.name AS name, v.type AS type, b.comment AS comment \
         FROM system.columns AS v \
         LEFT JOIN system.columns AS b ON b.database = 'default' AND b.table = v.table AND b.name = v.name \
         WHERE v.database = 'dump' AND v.table = {} ORDER BY v.position",
        quote(table)
    )
}

/// Current watermark upper bound, computed on the server: `now() - lag`, minute-aligned.
pub(crate) fn now_hi(lag_secs: u64) -> String {
    format!("SELECT toInt64(intDiv(toUnixTimestamp(now()) - {lag_secs}, 60) * 60)")
}

pub(crate) fn kill_orphans() -> String {
    format!(
        "KILL QUERY WHERE Settings['log_comment'] = {} ASYNC",
        quote(LOG_COMMENT)
    )
}

pub(crate) fn snapshot_export(named_collection: &str, table: &str, key: &str) -> String {
    format!(
        "INSERT INTO FUNCTION {} SELECT * FROM {} SETTINGS final = 1, {EXPORT_SETTINGS}",
        target(named_collection, key),
        view(table)
    )
}

pub(crate) fn delta_export(
    named_collection: &str,
    table: &str,
    key: &str,
    watermark: &str,
    lo: i64,
    hi: i64,
) -> String {
    format!(
        "INSERT INTO FUNCTION {} SELECT * FROM {} \
         WHERE {watermark} > toDateTime({lo}) AND {watermark} <= toDateTime({hi}) \
         SETTINGS {EXPORT_SETTINGS}",
        target(named_collection, key),
        view(table)
    )
}

/// Which rows of one partition a base file holds.
#[derive(Debug, Clone, Copy)]
pub(crate) struct BaseRange<'a> {
    pub(crate) partition_expr: &'a str,
    pub(crate) partition: u64,
    pub(crate) chunk_column: &'a str,
    pub(crate) chunk: Chunk,
}

impl BaseRange<'_> {
    fn condition(&self) -> String {
        let Self {
            partition_expr,
            partition,
            chunk_column,
            chunk,
        } = *self;
        let mut parts = vec![format!("{partition_expr} = {partition}")];
        if let Some(from) = chunk.from {
            parts.push(format!("{chunk_column} >= {from}"));
        }
        if let Some(to) = chunk.to {
            parts.push(format!("{chunk_column} < {to}"));
        }
        parts.join(" AND ")
    }
}

pub(crate) fn base_export(
    named_collection: &str,
    table: &str,
    key: &str,
    range: &BaseRange<'_>,
    watermark: &str,
    hi: i64,
) -> String {
    format!(
        "INSERT INTO FUNCTION {} SELECT * FROM {} \
         WHERE {} AND {watermark} <= toDateTime({hi}) \
         SETTINGS final = 1, {EXPORT_SETTINGS}",
        target(named_collection, key),
        view(table),
        range.condition()
    )
}

/// Values of the chunk column that cut `range` into `parts` pieces of about equal row counts.
/// Raw rows (no `FINAL`): one column of one partition, cheap, and duplicates barely shift it.
pub(crate) fn chunk_bounds(table: &str, range: &BaseRange<'_>, parts: usize) -> String {
    let levels: Vec<String> = (1..parts)
        .map(|i| {
            let millionths = i
                .saturating_mul(1_000_000)
                .checked_div(parts)
                .unwrap_or_default();
            format!("0.{millionths:06}")
        })
        .collect();
    format!(
        "SELECT arrayMap(x -> toUInt64(x), quantilesExactLow({})({})) FROM {} WHERE {}",
        levels.join(", "),
        range.chunk_column,
        view(table),
        range.condition()
    )
}

/// Rows in `(lo, hi]` that are newer than their partition's base (`cutoffs`, partitions
/// without a base fall back to `lo`).
pub(crate) struct Residual<'a> {
    pub(crate) partition_expr: &'a str,
    pub(crate) watermark: &'a str,
    pub(crate) lo: i64,
    pub(crate) hi: i64,
    pub(crate) cutoffs: &'a BTreeMap<u64, i64>,
}

pub(crate) fn residual_export(
    named_collection: &str,
    table: &str,
    key: &str,
    r: &Residual<'_>,
) -> String {
    let Residual {
        partition_expr,
        watermark,
        lo,
        hi,
        cutoffs,
    } = *r;
    let cutoff = if cutoffs.is_empty() {
        lo.to_string()
    } else {
        let (ps, his): (Vec<String>, Vec<String>) = cutoffs
            .iter()
            .map(|(p, hi)| (p.to_string(), hi.to_string()))
            .unzip();
        format!(
            "transform(toUInt64({partition_expr}), [{}], [{}], toInt64({lo}))",
            ps.join(", "),
            his.join(", ")
        )
    };
    format!(
        "INSERT INTO FUNCTION {} SELECT * FROM {} \
         WHERE {watermark} > toDateTime({lo}) AND {watermark} <= toDateTime({hi}) \
         AND {watermark} > toDateTime({cutoff}) \
         SETTINGS {EXPORT_SETTINGS}",
        target(named_collection, key),
        view(table)
    )
}

/// Row count of an uploaded file, served from the Parquet metadata.
pub(crate) fn file_rows(named_collection: &str, key: &str) -> String {
    format!(
        "SELECT toInt64(count()) FROM {}",
        target(named_collection, key)
    )
}

/// Rows per partition inside an uploaded file (only the partition column is read).
pub(crate) fn file_partition_counts(
    named_collection: &str,
    key: &str,
    partition_expr: &str,
) -> String {
    format!(
        "SELECT toUInt64({partition_expr}) AS p, count() AS rows FROM {} GROUP BY p ORDER BY p",
        target(named_collection, key)
    )
}

/// Raw (non-FINAL) rows per partition in `ClickHouse`; reads one column, cheap.
pub(crate) fn table_partition_counts(table: &str, partition_expr: &str) -> String {
    format!(
        "SELECT toUInt64({partition_expr}) AS p, count() AS rows FROM {} GROUP BY p ORDER BY p",
        view(table)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn residual_uses_per_partition_cutoffs() {
        let sql = residual_export(
            "r2_dump",
            "match_player",
            "v1/x.parquet",
            &Residual {
                partition_expr: "intDiv(match_id, 1000000)",
                watermark: "created_at",
                lo: 100,
                hi: 200,
                cutoffs: &BTreeMap::from([(5, 150), (7, 120)]),
            },
        );
        assert!(sql.contains(
            "transform(toUInt64(intDiv(match_id, 1000000)), [5, 7], [150, 120], toInt64(100))"
        ));
        assert!(sql.contains("created_at > toDateTime(100) AND created_at <= toDateTime(200)"));
        assert!(sql.starts_with("INSERT INTO FUNCTION s3(r2_dump, filename = 'v1/x.parquet')"));
    }

    #[test]
    fn base_ranges_bound_the_chunk_column() {
        let range = BaseRange {
            partition_expr: "intDiv(match_id, 1000000)",
            partition: 7,
            chunk_column: "match_id",
            chunk: Chunk::default(),
        };
        let sql = base_export("r2_dump", "match_player", "k", &range, "created_at", 9);
        assert!(sql.contains(
            "WHERE intDiv(match_id, 1000000) = 7 AND created_at <= toDateTime(9) SETTINGS final = 1"
        ));
        let range = BaseRange {
            chunk: Chunk {
                from: Some(7_250_000),
                to: Some(7_500_000),
            },
            ..range
        };
        let sql = base_export("r2_dump", "match_player", "k", &range, "created_at", 9);
        assert!(sql.contains(
            "WHERE intDiv(match_id, 1000000) = 7 AND match_id >= 7250000 AND match_id < 7500000 AND"
        ));
        let bounds = chunk_bounds("match_player", &range, 3);
        assert!(bounds.contains("quantilesExactLow(0.333333, 0.666666)(match_id)"));
        assert!(
            bounds.contains("FROM dump.`match_player` WHERE intDiv(match_id, 1000000) = 7 AND")
        );
        assert!(chunk_bounds("t", &range, 2).contains("quantilesExactLow(0.500000)"));
    }

    #[test]
    fn quoting_escapes_single_quotes() {
        assert_eq!(quote("a'b"), "'a\\'b'");
        assert!(columns("t").contains("v.table = 't'"));
    }
}
