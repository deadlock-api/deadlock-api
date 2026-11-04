//! The day rollups behind `item-flow-stats` requests without player filters, and behind those
//! whose only player filter is one included upgrade.
//!
//! Without a hero, the edges query expands every player row of the window into one row per pair
//! of items bought in consecutive stages, ~3.5B for the season, and groups them: 14-28 s and
//! 440-555 CPU-s, at the 20 s timeout; the nodes query took 6-14 s. Rewrites of the expansion
//! were no faster. The rollups keep the nodes, edges and totals per day, match-level grain and
//! item (or item pair). Measured on prod, season window: edges 14.1 -> 2.5 s (436 -> 34 CPU-s),
//! nodes 5.9 -> 0.5 s, totals 1.5 -> 0.4 s, identical results but for `players`.
//!
//! The include rollups ([`Scope::Include`]) count each player row once per upgrade it bought, as
//! `include_item_id`: the population of a request that includes that one item. Such a request
//! scans every player row of its window for the 2-46% that own the item; a sweep over every
//! upgrade, normal mode and street brawl, made them ~9.5% of `ClickHouse` CPU on 2026-11-03/04.
//! They have no badge grain, which made edges 6x larger (82M rows a day). A day (ZSTD(1)) holds
//! ~13.8M normal and ~12.7M street-brawl edges rows in ~36 and ~25 MB, and ~1.1M normal nodes rows
//! in ~15 MB; building it takes ~100-200 s for the normal edges, seconds for the rest. Measured on a
//! two-day prototype: edges 1,734 -> 48 ms CPU and nodes 1,548 -> 23 ms over those days, identical
//! results. The alternative, a table of every player row per owned item, was -26..-81% CPU for
//! ~100 GiB per 35 days.
//!
//! Their rows are built from the same expressions as the base queries (see [`Stages::query`]), so
//! they count exactly what those count, without FINAL like them.

use std::collections::HashSet;

use itertools::Itertools as _;

use super::{
    ItemFlowStatsQuery, NW_BUCKET, TIME_PHASE_COLUMNS, UPGRADE_IDS_WITH, brawl_phase_count,
    query_parts, time_phase_expr,
};
use crate::routes::v1::analytics::common_filters::is_non_empty;
use crate::routes::v1::analytics::rollup_window::{
    Coverage, DaySplit, EdgeRows, Rollup, RollupFilters,
};
use crate::services::cohort_agg_refresh::HORIZON_DAYS;
use crate::utils::match_modes::{GameMode, MatchMode};

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
}

/// The player rows a rollup counts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Scope {
    /// Every normal-mode player row, per average badge.
    All,
    /// Each player row once per upgrade it bought (`include_item_id`), without the badge grain.
    Include(Stages),
}

/// The stage columns a rollup is built for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Stages {
    /// Normal mode's fixed time phases.
    Normal,
    /// Street brawl's rounds, [`BRAWL_PHASE_COUNT`] of them.
    Brawl,
}

/// The street-brawl `phase_count` the brawl rollups are built for: every street-brawl include
/// request of the 24 h to 2026-11-04 07:00 UTC sent it.
pub(crate) const BRAWL_PHASE_COUNT: u8 = 6;

/// Column of the include rollups: the upgrade whose buyers a row counts.
const INCLUDE: &str = "include_item_id";

impl Stages {
    /// The request every rollup row of these stages is built for: no filters.
    fn query(self) -> ItemFlowStatsQuery {
        match self {
            Self::Normal => normal(),
            Self::Brawl => ItemFlowStatsQuery {
                game_mode: Some(GameMode::StreetBrawl),
                phase_count: Some(BRAWL_PHASE_COUNT),
                ..Default::default()
            },
        }
    }

    /// The number of stage columns.
    pub(crate) const fn columns(self) -> u8 {
        match self {
            Self::Normal => TIME_PHASE_COLUMNS,
            Self::Brawl => BRAWL_PHASE_COUNT,
        }
    }

    /// `match_player.game_mode` of the rows.
    const fn game_mode(self) -> u8 {
        match self {
            Self::Normal => 1,
            Self::Brawl => 4,
        }
    }
}

/// One rollup table.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Agg {
    pub(crate) kind: Kind,
    pub(crate) scope: Scope,
}

impl Agg {
    /// Every rollup, in the order the refresh job builds them.
    pub(crate) const ALL: [Self; 9] = [
        Self::new(Kind::Nodes, Scope::All),
        Self::new(Kind::Edges, Scope::All),
        Self::new(Kind::Totals, Scope::All),
        Self::new(Kind::Nodes, Scope::Include(Stages::Normal)),
        Self::new(Kind::Edges, Scope::Include(Stages::Normal)),
        Self::new(Kind::Totals, Scope::Include(Stages::Normal)),
        Self::new(Kind::Nodes, Scope::Include(Stages::Brawl)),
        Self::new(Kind::Edges, Scope::Include(Stages::Brawl)),
        Self::new(Kind::Totals, Scope::Include(Stages::Brawl)),
    ];

    const fn new(kind: Kind, scope: Scope) -> Self {
        Self { kind, scope }
    }

    const fn stages(self) -> Stages {
        match self.scope {
            Scope::All => Stages::Normal,
            Scope::Include(stages) => stages,
        }
    }

    /// The rollup, rebuilt per day by `services/cohort_agg_refresh.rs` from [`agg_select_body`].
    /// Its columns are its grain, then its measures, then `built_through`.
    pub(crate) const fn table(self) -> &'static str {
        match (self.scope, self.kind) {
            (Scope::All, Kind::Nodes) => "default.item_flow_nodes_agg",
            (Scope::All, Kind::Edges) => "default.item_flow_edges_agg",
            (Scope::All, Kind::Totals) => "default.item_flow_totals_agg",
            (Scope::Include(Stages::Normal), Kind::Nodes) => "default.item_flow_nodes_inc_agg",
            (Scope::Include(Stages::Normal), Kind::Edges) => "default.item_flow_edges_inc_agg",
            (Scope::Include(Stages::Normal), Kind::Totals) => "default.item_flow_totals_inc_agg",
            (Scope::Include(Stages::Brawl), Kind::Nodes) => "default.item_flow_brawl_nodes_inc_agg",
            (Scope::Include(Stages::Brawl), Kind::Edges) => "default.item_flow_brawl_edges_inc_agg",
            (Scope::Include(Stages::Brawl), Kind::Totals) => {
                "default.item_flow_brawl_totals_inc_agg"
            }
        }
    }

    pub(crate) const fn staging(self) -> &'static str {
        match (self.scope, self.kind) {
            (Scope::All, Kind::Nodes) => "default.item_flow_nodes_agg_staging",
            (Scope::All, Kind::Edges) => "default.item_flow_edges_agg_staging",
            (Scope::All, Kind::Totals) => "default.item_flow_totals_agg_staging",
            (Scope::Include(Stages::Normal), Kind::Nodes) => {
                "default.item_flow_nodes_inc_agg_staging"
            }
            (Scope::Include(Stages::Normal), Kind::Edges) => {
                "default.item_flow_edges_inc_agg_staging"
            }
            (Scope::Include(Stages::Normal), Kind::Totals) => {
                "default.item_flow_totals_inc_agg_staging"
            }
            (Scope::Include(Stages::Brawl), Kind::Nodes) => {
                "default.item_flow_brawl_nodes_inc_agg_staging"
            }
            (Scope::Include(Stages::Brawl), Kind::Edges) => {
                "default.item_flow_brawl_edges_inc_agg_staging"
            }
            (Scope::Include(Stages::Brawl), Kind::Totals) => {
                "default.item_flow_brawl_totals_inc_agg_staging"
            }
        }
    }

    /// `(column, expression)` over the rows of [`agg_rows`], which carry the match columns of
    /// `match_player` under their names.
    const fn grain(self) -> &'static [(&'static str, &'static str)] {
        match (self.scope, self.kind) {
            (Scope::All, Kind::Nodes) => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("least_badge", "ifNull(average_badge, 0)"),
                ("greatest_badge", "ifNull(average_badge, 65535)"),
                ("day", "toDate(start_time)"),
                ("phase", "phase"),
                ("item_id", "toUInt32(upgrade_item_id)"),
                ("nw_bucket", "nw_bucket"),
            ],
            (Scope::All, Kind::Edges) => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("least_badge", "ifNull(average_badge, 0)"),
                ("greatest_badge", "ifNull(average_badge, 65535)"),
                ("day", "toDate(start_time)"),
                ("from_column", "toUInt8(i - 1)"),
                ("from_item_id", "toUInt32(u_ids[from_pos])"),
                ("to_item_id", "toUInt32(u_ids[to_pos])"),
            ],
            (Scope::All, Kind::Totals) => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("least_badge", "ifNull(average_badge, 0)"),
                ("greatest_badge", "ifNull(average_badge, 65535)"),
                ("day", "toDate(start_time)"),
            ],
            (Scope::Include(Stages::Normal), Kind::Nodes) => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("day", "toDate(start_time)"),
                (INCLUDE, INCLUDE),
                ("phase", "phase"),
                ("item_id", "toUInt32(upgrade_item_id)"),
                ("nw_bucket", "nw_bucket"),
            ],
            // Street brawl has no net-worth standardization (see `nodes_from_cells`).
            (Scope::Include(Stages::Brawl), Kind::Nodes) => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("day", "toDate(start_time)"),
                (INCLUDE, INCLUDE),
                ("phase", "phase"),
                ("item_id", "toUInt32(upgrade_item_id)"),
            ],
            (Scope::Include(_), Kind::Edges) => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("day", "toDate(start_time)"),
                (INCLUDE, INCLUDE),
                ("from_column", "toUInt8(i - 1)"),
                ("from_item_id", "toUInt32(u_ids[from_pos])"),
                ("to_item_id", "toUInt32(u_ids[to_pos])"),
            ],
            (Scope::Include(_), Kind::Totals) => &[
                ("game_mode", "game_mode"),
                ("match_mode", "match_mode"),
                ("day", "toDate(start_time)"),
                (INCLUDE, INCLUDE),
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
        match self.kind {
            Kind::Nodes => fixed(&[
                ("n_wins", "countIf(won)"),
                ("n_buys", "count()"),
                ("n_players", "countIf(first)"),
                ("sum_kills", "sum(kills)"),
                ("sum_deaths", "sum(deaths)"),
                ("sum_assists", "sum(assists)"),
                ("sum_net_worth_at_buy", "sum(nw)"),
            ]),
            Kind::Edges => fixed(&[("n_wins", "countIf(won)"), ("n_matches", "count()")]),
            Kind::Totals => {
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
                for c in 0..self.stages().columns() {
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

    const fn rollup<'a>(self, grain: &'a [(&'a str, &'a str)], measures: &'a str) -> Rollup<'a> {
        Rollup {
            table: self.table(),
            grain,
            measures,
            coverage: Coverage::Incremental {
                horizon_days: HORIZON_DAYS,
            },
        }
    }
}

/// The rows of rollup `agg` for the matches `where_clause` selects, grouped by the grain columns
/// of `grain_select`/`group_by`: a window's partial days, the matches ingested after their day was
/// built, or a whole rollup day.
///
/// `join_includes` builds an include rollup's day: each player row once per upgrade it bought,
/// as `include_item_id`. A request's own rows instead come from the item's buyers alone, which
/// its `where_clause` selects, and carry the item as a constant `include_item_id` expression.
#[expect(
    clippy::too_many_lines,
    reason = "one SQL template per rollup and stages; helpers would pass the same fragments around"
)]
fn agg_rows(
    agg: Agg,
    EdgeRows {
        where_clause,
        grain_select,
        group_by,
    }: &EdgeRows,
    join_includes: bool,
) -> String {
    let stages = agg.stages();
    let parts = query_parts(&stages.query());
    let upgrades_with = &parts.upgrades_with;
    let first_purchase = &parts.first_purchase;
    let by_column_select = &parts.by_column_select;
    let bought_columns = &parts.bought_columns;
    let measures = agg
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
    let prewhere = format!(
        "match_mode IN ('Ranked', 'Unranked') AND game_mode = {} AND account_id != 0 AND {where_clause}",
        stages.game_mode()
    );
    let (owned, join_owned, join_distinct) =
        if join_includes && matches!(agg.scope, Scope::Include(_)) {
            (
                ", arrayDistinct(upgrade_item_ids) AS owned",
                format!("\nARRAY JOIN owned AS {INCLUDE}"),
                format!("\nARRAY JOIN arrayDistinct(upgrade_item_ids) AS {INCLUDE}"),
            )
        } else {
            ("", String::new(), String::new())
        };
    // Street brawl stages are rounds, see `BrawlParts`.
    if let Some(brawl) = &parts.brawl {
        let round_ends_select = &brawl.round_ends_select;
        let purchase_columns = &brawl.purchase_columns;
        return match agg.kind {
            Kind::Nodes => format!(
                "SELECT
    {grain_select}{measures}
FROM (
    WITH {purchase_columns} AS purchase_columns
    SELECT
        game_mode, match_mode, start_time, won, kills, deaths, assists,
        upgrade_item_id, nw, first = 1 AS first, phase{owned}
    FROM (
        {upgrades_with}
        SELECT game_mode, match_mode, start_time, won, kills, deaths, assists, upgrade_item_ids, upgrade_buy_times, upgrade_net_worths, {round_ends_select}
        FROM default.match_player
        PREWHERE {prewhere}
    )
    ARRAY JOIN
        upgrade_item_ids AS upgrade_item_id,
        upgrade_buy_times AS buy_time,
        upgrade_net_worths AS nw,
        purchase_columns AS phase,
        {first_purchase} AS first
    WHERE buy_time > 0 AND nw > 0
){join_owned}{group_by}"
            ),
            Kind::Edges => format!(
                "WITH {UPGRADE_IDS_WITH}
SELECT
    {grain_select}{measures}
FROM (
    WITH {purchase_columns} AS purchase_columns
    SELECT game_mode, match_mode, start_time, won, {by_column_select}{owned}
    FROM (
        {upgrades_with}
        SELECT game_mode, match_mode, start_time, won, upgrade_item_ids, upgrade_buy_times, {round_ends_select}
        FROM default.match_player
        PREWHERE {prewhere}
    )
)
ARRAY JOIN arrayPopBack(arrayEnumerate(by_column)) AS i
ARRAY JOIN by_column[i] AS from_pos
ARRAY JOIN by_column[i + 1] AS to_pos{join_owned}{group_by}"
            ),
            Kind::Totals => format!(
                "WITH {bought_columns} AS bought_columns
SELECT
    {grain_select}{measures}
FROM (
    {upgrades_with}
    SELECT game_mode, match_mode, start_time, won, account_id, kills, deaths, assists, net_worth, duration_s, upgrade_item_ids, upgrade_buy_times, {round_ends_select}
    FROM default.match_player
    PREWHERE {prewhere}
){join_distinct}{group_by}"
            ),
        };
    }
    match agg.kind {
        // As the nodes query: purchases with a buy time and a net worth at buy.
        Kind::Nodes => {
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
        intDiv(nw, {NW_BUCKET}) AS nw_bucket{owned}
    FROM default.match_player
    ARRAY JOIN
        upgrade_item_ids AS upgrade_item_id,
        upgrade_buy_times AS buy_time,
        upgrade_net_worths AS nw,
        {first_purchase} AS first
    PREWHERE {prewhere}
    WHERE buy_time > 0 AND nw > 0
){join_owned}{group_by}"
            )
        }
        // `by_column` holds positions in `u_ids`, decoded by the grain.
        Kind::Edges => format!(
            "WITH {UPGRADE_IDS_WITH}
SELECT
    {grain_select}{measures}
FROM (
    {upgrades_with}
    SELECT game_mode, match_mode, average_badge, start_time, won, {by_column_select}{owned}
    FROM default.match_player
    PREWHERE {prewhere}
)
ARRAY JOIN arrayPopBack(arrayEnumerate(by_column)) AS i
ARRAY JOIN by_column[i] AS from_pos
ARRAY JOIN by_column[i + 1] AS to_pos{join_owned}{group_by}"
        ),
        Kind::Totals => format!(
            "{upgrades_with},
    {bought_columns} AS bought_columns
SELECT
    {grain_select}{measures}
FROM default.match_player{join_distinct}
PREWHERE {prewhere}{group_by}"
        ),
    }
}

/// The rows of rollup `agg` for the matches selected by `since_clause`, at the full grain and in
/// the table's column order. The refresh job builds the rollup's days with it.
pub(crate) fn agg_select_body(agg: Agg, since_clause: &str) -> String {
    agg_rows(
        agg,
        &EdgeRows {
            where_clause: since_clause.to_owned(),
            grain_select: agg
                .grain()
                .iter()
                .map(|(col, expr)| format!("{expr} AS {col},\n    "))
                .collect::<Vec<_>>()
                .concat(),
            group_by: agg
                .grain()
                .iter()
                .map(|(col, _)| *col)
                .collect::<Vec<_>>()
                .join(", "),
        },
        true,
    )
}

/// The request every rollup row is built for: normal mode, no filters.
fn normal() -> ItemFlowStatsQuery {
    ItemFlowStatsQuery {
        game_mode: Some(GameMode::Normal),
        ..Default::default()
    }
}

/// Whether [`sources`] needs the upgrade ids to decide: the request includes one item.
pub(super) fn wants_upgrade_ids(query: &ItemFlowStatsQuery) -> bool {
    matches!(query.include_item_ids.as_deref(), Some([_]))
}

/// The rollups whose grain covers every filter of `query`, and its included item for the include
/// ones. An included item must be an upgrade (in `upgrades`): only upgrades have include rows, and
/// the base query looks other items up in `items.item_id`.
fn scope(
    query: &ItemFlowStatsQuery,
    upgrades: Option<&HashSet<u32>>,
) -> Option<(Scope, Option<u32>)> {
    let player_filtered = is_non_empty(query.hero_ids.as_deref())
        || is_non_empty(query.account_ids.as_deref())
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
    if player_filtered || match_filtered || !MatchMode::is_agg_servable(query.match_mode.as_deref())
    {
        return None;
    }
    match query.include_item_ids.as_deref() {
        None | Some([]) => {
            (query.game_mode == Some(GameMode::Normal)).then_some((Scope::All, None))
        }
        Some(&[id]) => {
            let badge_filtered =
                query.min_average_badge.is_some() || query.max_average_badge.is_some();
            if badge_filtered || !upgrades.is_some_and(|upgrades| upgrades.contains(&id)) {
                return None;
            }
            let stages = match query.game_mode {
                Some(GameMode::Normal) => Stages::Normal,
                Some(GameMode::StreetBrawl) if brawl_phase_count(query) == BRAWL_PHASE_COUNT => {
                    Stages::Brawl
                }
                _ => return None,
            };
            Some((Scope::Include(stages), Some(id)))
        }
        Some(_) => None,
    }
}

/// The stages of the rollups serving `query` and their parenthesized `FROM` sources over its
/// window, `(nodes, edges, totals)`, or `None` when the request needs `match_player`: a filter
/// the grain lacks (hero, account, net worth, excluded items, more than one included item or a
/// non-upgrade, ability order, locked items, duration, match id, badge with an included item),
/// street brawl without an included item or at another `phase_count`, match modes the rollups do
/// not hold, or a window without a whole day. `upgrades` holds the upgrade ids, when
/// [`wants_upgrade_ids`].
///
/// The nodes source has the columns `phase`, `item_id` and (normal mode) `nw_bucket`, the edges
/// source `from_column`, `from_item_id` and `to_item_id`, each with its rollup's measures.
pub(super) fn sources(
    query: &ItemFlowStatsQuery,
    upgrades: Option<&HashSet<u32>>,
) -> Option<(Stages, [String; 3])> {
    let (scope, include) = scope(query, upgrades)?;
    let split = DaySplit::new(query.min_unix_timestamp, query.max_unix_timestamp)?;
    let mut filters = RollupFilters::new(
        query.game_mode,
        query.match_mode.as_deref(),
        query.min_average_badge,
        query.max_average_badge,
    );
    // The base-table rows of the window's partial days and of what the rollup lacks come from
    // the item's buyers alone, the base query's filter for an upgrade.
    let include_expr = include
        .map(|id| format!("toUInt32({id})"))
        .unwrap_or_default();
    if let Some(id) = include {
        filters.rollup.push(format!("{INCLUDE} = {id}"));
        filters.base.push(format!("has(upgrades.item_id, {id})"));
    }
    let stages = match scope {
        Scope::All => Stages::Normal,
        Scope::Include(stages) => stages,
    };
    let sources = Kind::ALL.map(|kind| {
        let agg = Agg::new(kind, scope);
        let measures = agg.measures().into_iter().map(|(col, _)| col).join(", ");
        let grain = agg
            .grain()
            .iter()
            .map(|&(col, expr)| {
                (
                    col,
                    if col == INCLUDE {
                        include_expr.as_str()
                    } else {
                        expr
                    },
                )
            })
            .collect::<Vec<_>>();
        let outer = match (kind, stages) {
            (Kind::Nodes, Stages::Normal) => "phase, item_id, nw_bucket",
            (Kind::Nodes, Stages::Brawl) => "phase, item_id",
            (Kind::Edges, _) => "from_column, from_item_id, to_item_id",
            (Kind::Totals, _) => "",
        };
        agg.rollup(&grain, &measures)
            .source(&split, &filters, outer, |edge| agg_rows(agg, edge, false))
    });
    Some((stages, sources))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::{assert_parses, dump_sql};

    #[test]
    fn rollup_rows_have_the_table_column_order() {
        for agg in Agg::ALL {
            let body = agg_select_body(agg, "TRUE");
            assert_parses(&body);
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
            let expected = agg
                .grain()
                .iter()
                .map(|(col, _)| (*col).to_owned())
                .chain(agg.measures().into_iter().map(|(col, _)| col))
                .collect::<Vec<_>>();
            assert_eq!(columns, expected, "{agg:?}");
        }
    }

    /// The rollup SQL of the all-players family, which refactors must keep byte-identical (it
    /// keys the result cache): the day builds and the sources of servable windows.
    #[test]
    fn agg_sql_dump() {
        dump_sql("item_flow_agg", |q: &ItemFlowStatsQuery| {
            let query = ItemFlowStatsQuery {
                match_mode: q.match_mode.clone(),
                min_unix_timestamp: q.min_unix_timestamp,
                max_unix_timestamp: q.max_unix_timestamp,
                min_average_badge: q.min_average_badge,
                max_average_badge: q.max_average_badge,
                ..normal()
            };
            let builds = Kind::ALL.map(|kind| agg_select_body(Agg::new(kind, Scope::All), "TRUE"));
            let sources = sources(&query, None)
                .map_or_else(|| "-- not served".to_owned(), |(_, s)| s.join("\n"));
            format!("{}\n{sources}", builds.join("\n"))
        });
    }

    #[test]
    fn include_rollups_serve_one_upgrade_without_badge_filters() {
        let upgrades = HashSet::from([7, 8]);
        let query = ItemFlowStatsQuery {
            // 2026-10-05 00:00 UTC, open-ended.
            min_unix_timestamp: Some(1_791_158_400),
            include_item_ids: Some(vec![7]),
            ..normal()
        };
        let (stages, [nodes, edges, totals]) = sources(&query, Some(&upgrades)).expect("served");
        assert_eq!(stages, Stages::Normal);
        for (source, table) in [
            (&nodes, "item_flow_nodes_inc_agg"),
            (&edges, "item_flow_edges_inc_agg"),
            (&totals, "item_flow_totals_inc_agg"),
        ] {
            assert_parses(&format!("SELECT count() FROM {source}"));
            assert!(
                source.contains(&format!("FROM default.{table} WHERE ")),
                "{source}"
            );
            assert!(source.contains("include_item_id = 7"), "{source}");
            // The base-table rows read the item's buyers, carrying it as a constant.
            assert!(source.contains("AND has(upgrades.item_id, 7)"), "{source}");
            assert!(
                source.contains("toUInt32(7) AS include_item_id"),
                "{source}"
            );
            assert!(!source.contains("ARRAY JOIN owned"), "{source}");
            assert!(!source.contains("least_badge"), "{source}");
        }

        let brawl = ItemFlowStatsQuery {
            game_mode: Some(GameMode::StreetBrawl),
            phase_count: Some(BRAWL_PHASE_COUNT),
            ..query.clone()
        };
        let (stages, [nodes, _, totals]) = sources(&brawl, Some(&upgrades)).expect("served");
        assert_eq!(stages, Stages::Brawl);
        assert!(nodes.contains("FROM default.item_flow_brawl_nodes_inc_agg WHERE game_mode = 4"));
        assert!(!nodes.contains("nw_bucket"));
        assert!(totals.contains("n_reached_wins_5"));

        let not_served = [
            ItemFlowStatsQuery {
                include_item_ids: Some(vec![9]),
                ..query.clone()
            },
            ItemFlowStatsQuery {
                include_item_ids: Some(vec![7, 8]),
                ..query.clone()
            },
            ItemFlowStatsQuery {
                min_average_badge: Some(91),
                ..query.clone()
            },
            ItemFlowStatsQuery {
                hero_ids: Some(vec![13]),
                ..query.clone()
            },
            ItemFlowStatsQuery {
                phase_count: Some(4),
                ..brawl
            },
        ];
        for query in &not_served {
            assert!(sources(query, Some(&upgrades)).is_none(), "{query:?}");
        }
        assert!(sources(&query, None).is_none());
        assert!(wants_upgrade_ids(&query));
        assert!(!wants_upgrade_ids(&normal()));
    }

    #[test]
    fn include_builds_count_each_owned_upgrade() {
        for agg in Agg::ALL {
            let body = agg_select_body(agg, "TRUE");
            match agg.scope {
                Scope::All => assert!(!body.contains("include_item_id"), "{agg:?}"),
                Scope::Include(stages) => {
                    assert!(
                        body.contains("ARRAY JOIN owned AS include_item_id")
                            || body.contains(
                                "ARRAY JOIN arrayDistinct(upgrade_item_ids) AS include_item_id"
                            ),
                        "{body}"
                    );
                    assert!(
                        body.contains(&format!("AND game_mode = {} AND", stages.game_mode())),
                        "{body}"
                    );
                }
            }
        }
    }

    #[test]
    fn edges_rows_define_the_upgrade_positions() {
        let body = agg_select_body(Agg::new(Kind::Edges, Scope::All), "TRUE");
        assert!(body.starts_with("WITH (SELECT arraySort(groupArray(id))"));
        assert!(body.contains(") AS u_ids\nSELECT"));
        assert!(body.contains("toUInt32(u_ids[from_pos]) AS from_item_id"));
    }

    #[test]
    fn serves_requests_without_player_filters() {
        let query = ItemFlowStatsQuery {
            // 2026-07-30 17:00 UTC, open-ended.
            min_unix_timestamp: Some(1_785_430_800),
            min_average_badge: Some(91),
            ..normal()
        };
        let (stages, [nodes, edges, totals]) = sources(&query, None).expect("served");
        assert_eq!(stages, Stages::Normal);
        for source in [&nodes, &edges, &totals] {
            assert_parses(&format!("SELECT count() FROM {source}"));
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
            sources(
                &ItemFlowStatsQuery {
                    hero_ids: Some(vec![13]),
                    ..query.clone()
                },
                None
            )
            .is_none()
        );
        assert!(
            sources(
                &ItemFlowStatsQuery {
                    game_mode: Some(GameMode::StreetBrawl),
                    min_average_badge: None,
                    ..query.clone()
                },
                None
            )
            .is_none()
        );
        assert!(
            sources(
                &ItemFlowStatsQuery {
                    match_mode: Some(vec![MatchMode::PrivateLobby]),
                    ..query.clone()
                },
                None
            )
            .is_none()
        );
        assert!(
            sources(
                &ItemFlowStatsQuery {
                    max_unix_timestamp: Some(1_785_430_800 + 3600),
                    ..query
                },
                None
            )
            .is_none()
        );
    }
}
