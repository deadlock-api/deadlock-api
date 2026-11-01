//! Shared helpers for property-based tests that validate generated `ClickHouse` SQL.
//!
//! `assert_valid_sql` runs a full query through `clickhouse_sql_parser::validate`
//! and panics with a pretty error list on failure, or when the query sets no
//! `log_comment` (query cost is attributed by it). `assert_valid_and_fragment`
//! wraps a ` AND ...` fragment (or empty) in a minimal `SELECT` template so
//! bare predicates can still be grammar-checked.
#![cfg(test)]

use clickhouse_sql_parser::validate;
use proptest::prelude::*;

/// Bounded strategy for `Option<Vec<u32>>` fields (`account_ids`, `hero_ids`, etc.).
/// Caps at 4 elements — enough to cover empty/singleton/multi cases without
/// bloating generated SQL, which dominates parser cost.
pub(crate) fn arb_small_u32_list() -> impl Strategy<Value = Option<Vec<u32>>> {
    prop::option::of(prop::collection::vec(any::<u32>(), 0..=4))
}

/// Bounded strategy for the `item_order` field (`Option<Vec<Vec<u32>>>`): at most a
/// couple of short chains, so the generated ordering predicates stay small for the
/// SQL-validity proptests.
pub(crate) fn arb_small_chains() -> impl Strategy<Value = Option<Vec<Vec<u32>>>> {
    prop::option::of(prop::collection::vec(
        prop::collection::vec(any::<u32>(), 0..=3),
        0..=2,
    ))
}

/// Asserts that `sql` is a valid full query that tags itself with a non-empty
/// `SETTINGS log_comment = '...'`, so its cost shows up under a name in `query_log`.
pub(crate) fn assert_valid_sql(sql: &str) {
    assert_parses(sql);
    assert!(
        has_log_comment(sql),
        "Generated SQL sets no non-empty log_comment:\n---\n{sql}\n---"
    );
}

/// Whether `sql` contains `log_comment = '<non-empty>'` (any whitespace around `=`).
fn has_log_comment(sql: &str) -> bool {
    sql.match_indices("log_comment").any(|(i, needle)| {
        let rest = sql[i + needle.len()..].trim_start();
        rest.strip_prefix('=')
            .map(str::trim_start)
            .and_then(|v| v.strip_prefix('\''))
            .is_some_and(|v| !v.starts_with('\''))
    })
}

/// Asserts that `sql` parses, without the full-query requirements of [`assert_valid_sql`]:
/// for fragments wrapped in a test `SELECT`, such as rollup bodies or `FROM` sources.
pub(crate) fn assert_parses(sql: &str) {
    if let Err(errors) = validate(sql) {
        let msg = errors
            .iter()
            .map(|e| format!("  - {e:?}"))
            .collect::<Vec<_>>()
            .join("\n");
        panic!("Parser rejected generated SQL:\n---\n{sql}\n---\nErrors:\n{msg}");
    }
}

pub(crate) fn assert_valid_and_fragment(fragment: &str) {
    assert!(
        fragment.is_empty() || fragment.starts_with(" AND "),
        "fragment must be empty or start with ' AND ': {fragment:?}"
    );
    let wrapped = format!("SELECT * FROM match_player WHERE TRUE{fragment}");
    assert_parses(&wrapped);
}

pub(crate) fn assert_valid_predicate_vec(filters: &[String]) {
    let joined = if filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", filters.join(" AND "))
    };
    assert_valid_and_fragment(&joined);
}

#[cfg(test)]
mod tests {
    use super::has_log_comment;

    #[test]
    fn log_comment_detection() {
        assert!(has_log_comment("SELECT 1 SETTINGS log_comment = 'x'"));
        assert!(has_log_comment(
            "SELECT 1 SETTINGS max_threads = 4, log_comment='x_y'"
        ));
        assert!(!has_log_comment("SELECT 1"));
        assert!(!has_log_comment("SELECT 1 SETTINGS log_comment = ''"));
        assert!(!has_log_comment("SELECT log_comment FROM system.query_log"));
    }
}
