//! `ClickHouse` statements the dump runs. Every export is an `INSERT INTO FUNCTION s3(...)`, so
//! `ClickHouse` encodes the Parquet and uploads it itself; nothing streams through the API.

use std::collections::BTreeMap;

pub(crate) const LOG_COMMENT: &str = "data_dump";

/// R2 requires every multipart part except the last to have the same size, so the part size
/// is fixed at 64 MiB and `ClickHouse`'s usual doubling after 500 parts is disabled.
const EXPORT_SETTINGS: &str = "s3_truncate_on_insert = 1, \
    s3_min_upload_part_size = 67108864, \
    s3_upload_part_size_multiply_parts_count_threshold = 100000, \
    output_format_parquet_compression_method = 'zstd', \
    output_format_parquet_write_page_index = 1, \
    output_format_parquet_write_bloom_filter = 1, \
    output_format_parquet_string_as_string = 1";

fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn view(table: &str) -> String {
    format!("dump.`{table}`")
}

fn target(named_collection: &str, key: &str) -> String {
    format!("s3({named_collection}, filename = {})", quote(key))
}

pub(crate) fn columns(table: &str) -> String {
    format!(
        "SELECT name, type FROM system.columns WHERE database = 'dump' AND table = {} ORDER BY position",
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

pub(crate) fn base_export(
    named_collection: &str,
    table: &str,
    key: &str,
    partition_expr: &str,
    partition: u64,
    watermark: &str,
    hi: i64,
) -> String {
    format!(
        "INSERT INTO FUNCTION {} SELECT * FROM {} \
         WHERE {partition_expr} = {partition} AND {watermark} <= toDateTime({hi}) \
         SETTINGS final = 1, {EXPORT_SETTINGS}",
        target(named_collection, key),
        view(table)
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

/// Partitions holding rows of an account, so a privacy deletion can be scrubbed promptly.
/// `player_match_history` is ordered by `account_id`, unlike `match_player`.
pub(crate) fn account_partitions(partition_expr: &str, account_id: u32) -> String {
    format!(
        "SELECT DISTINCT toUInt64({partition_expr}) AS p FROM default.player_match_history WHERE account_id = {account_id}"
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
    fn quoting_escapes_single_quotes() {
        assert_eq!(quote("a'b"), "'a\\'b'");
        assert!(columns("t").contains("table = 't'"));
    }
}
