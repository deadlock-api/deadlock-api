use core::fmt::Write;
use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

static DDL_COLUMN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*`([^`]+)`\s+(.+?),?$").unwrap());
static DDL_COLUMN_TRAILER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\s+(DEFAULT|MATERIALIZED|ALIAS|CODEC|STATISTICS|TTL|COMMENT)\b.*$").unwrap()
});
static DDL_ENGINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^(ENGINE|ORDER BY|PARTITION BY)\s*=?\s*(.+)$").unwrap());

/// Extracts a table comment and the column name to `ClickHouse` type map from a
/// `CREATE TABLE` statement as dumped by `SHOW CREATE TABLE`.
pub(super) fn parse_ddl(ddl: &str) -> (String, HashMap<String, String>) {
    let mut column_types = HashMap::new();
    let mut in_columns = false;
    for line in ddl.lines() {
        let trimmed = line.trim();
        if trimmed == "(" {
            in_columns = true;
            continue;
        }
        if trimmed == ")" {
            break;
        }
        if in_columns && let Some(captures) = DDL_COLUMN.captures(line) {
            column_types.insert(
                captures[1].to_owned(),
                DDL_COLUMN_TRAILER.replace(&captures[2], "").into_owned(),
            );
        }
    }

    let parts: Vec<String> = DDL_ENGINE
        .captures_iter(ddl)
        .map(|c| format!("{} {}", c[1].to_lowercase(), c[2].trim()))
        .collect();
    let source = ddl
        .lines()
        .next()
        .unwrap_or_default()
        .trim_start_matches("CREATE TABLE ")
        .trim();
    let mut comment = format!("Hourly parquet snapshot of ClickHouse table {source}");
    if !parts.is_empty() {
        let _ = write!(comment, " ({})", parts.join(", "));
    }
    (comment, column_types)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_table_ddl() {
        let ddl = "CREATE TABLE default.heroes\n(\n    `id` UInt8 STATISTICS(tdigest),\n    `name` String\n)\nENGINE = ReplacingMergeTree\nORDER BY id\nSETTINGS index_granularity = 8192\n";
        let (comment, column_types) = parse_ddl(ddl);
        assert_eq!(
            comment,
            "Hourly parquet snapshot of ClickHouse table default.heroes (engine ReplacingMergeTree, order by id)"
        );
        assert_eq!(column_types["id"], "UInt8");
        assert_eq!(column_types["name"], "String");
    }

    #[test]
    fn parses_partitioned_table_with_defaults_and_projections() {
        let ddl = "CREATE TABLE default.match_player\n(\n    `match_id` UInt64,\n    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1),\n    `average_badge_team0` Nullable(UInt32),\n    `ranked` Nullable(Bool) DEFAULT NULL,\n    PROJECTION by_account\n    (\n        SELECT *\n        ORDER BY\n            match_id,\n            account_id\n    )\n)\nENGINE = ReplacingMergeTree\nPARTITION BY intDiv(match_id, 1000000)\nORDER BY (match_id, account_id)\nSETTINGS index_granularity = 8192\n";
        let (comment, column_types) = parse_ddl(ddl);
        assert_eq!(
            comment,
            "Hourly parquet snapshot of ClickHouse table default.match_player (engine ReplacingMergeTree, partition by intDiv(match_id, 1000000), order by (match_id, account_id))"
        );
        assert_eq!(
            column_types["match_mode"],
            "Enum8('Invalid' = 0, 'Unranked' = 1)"
        );
        assert_eq!(column_types["average_badge_team0"], "Nullable(UInt32)");
        assert_eq!(column_types["ranked"], "Nullable(Bool)");
        assert_eq!(column_types.len(), 4);
    }

    #[test]
    fn parses_dictionary_ddl() {
        let ddl = "CREATE DICTIONARY default.ability_items_dict\n(\n    `id` UInt64\n)\nPRIMARY KEY id\nSOURCE(CLICKHOUSE(HOST 'localhost'))\nLIFETIME(MIN 600 MAX 900)\nLAYOUT(HASHED())\n";
        let (comment, column_types) = parse_ddl(ddl);
        assert_eq!(
            comment,
            "Hourly parquet snapshot of ClickHouse table CREATE DICTIONARY default.ability_items_dict"
        );
        assert_eq!(column_types["id"], "UInt64");
    }
}
