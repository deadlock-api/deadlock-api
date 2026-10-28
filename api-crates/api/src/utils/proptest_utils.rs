//! Shared helpers for property-based tests that validate generated `ClickHouse` SQL.
//!
//! `assert_valid_sql` runs the string through `clickhouse_sql_parser::validate`
//! and panics with a pretty error list on failure. `assert_valid_and_fragment`
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

pub(crate) fn assert_valid_sql(sql: &str) {
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
    assert_valid_sql(&wrapped);
}

pub(crate) fn assert_valid_predicate_vec(filters: &[String]) {
    let joined = if filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", filters.join(" AND "))
    };
    assert_valid_and_fragment(&joined);
}
