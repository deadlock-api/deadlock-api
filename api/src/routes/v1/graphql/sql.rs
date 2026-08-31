//! SQL assembly for the GraphQL `matches`, `match_players` and `match_history`
//! resolvers.

use core::fmt::Write;

use crate::routes::v1::graphql::filters::MatchHistorySqlFilters;
use crate::routes::v1::graphql::projection::{Column, MATCH_HISTORY_COLUMNS, Projection};
use crate::routes::v1::players::match_history::{COALESCED_COLUMNS, ETERNUS_MAX_BADGE};

#[derive(Clone, Copy, Debug)]
pub(super) enum OrderKey {
    MatchId,
    StartTime,
    AverageBadge,
    AccountId,
}

#[derive(Clone, Copy, Debug, Default)]
pub(super) enum OrderDir {
    #[default]
    Asc,
    Desc,
}

impl OrderDir {
    fn as_sql(self) -> &'static str {
        match self {
            Self::Asc => "ASC",
            Self::Desc => "DESC",
        }
    }
}

fn where_clause(filters: &[String]) -> String {
    if filters.is_empty() {
        String::new()
    } else {
        format!(" WHERE {} ", filters.join(" AND "))
    }
}

/// Emit a `Nested` parent column projection limited to the requested subfields.
/// Relies on `enable_named_columns_in_function_tuple = 1` (set on the client)
/// so the tuple inherits its field names from the lambda variable names.
/// Output: `arrayMap((item_id, flags) -> tuple(item_id, flags), items.item_id, items.flags) AS items`
fn nested_array_expr(parent: &str, subfields: &[&str]) -> String {
    let bindings_csv = subfields.join(", ");
    let arrays = subfields
        .iter()
        .map(|f| format!("{parent}.{f}"))
        .collect::<Vec<_>>()
        .join(", ");
    format!("arrayMap(({bindings_csv}) -> tuple({bindings_csv}), {arrays}) AS {parent}")
}

fn column_expr(col: &Column, aggregated: bool) -> String {
    if aggregated {
        format!("any({}) AS {}", col.ch_expr, col.gql)
    } else {
        format!("{} AS {}", col.ch_expr, col.gql)
    }
}

/// Inputs shared by both query shapes (match-grouped and player-row).
#[derive(Debug)]
pub(super) struct BuildArgs<'a> {
    pub(super) projection: &'a Projection,
    pub(super) filters: &'a [String],
    pub(super) order_by: OrderKey,
    pub(super) order_dir: OrderDir,
    pub(super) limit: u32,
    pub(super) offset: u32,
}

/// Columns the demo-analyzer writes via lightweight `UPDATE` (i.e. patch parts).
/// A query that neither selects nor filters on any of these can set
/// `apply_patch_parts = 0`, which lets `ClickHouse` serve it from the
/// `match_player` projections instead of falling back to a base-table scan.
const PATCHED_COLUMNS: [&str; 4] = [
    "banned_hero_ids",
    "hero_build_id",
    "pregame_hero_id",
    "demo_processed",
];

/// True when the projection or filters reference any demo-analyzer patched
/// column, meaning patch parts must be applied for correct results.
fn references_patched_column(args: &BuildArgs<'_>) -> bool {
    let in_projection = args
        .projection
        .match_columns
        .iter()
        .chain(args.projection.player_columns.iter())
        .any(|c| PATCHED_COLUMNS.contains(&c.ch_expr));
    // Defense in depth: no patched column is filterable today, but scan the raw
    // filter fragments so this stays correct if one is ever added.
    let in_filters = args
        .filters
        .iter()
        .any(|f| PATCHED_COLUMNS.iter().any(|p| f.contains(p)));
    in_projection || in_filters
}

/// Builds the trailing `SETTINGS` clause, appending `apply_patch_parts = 0`
/// whenever the query touches none of the [`PATCHED_COLUMNS`].
fn settings_clause(args: &BuildArgs<'_>) -> String {
    let mut clause = format!(
        "SETTINGS log_comment = '{}', max_threads = 32",
        super::RATE_LIMIT_KEY
    );
    if !references_patched_column(args) {
        clause.push_str(", apply_patch_parts = 0");
    }
    clause
}

/// Match-grouped query: returns one row per `match_id` with players aggregated
/// into a `players` JSON array.
///
/// Mirrors the CTE-based shape from `bulk_metadata.rs` so we benefit from
/// the same query plan: filter & order in `t_matches`, then re-fetch the
/// minimal set of columns from `match_player`.
pub(super) fn build_matches_query(args: &BuildArgs<'_>) -> Result<String, core::fmt::Error> {
    let where_clause = where_clause(args.filters);
    // AccountId is unreachable here (OrderByMatch doesn't expose it) — fall back to match_id.
    let (cte_order, outer_order): (&str, &str) = match args.order_by {
        OrderKey::StartTime => ("any(start_time)", "any(match_player.start_time)"),
        OrderKey::AverageBadge => (
            "coalesce(any(average_badge), 0)",
            "coalesce(any(match_player.average_badge), 0)",
        ),
        OrderKey::MatchId | OrderKey::AccountId => ("match_id", "match_player.match_id"),
    };
    let dir = args.order_dir.as_sql();

    let mut sql = String::new();
    write!(
        &mut sql,
        "WITH t_matches AS (SELECT match_id FROM match_player{where_clause} GROUP BY match_id ORDER BY {cte_order} {dir} LIMIT {limit} OFFSET {offset}) ",
        limit = args.limit,
        offset = args.offset,
    )?;

    sql.push_str("SELECT match_player.match_id AS match_id");
    for col in &args.projection.match_columns {
        if col.gql == "match_id" {
            continue;
        }
        sql.push_str(", ");
        sql.push_str(&column_expr(col, true));
    }

    if args.projection.include_players() {
        sql.push_str(", ");
        sql.push_str(&build_players_aggregate(
            &args.projection.player_columns,
            &args.projection.items_subfields,
            &args.projection.stats_subfields,
        ));
    }

    sql.push_str(" FROM match_player ");
    sql.push_str("WHERE match_player.match_id IN t_matches ");
    sql.push_str("GROUP BY match_player.match_id ");
    write!(
        &mut sql,
        "ORDER BY {outer_order} {dir} LIMIT {limit} ",
        limit = args.limit,
    )?;
    sql.push_str(&settings_clause(args));
    Ok(sql)
}

/// Player-row query: one row per (`match_id`, `account_id`) — no aggregation.
pub(super) fn build_match_players_query(args: &BuildArgs<'_>) -> Result<String, core::fmt::Error> {
    let where_clause = where_clause(args.filters);
    let order_col = match args.order_by {
        OrderKey::MatchId => "match_player.match_id",
        OrderKey::StartTime => "match_player.start_time",
        OrderKey::AverageBadge => "match_player.average_badge",
        OrderKey::AccountId => "match_player.account_id",
    };
    let dir = args.order_dir.as_sql();

    let mut parts: Vec<String> = args
        .projection
        .player_columns
        .iter()
        .map(|c| column_expr(c, false))
        .collect();
    if !args.projection.items_subfields.is_empty() {
        parts.push(nested_array_expr("items", &args.projection.items_subfields));
    }
    if !args.projection.stats_subfields.is_empty() {
        parts.push(nested_array_expr("stats", &args.projection.stats_subfields));
    }

    let mut sql = String::new();
    sql.push_str("SELECT ");
    sql.push_str(&parts.join(", "));
    sql.push_str(" FROM match_player ");
    sql.push_str(&where_clause);
    write!(
        &mut sql,
        "ORDER BY {order_col} {dir} LIMIT {limit} OFFSET {offset} ",
        limit = args.limit,
        offset = args.offset,
    )?;
    sql.push_str(&settings_clause(args));
    Ok(sql)
}

/// Inputs of the `match_history` query shape.
#[derive(Debug)]
pub(super) struct MatchHistoryBuildArgs<'a> {
    pub(super) columns: &'a [Column],
    pub(super) filters: &'a MatchHistorySqlFilters,
    pub(super) order_by: OrderKey,
    pub(super) order_dir: OrderDir,
    pub(super) limit: u32,
    pub(super) offset: u32,
}

/// Merged (post-`CoalescingMergeTree`) expression for a `player_match_history`
/// column, without an alias. Shared by the SELECT list, HAVING fragments and
/// ORDER BY — the latter two can't reference the SELECT aliases because the
/// query runs with `prefer_column_name_to_alias = 1` (see
/// [`build_match_history_query`]).
///
/// `ranked_display_badge` also caps extrapolated Eternus badges (see
/// `ETERNUS_MIN_BADGE` in `players::match_history`). The REST reader's
/// initial-rank substitution needs a `match_player` join pruned by
/// `account_id`, which an arbitrarily filtered query can't guarantee, so
/// GraphQL returns the capped fallback instead.
pub(super) fn match_history_merge_expr(col: &Column) -> String {
    match col.gql {
        "account_id" | "match_id" => col.ch_expr.to_owned(),
        "ranked_display_badge" => format!(
            "least(argMaxIf(ranked_display_badge, created_at, ranked_display_badge IS NOT NULL), {ETERNUS_MAX_BADGE})"
        ),
        c if COALESCED_COLUMNS.contains(&c) => {
            format!("argMaxIf({c}, created_at, {c} IS NOT NULL)")
        }
        _ => format!("argMax({}, created_at)", col.ch_expr),
    }
}

fn match_history_column_expr(col: &Column) -> String {
    match col.gql {
        "account_id" | "match_id" => col.ch_expr.to_owned(),
        _ => format!("{} AS {}", match_history_merge_expr(col), col.gql),
    }
}

/// `player_match_history` query: one row per (`account_id`, `match_id`).
/// Reproduces the table's `CoalescingMergeTree` merge with `GROUP BY` +
/// `argMax` rather than FINAL, like the REST reader in
/// `players::match_history` (benchmarked ~11x faster, ~35x less memory).
///
/// Runs with `prefer_column_name_to_alias = 1`: most SELECT aliases equal the
/// table column they aggregate, and without the setting `ClickHouse`
/// substitutes the alias into WHERE fragments, turning e.g.
/// `WHERE hero_id = 1` into an `ILLEGAL_AGGREGATION` error.
pub(super) fn build_match_history_query(
    args: &MatchHistoryBuildArgs<'_>,
) -> Result<String, core::fmt::Error> {
    let select = args
        .columns
        .iter()
        .map(match_history_column_expr)
        .collect::<Vec<_>>()
        .join(", ");
    let order_expr = match args.order_by {
        OrderKey::StartTime => MATCH_HISTORY_COLUMNS
            .iter()
            .find(|c| c.gql == "start_time")
            .map_or_else(|| "match_id".to_owned(), match_history_merge_expr),
        OrderKey::AccountId => "account_id".to_owned(),
        // AverageBadge is unreachable (OrderByMatchHistory doesn't expose it).
        OrderKey::MatchId | OrderKey::AverageBadge => "match_id".to_owned(),
    };
    let dir = args.order_dir.as_sql();

    let mut sql = String::new();
    sql.push_str("SELECT ");
    sql.push_str(&select);
    sql.push_str(" FROM player_match_history");
    sql.push_str(&where_clause(&args.filters.where_));
    sql.push_str(" GROUP BY account_id, match_id");
    if !args.filters.having.is_empty() {
        write!(&mut sql, " HAVING {}", args.filters.having.join(" AND "))?;
    }
    write!(
        &mut sql,
        " ORDER BY {order_expr} {dir} LIMIT {limit} OFFSET {offset} \
         SETTINGS log_comment = '{key}', max_threads = 32, prefer_column_name_to_alias = 1",
        limit = args.limit,
        offset = args.offset,
        key = super::RATE_LIMIT_KEY,
    )?;
    Ok(sql)
}

fn build_players_aggregate(
    player_columns: &[Column],
    items_subfields: &[&str],
    stats_subfields: &[&str],
) -> String {
    let mut parts: Vec<String> = player_columns
        .iter()
        .map(|c| column_expr(c, false))
        .collect();
    if !items_subfields.is_empty() {
        parts.push(nested_array_expr("items", items_subfields));
    }
    if !stats_subfields.is_empty() {
        parts.push(nested_array_expr("stats", stats_subfields));
    }
    let inner = parts.join(", ");
    format!("groupArray(tuple({inner})::JSON) AS players")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::v1::graphql::projection::{MATCH_COLUMNS, PLAYER_COLUMNS, Projection};

    fn match_id_only() -> Projection {
        Projection {
            match_columns: MATCH_COLUMNS
                .iter()
                .filter(|c| c.gql == "match_id")
                .copied()
                .collect(),
            ..Default::default()
        }
    }

    #[test]
    fn match_grouped_minimum() {
        let projection = match_id_only();
        let sql = build_matches_query(&BuildArgs {
            projection: &projection,
            filters: &[],
            order_by: OrderKey::MatchId,
            order_dir: OrderDir::Desc,
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert!(sql.contains("WITH t_matches"));
        assert!(sql.contains("FROM match_player"));
        assert!(sql.contains("GROUP BY match_player.match_id"));
        assert!(sql.contains("LIMIT 10"));
        // Only match_id projected — no JOIN should be emitted.
        assert!(!sql.contains("LEFT JOIN demo_player"));
    }

    #[test]
    fn player_row_minimum() {
        let projection = Projection {
            player_columns: PLAYER_COLUMNS
                .iter()
                .filter(|c| c.gql == "match_id" || c.gql == "account_id")
                .copied()
                .collect(),
            ..Default::default()
        };
        let sql = build_match_players_query(&BuildArgs {
            projection: &projection,
            filters: &["account_id = 123".into()],
            order_by: OrderKey::AccountId,
            order_dir: OrderDir::Asc,
            limit: 5,
            offset: 0,
        })
        .unwrap();
        assert!(sql.contains("FROM match_player"));
        assert!(!sql.contains("WITH t_matches"));
        assert!(sql.contains("WHERE account_id = 123"));
        assert!(sql.contains("LIMIT 5"));
    }

    #[test]
    fn match_grouped_with_filter_and_players() {
        let projection = Projection {
            match_columns: MATCH_COLUMNS
                .iter()
                .filter(|c| matches!(c.gql, "match_id" | "start_time" | "average_badge"))
                .copied()
                .collect(),
            player_columns: PLAYER_COLUMNS
                .iter()
                .filter(|c| matches!(c.gql, "match_id" | "account_id" | "kills"))
                .copied()
                .collect(),
            items_subfields: vec!["item_id", "flags"],
            ..Default::default()
        };
        let sql = build_matches_query(&BuildArgs {
            projection: &projection,
            filters: &[
                "(match_id >= 1 AND match_id < 1000)".into(),
                "match_mode = 'Ranked'".into(),
            ],
            order_by: OrderKey::StartTime,
            order_dir: OrderDir::Desc,
            limit: 50,
            offset: 0,
        })
        .unwrap();
        assert!(sql.contains("groupArray(tuple("));
        assert!(sql.contains("AS players"));
        assert!(sql.contains("any(toUnixTimestamp(start_time))"));
        crate::utils::proptest_utils::assert_valid_sql(&sql);
    }

    #[test]
    fn banned_hero_ids_reads_from_match_player() {
        let mut projection = match_id_only();
        for col in MATCH_COLUMNS {
            if col.gql == "banned_hero_ids" {
                projection.match_columns.push(*col);
            }
        }
        let sql = build_matches_query(&BuildArgs {
            projection: &projection,
            filters: &[],
            order_by: OrderKey::MatchId,
            order_dir: OrderDir::Asc,
            limit: 1,
            offset: 0,
        })
        .unwrap();
        assert!(!sql.contains("demo_player"));
        assert!(sql.contains("any(banned_hero_ids)"));
        // banned_hero_ids is a demo-analyzer patched column -> patches must apply.
        assert!(!sql.contains("apply_patch_parts"));
    }

    #[test]
    fn omits_patch_parts_when_no_patched_column() {
        // match_id-only projection touches no patched column -> safe to skip patches.
        let sql = build_matches_query(&BuildArgs {
            projection: &match_id_only(),
            filters: &["match_mode = 'Ranked'".into()],
            order_by: OrderKey::MatchId,
            order_dir: OrderDir::Desc,
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert!(sql.contains("apply_patch_parts = 0"));
    }

    #[test]
    fn keeps_patch_parts_when_hero_build_id_selected() {
        let projection = Projection {
            player_columns: PLAYER_COLUMNS
                .iter()
                .filter(|c| matches!(c.gql, "match_id" | "account_id" | "hero_build_id"))
                .copied()
                .collect(),
            ..Default::default()
        };
        let sql = build_match_players_query(&BuildArgs {
            projection: &projection,
            filters: &[],
            order_by: OrderKey::AccountId,
            order_dir: OrderDir::Asc,
            limit: 5,
            offset: 0,
        })
        .unwrap();
        assert!(sql.contains("hero_build_id"));
        assert!(!sql.contains("apply_patch_parts"));
    }

    fn match_history_columns(names: &[&str]) -> Vec<Column> {
        MATCH_HISTORY_COLUMNS
            .iter()
            .filter(|c| names.contains(&c.gql))
            .copied()
            .collect()
    }

    #[test]
    fn match_history_merges_via_group_by() {
        let columns = match_history_columns(&["account_id", "match_id", "hero_id", "ranked_delta"]);
        let filters = MatchHistorySqlFilters {
            where_: vec!["account_id = 123".into()],
            ..Default::default()
        };
        let sql = build_match_history_query(&MatchHistoryBuildArgs {
            columns: &columns,
            filters: &filters,
            order_by: OrderKey::MatchId,
            order_dir: OrderDir::Desc,
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert!(sql.contains("FROM player_match_history"));
        assert!(sql.contains("WHERE account_id = 123"));
        assert!(sql.contains("GROUP BY account_id, match_id"));
        assert!(sql.contains("argMax(hero_id, created_at) AS hero_id"));
        assert!(sql.contains(
            "argMaxIf(ranked_delta, created_at, ranked_delta IS NOT NULL) AS ranked_delta"
        ));
        assert!(!sql.contains("FINAL"));
        crate::utils::proptest_utils::assert_valid_sql(&sql);
    }

    #[test]
    fn match_history_caps_eternus_badge() {
        let columns = match_history_columns(&["ranked_display_badge"]);
        let sql = build_match_history_query(&MatchHistoryBuildArgs {
            columns: &columns,
            filters: &MatchHistorySqlFilters::default(),
            order_by: OrderKey::MatchId,
            order_dir: OrderDir::Desc,
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert!(sql.contains(&format!("least(argMaxIf(ranked_display_badge, created_at, ranked_display_badge IS NOT NULL), {ETERNUS_MAX_BADGE}) AS ranked_display_badge")));
    }

    #[test]
    fn match_history_having_uses_merged_expression() {
        // ranked_delta is filtered but not selected — HAVING carries the full
        // merged aggregate expression, no alias needed.
        let columns = match_history_columns(&["account_id", "match_id"]);
        let filters = MatchHistorySqlFilters {
            having: vec!["argMaxIf(ranked_delta, created_at, ranked_delta IS NOT NULL) > 0".into()],
            ..Default::default()
        };
        let sql = build_match_history_query(&MatchHistoryBuildArgs {
            columns: &columns,
            filters: &filters,
            order_by: OrderKey::MatchId,
            order_dir: OrderDir::Desc,
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert!(
            sql.contains("HAVING argMaxIf(ranked_delta, created_at, ranked_delta IS NOT NULL) > 0")
        );
        crate::utils::proptest_utils::assert_valid_sql(&sql);
    }

    #[test]
    fn match_history_order_by_start_time_uses_merged_expression() {
        let columns = match_history_columns(&["account_id", "match_id"]);
        let sql = build_match_history_query(&MatchHistoryBuildArgs {
            columns: &columns,
            filters: &MatchHistorySqlFilters::default(),
            order_by: OrderKey::StartTime,
            order_dir: OrderDir::Asc,
            limit: 10,
            offset: 5,
        })
        .unwrap();
        assert!(sql.contains("ORDER BY argMax(toUnixTimestamp(start_time), created_at) ASC"));
        assert!(sql.contains("LIMIT 10 OFFSET 5"));
        assert!(sql.contains("prefer_column_name_to_alias = 1"));
    }

    #[test]
    fn player_row_without_patched_column_skips_patches() {
        let projection = Projection {
            player_columns: PLAYER_COLUMNS
                .iter()
                .filter(|c| matches!(c.gql, "match_id" | "account_id" | "kills"))
                .copied()
                .collect(),
            ..Default::default()
        };
        let sql = build_match_players_query(&BuildArgs {
            projection: &projection,
            filters: &["account_id = 123".into()],
            order_by: OrderKey::AccountId,
            order_dir: OrderDir::Asc,
            limit: 5,
            offset: 0,
        })
        .unwrap();
        assert!(sql.contains("apply_patch_parts = 0"));
    }
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    fn arb_match_history_filters() -> impl Strategy<Value = MatchHistorySqlFilters> {
        let where_ = prop::collection::vec(
            prop_oneof![
                (1u32..1_000_000u32).prop_map(|v| format!("account_id = {v}")),
                (1u32..200u32).prop_map(|v| format!("hero_id = {v}")),
                Just("match_mode = 'Ranked'".to_owned()),
            ],
            0..=3,
        );
        let having = prop::collection::vec(
            prop_oneof![
                Just(
                    "argMaxIf(ranked_delta, created_at, ranked_delta IS NOT NULL) IS NOT NULL"
                        .to_owned()
                ),
                (1u32..116u32).prop_map(|v| format!(
                    "least(argMaxIf(ranked_display_badge, created_at, ranked_display_badge IS NOT NULL), 116) >= {v}"
                )),
            ],
            0..=2,
        );
        (where_, having).prop_map(|(where_, having)| MatchHistorySqlFilters { where_, having })
    }

    use crate::routes::v1::graphql::projection::{Column, MATCH_COLUMNS, PLAYER_COLUMNS};
    use crate::utils::proptest_utils::assert_valid_sql;

    fn arb_columns(pool: &'static [Column]) -> impl Strategy<Value = Vec<Column>> {
        prop::collection::vec(0..pool.len(), 0..=8).prop_map(move |idxs| {
            let mut seen = std::collections::HashSet::new();
            idxs.into_iter()
                .filter_map(|i| {
                    let c = pool[i];
                    seen.insert(c.gql).then_some(c)
                })
                .collect()
        })
    }

    fn arb_order_key() -> impl Strategy<Value = OrderKey> {
        prop_oneof![
            Just(OrderKey::MatchId),
            Just(OrderKey::StartTime),
            Just(OrderKey::AverageBadge),
            Just(OrderKey::AccountId),
        ]
    }

    fn arb_order_dir() -> impl Strategy<Value = OrderDir> {
        prop_oneof![Just(OrderDir::Asc), Just(OrderDir::Desc)]
    }

    fn arb_filters() -> impl Strategy<Value = Vec<String>> {
        prop::collection::vec(
            prop_oneof![
                (1u64..1_000_000u64).prop_map(|v| format!("match_id >= {v}")),
                (1u32..200u32).prop_map(|v| format!("hero_id = {v}")),
                Just("match_mode = 'Ranked'".to_owned()),
                Just("low_pri_pool IS NULL".to_owned()),
            ],
            0..=4,
        )
    }

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn matches_query_is_valid_sql(
            match_cols in arb_columns(MATCH_COLUMNS),
            player_cols in arb_columns(PLAYER_COLUMNS),
            include_players in any::<bool>(),
            filters in arb_filters(),
            order_by in arb_order_key(),
            order_dir in arb_order_dir(),
            limit in 1u32..=10_000u32,
            offset in 0u32..=100u32,
        ) {
            let mut projection = Projection {
                match_columns: match_cols,
                player_columns: player_cols,
                ..Default::default()
            };
            // include_players is derived from !player_columns.is_empty(); when the
            // proptest asks for players, ensure identity columns are present (the
            // resolver does this in prod via ensure_player_identity).
            if include_players && projection.player_columns.is_empty() {
                if let Some(c) = PLAYER_COLUMNS.iter().find(|c| c.gql == "match_id") {
                    projection.player_columns.push(*c);
                }
                if let Some(c) = PLAYER_COLUMNS.iter().find(|c| c.gql == "account_id") {
                    projection.player_columns.push(*c);
                }
            }
            let sql = build_matches_query(&BuildArgs {
                projection: &projection,
                filters: &filters,
                order_by,
                order_dir,
                limit,
                offset,
            }).unwrap();
            assert_valid_sql(&sql);
        }

        #[test]
        fn match_players_query_is_valid_sql(
            mut player_cols in arb_columns(PLAYER_COLUMNS),
            filters in arb_filters(),
            order_by in arb_order_key(),
            order_dir in arb_order_dir(),
            limit in 1u32..=10_000u32,
            offset in 0u32..=100u32,
        ) {
            // Need at least one column projected.
            if player_cols.is_empty()
                && let Some(c) = PLAYER_COLUMNS.iter().find(|c| c.gql == "match_id")
            {
                player_cols.push(*c);
            }
            let projection = Projection {
                player_columns: player_cols,
                ..Default::default()
            };
            let sql = build_match_players_query(&BuildArgs {
                projection: &projection,
                filters: &filters,
                order_by,
                order_dir,
                limit,
                offset,
            }).unwrap();
            assert_valid_sql(&sql);
        }

        #[test]
        fn match_history_query_is_valid_sql(
            mut columns in arb_columns(crate::routes::v1::graphql::projection::MATCH_HISTORY_COLUMNS),
            filters in arb_match_history_filters(),
            order_by in arb_order_key(),
            order_dir in arb_order_dir(),
            limit in 1u32..=10_000u32,
            offset in 0u32..=100u32,
        ) {
            // The resolver always ensures the merge keys via project_match_history.
            for key in ["account_id", "match_id"] {
                if !columns.iter().any(|c| c.gql == key)
                    && let Some(c) = MATCH_HISTORY_COLUMNS.iter().find(|c| c.gql == key)
                {
                    columns.push(*c);
                }
            }
            let sql = build_match_history_query(&MatchHistoryBuildArgs {
                columns: &columns,
                filters: &filters,
                order_by,
                order_dir,
                limit,
                offset,
            }).unwrap();
            assert_valid_sql(&sql);
        }
    }
}
