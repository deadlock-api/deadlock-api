//! The day rollups behind `item-flow-stats` requests without player filters.
//!
//! Without a hero, the edges query expands every player row of the window into one row per pair
//! of items bought in consecutive stages, ~3.5B for the season, and groups them: 14-28 s and
//! 440-555 CPU-s, at the 20 s timeout; the nodes query took 6-14 s. Rewrites of the expansion
//! were no faster. The rollups keep the nodes, edges and totals per day, match-level grain and
//! item (or item pair). Measured on prod, season window: edges 14.1 -> 2.5 s (436 -> 34 CPU-s),
//! nodes 5.9 -> 0.5 s, totals 1.5 -> 0.4 s, identical results but for `players`.
//!
//! Their rows are built from the same expressions as the base queries (see [`normal`]), so they
//! count exactly what those count, without FINAL like them.

use super::{ItemFlowStatsQuery, NW_BUCKET, TIME_PHASE_COLUMNS, query_parts, time_phase_expr};
use crate::routes::v1::analytics::common_filters::is_non_empty;
use crate::routes::v1::analytics::rollup_window::{
    Coverage, DaySplit, EdgeRows, Rollup, RollupFilters,
};
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::services::cohort_agg_refresh::HORIZON_DAYS;

/// Which of the three rollups.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Kind {
    /// Purchases per stage, item and net-worth-at-buy bucket.
    Nodes,
    /// Pairs of items bought in consecutive stages.
    Edges,
    /// Player rows: the population totals and the games that reached each stage.
    Totals,
}

impl Kind {
    pub(crate) const ALL: [Self; 3] = [Self::Nodes, Self::Edges, Self::Totals];

    /// The rollup, rebuilt per day by `services/cohort_agg_refresh.rs` from [`agg_select_body`].
    /// Its columns are its grain, then its measures, then `built_through`.
    pub(crate) fn table(self) -> &'static str {
        match self {
            Self::Nodes => "default.item_flow_nodes_agg",
            Self::Edges => "default.item_flow_edges_agg",
            Self::Totals => "default.item_flow_totals_agg",
        }
    }

    pub(crate) fn staging(self) -> &'static str {
        match self {
            Self::Nodes => "default.item_flow_nodes_agg_staging",
            Self::Edges => "default.item_flow_edges_agg_staging",
            Self::Totals => "default.item_flow_totals_agg_staging",
        }
    }

    /// `(column, expression)` over the rows of [`agg_rows`], which carry the match columns of
    /// `match_player` under their names.
    fn grain(self) -> &'static [(&'static str, &'static str)] {
        match self {
            Self::Nodes => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("least_badge", "ifNull(average_badge, 0)"),
                ("greatest_badge", "ifNull(average_badge, 65535)"),
                ("day", "toDate(start_time)"),
                ("phase", "phase"),
                ("item_id", "toUInt32(upgrade_item_id)"),
                ("nw_bucket", "nw_bucket"),
            ],
            Self::Edges => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("least_badge", "ifNull(average_badge, 0)"),
                ("greatest_badge", "ifNull(average_badge, 65535)"),
                ("day", "toDate(start_time)"),
                ("from_column", "toUInt8(i - 1)"),
                ("from_item_id", "toUInt32(from_item)"),
                ("to_item_id", "toUInt32(to_item)"),
            ],
            Self::Totals => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("least_badge", "ifNull(average_badge, 0)"),
                ("greatest_badge", "ifNull(average_badge, 65535)"),
                ("day", "toDate(start_time)"),
            ],
        }
    }

    /// `(column, aggregate)` in table order. `players_state` is a `uniqCombined(14)` state like
    /// the other rollups' (see `game_stats::agg_measures`): on the season the totals' `players`
    /// was within 2% of the base query's `uniq`.
    fn measures(self) -> Vec<(String, String)> {
        let fixed = |measures: &[(&str, &str)]| {
            measures
                .iter()
                .map(|(col, expr)| ((*col).to_owned(), (*expr).to_owned()))
                .collect::<Vec<_>>()
        };
        match self {
            Self::Nodes => fixed(&[
                ("n_wins", "countIf(won)"),
                ("n_buys", "count()"),
                ("n_players", "countIf(first)"),
                ("sum_kills", "sum(kills)"),
                ("sum_deaths", "sum(deaths)"),
                ("sum_assists", "sum(assists)"),
                ("sum_net_worth_at_buy", "sum(nw)"),
            ]),
            Self::Edges => fixed(&[("n_wins", "countIf(won)"), ("n_matches", "count()")]),
            Self::Totals => {
                let mut measures = fixed(&[
                    ("n_wins", "countIf(won)"),
                    ("n_rows", "count()"),
                    ("players_state", "uniqCombinedState(14)(account_id)"),
                    ("sum_kills", "sum(kills)"),
                    ("sum_deaths", "sum(deaths)"),
                    ("sum_assists", "sum(assists)"),
                    ("sum_net_worth", "sum(net_worth)"),
                    ("sum_duration_s", "sum(duration_s)"),
                ]);
                for c in 0..TIME_PHASE_COLUMNS {
                    measures.push((
                        format!("n_reached_{c}"),
                        format!("countIf(has(bought_columns, {c}))"),
                    ));
                    measures.push((
                        format!("n_reached_wins_{c}"),
                        format!("countIf(won AND has(bought_columns, {c}))"),
                    ));
                }
                measures
            }
        }
    }

    fn rollup(self, measures: &str) -> Rollup<'_> {
        Rollup {
            table: self.table(),
            grain: self.grain(),
            measures,
            coverage: Coverage::Incremental {
                horizon_days: HORIZON_DAYS,
            },
        }
    }
}

/// The rows of rollup `kind` for the matches `where_clause` selects, grouped by the grain columns
/// of `grain_select`/`group_by`: a window's partial days, the matches ingested after their day was
/// built, or a whole rollup day. Normal mode only: street brawl's stages depend on the request's
/// `phase_count`.
fn agg_rows(
    kind: Kind,
    EdgeRows {
        where_clause,
        grain_select,
        group_by,
    }: &EdgeRows,
) -> String {
    let parts = query_parts(&normal());
    let upgrades_with = &parts.upgrades_with;
    let measures = kind
        .measures()
        .iter()
        .map(|(col, expr)| format!("{expr} AS {col}"))
        .collect::<Vec<_>>()
        .join(",\n    ");
    let group_by = if group_by.is_empty() {
        String::new()
    } else {
        format!("\nGROUP BY {group_by}")
    };
    let prewhere =
        format!("match_mode IN ('Ranked', 'Unranked') AND game_mode = 1 AND {where_clause}");
    match kind {
        // As the nodes query: purchases with a buy time and a net worth at buy.
        Kind::Nodes => {
            let first_purchase = &parts.first_purchase;
            let column_expr = time_phase_expr("buy_time");
            format!(
                "SELECT
    {grain_select}{measures}
FROM (
    {upgrades_with}
    SELECT
        game_mode, match_mode, average_badge, start_time, won, kills, deaths, assists,
        upgrade_item_id, nw, first = 1 AS first,
        {column_expr} AS phase,
        intDiv(nw, {NW_BUCKET}) AS nw_bucket
    FROM default.match_player
    ARRAY JOIN
        upgrade_item_ids AS upgrade_item_id,
        upgrade_buy_times AS buy_time,
        upgrade_net_worths AS nw,
        {first_purchase} AS first
    PREWHERE {prewhere}
    WHERE buy_time > 0 AND nw > 0
){group_by}"
            )
        }
        Kind::Edges => {
            let by_column_select = &parts.by_column_select;
            format!(
                "SELECT
    {grain_select}{measures}
FROM (
    {upgrades_with}
    SELECT game_mode, match_mode, average_badge, start_time, won, {by_column_select}
    FROM default.match_player
    PREWHERE {prewhere}
)
ARRAY JOIN arrayPopBack(arrayEnumerate(by_column)) AS i
ARRAY JOIN by_column[i] AS from_item
ARRAY JOIN by_column[i + 1] AS to_item{group_by}"
            )
        }
        Kind::Totals => {
            let bought_columns = &parts.bought_columns;
            format!(
                "{upgrades_with},
    {bought_columns} AS bought_columns
SELECT
    {grain_select}{measures}
FROM default.match_player
PREWHERE {prewhere}{group_by}"
            )
        }
    }
}

/// The rows of rollup `kind` for the matches selected by `since_clause`, at the full grain and in
/// the table's column order. The refresh job builds the rollup's days with it.
pub(crate) fn agg_select_body(kind: Kind, since_clause: &str) -> String {
    agg_rows(
        kind,
        &EdgeRows {
            where_clause: since_clause.to_owned(),
            grain_select: kind
                .grain()
                .iter()
                .map(|(col, expr)| format!("{expr} AS {col},\n    "))
                .collect::<Vec<_>>()
                .concat(),
            group_by: kind
                .grain()
                .iter()
                .map(|(col, _)| *col)
                .collect::<Vec<_>>()
                .join(", "),
        },
    )
}

/// The request every rollup row is built for: normal mode, no filters.
fn normal() -> ItemFlowStatsQuery {
    ItemFlowStatsQuery {
        game_mode: Some(GameMode::Normal),
        ..Default::default()
    }
}

/// Whether the rollups' grain covers every filter of `query`.
fn servable(query: &ItemFlowStatsQuery) -> bool {
    let player_filtered = is_non_empty(query.hero_ids.as_deref())
        || is_non_empty(query.account_ids.as_deref())
        || is_non_empty(query.include_item_ids.as_deref())
        || is_non_empty(query.exclude_item_ids.as_deref())
        || is_non_empty(query.ability_order_prefix.as_deref())
        || is_non_empty(query.ability_unlock_order_prefix.as_deref())
        || is_non_empty(query.locked_item_ids.as_deref())
        || query.min_networth.is_some()
        || query.max_networth.is_some();
    let match_filtered = query.min_duration_s.is_some()
        || query.max_duration_s.is_some()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some();
    query.game_mode == Some(GameMode::Normal)
        && !player_filtered
        && !match_filtered
        && MatchMode::is_agg_servable(query.match_mode.as_deref())
}

/// Parenthesized `FROM` sources of the three rollups over the request's window, `(nodes, edges,
/// totals)`, or `None` when the request needs `match_player`: a filter the grain lacks (hero,
/// account, net worth, items, ability order, locked items, duration, match id), street brawl,
/// match modes the rollups do not hold, or a window without a whole day.
///
/// The nodes source has the columns `phase`, `item_id` and `nw_bucket`, the edges source
/// `from_column`, `from_item_id` and `to_item_id`, each with its rollup's measures.
pub(super) fn sources(query: &ItemFlowStatsQuery) -> Option<[String; 3]> {
    if !servable(query) {
        return None;
    }
    let split = DaySplit::new(query.min_unix_timestamp, query.max_unix_timestamp)?;
    let filters = RollupFilters::new(
        query.game_mode,
        query.match_mode.as_deref(),
        query.min_average_badge,
        query.max_average_badge,
    );
    Some(Kind::ALL.map(|kind| {
        let measures = kind
            .measures()
            .into_iter()
            .map(|(col, _)| col)
            .collect::<Vec<_>>()
            .join(", ");
        let outer = match kind {
            Kind::Nodes => "phase, item_id, nw_bucket",
            Kind::Edges => "from_column, from_item_id, to_item_id",
            Kind::Totals => "",
        };
        kind.rollup(&measures)
            .source(&split, &filters, outer, |edge| agg_rows(kind, edge))
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn rollup_rows_have_the_table_column_order() {
        for kind in Kind::ALL {
            let body = agg_select_body(kind, "TRUE");
            assert_valid_sql(&body);
            let outer = body
                .split("\nFROM ")
                .next()
                .and_then(|s| s.rsplit("SELECT\n").next())
                .expect("outer select");
            let columns = outer
                .split(",\n")
                .filter_map(|item| item.trim().rsplit_once(" AS "))
                .map(|(_, col)| col.to_owned())
                .collect::<Vec<_>>();
            let expected = kind
                .grain()
                .iter()
                .map(|(col, _)| (*col).to_owned())
                .chain(kind.measures().into_iter().map(|(col, _)| col))
                .collect::<Vec<_>>();
            assert_eq!(columns, expected, "{kind:?}");
        }
    }

    #[test]
    fn serves_requests_without_player_filters() {
        let query = ItemFlowStatsQuery {
            // 2026-07-30 17:00 UTC, open-ended.
            min_unix_timestamp: Some(1_785_430_800),
            min_average_badge: Some(91),
            ..normal()
        };
        let [nodes, edges, totals] = sources(&query).expect("served");
        for source in [&nodes, &edges, &totals] {
            assert_valid_sql(&format!("SELECT count() FROM {source}"));
            assert!(source.contains("least_badge >= 91"));
            assert!(source.contains("FROM default.match_player\n"));
        }
        assert!(
            nodes.contains(
                "SELECT game_mode, least_badge, phase, item_id, nw_bucket, n_wins, n_buys"
            )
        );
        assert!(edges.contains(
            "SELECT game_mode, least_badge, from_column, from_item_id, to_item_id, n_wins, n_matches"
        ));
        assert!(totals.contains("SELECT game_mode, least_badge, n_wins, n_rows, players_state"));

        assert!(
            sources(&ItemFlowStatsQuery {
                hero_ids: Some(vec![13]),
                ..query.clone()
            })
            .is_none()
        );
        assert!(
            sources(&ItemFlowStatsQuery {
                game_mode: Some(GameMode::StreetBrawl),
                min_average_badge: None,
                ..query.clone()
            })
            .is_none()
        );
        assert!(
            sources(&ItemFlowStatsQuery {
                match_mode: Some(vec![MatchMode::PrivateLobby]),
                ..query.clone()
            })
            .is_none()
        );
        assert!(
            sources(&ItemFlowStatsQuery {
                max_unix_timestamp: Some(1_785_430_800 + 3600),
                ..query
            })
            .is_none()
        );
    }
}
