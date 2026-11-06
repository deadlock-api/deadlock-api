//! Locked build paths of [`MIN_LOCKS`] or more items, hero-filtered, in normal mode: the locked
//! totals, nodes and edges from one scan of `match_player` instead of three.
//!
//! Each of the three queries otherwise reads `items.*` of every row of the hero's window to find
//! the few that hold the locked items. Here a `PREWHERE` keeps the rows that hold all but at most
//! one of them (what leave-one-out needs), and each row emits tagged contributions through one
//! `ARRAY JOIN`: `kind` 0 for the totals of the locked path (`a` = 0) or of the path without lock
//! `a` (1-based), 1 per node cell (column, item, net-worth bucket) and 2 per edge, the last two
//! from the rows holding every lock only. The baseline does not depend on the locks: it comes from
//! the unlocked totals query, the same rows and expressions as the locked one's `b_*`, cached per
//! filter set.
//!
//! Measured on 12 of a sweeper's 3-5 lock requests (7 heroes, 14 days), paired, median of 3:
//! identical nodes, edges and totals, CPU -29% (p = 0.002; -54..+11% per request) with the
//! baseline cached, break-even when it is not (~2-3 CPU-s). The baseline is the unlocked request's
//! totals query, so it shares that request's cache entry. Median wall 0.7 → 1.2 s: the three
//! queries ran concurrently. With 1-2 locks the prefilter keeps most of the hero's rows and the
//! merged `GROUP BY` costs more than the two specialised ones (CPU -33..+35%, wall 2-5x), so those
//! keep the three queries.

use clickhouse::Row;
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};

use super::{
    ItemFlowEdge, ItemFlowNode, ItemFlowStatsQuery, ItemFlowTotalsRow, NW_BUCKET, QueryParts,
    TIME_PHASE_COLUMNS, UPGRADE_IDS_WITH, reads_base_upgrades, time_phase_expr,
};
use crate::utils::match_modes::GameMode;
use crate::utils::sql::cached_ch_query;

/// The fewest locks the merged query serves, see the module docs.
const MIN_LOCKS: usize = 3;

/// The locked item ids in request order (paired with `locked_columns`).
fn locked_ids(query: &ItemFlowStatsQuery) -> Vec<u32> {
    query
        .locked_item_ids
        .iter()
        .flatten()
        .zip(query.locked_columns.iter().flatten())
        .map(|(&id, _)| id)
        .collect()
}

/// Whether `query` is served by [`build_locked_query`]: normal mode, a hero filter (the
/// projection path, see [`super::upgrades_source`]) and at least [`MIN_LOCKS`] locks.
pub(super) fn applies(query: &ItemFlowStatsQuery) -> bool {
    let is_brawl = query.game_mode == Some(GameMode::StreetBrawl);
    !is_brawl && !reads_base_upgrades(query, is_brawl) && locked_ids(query).len() >= MIN_LOCKS
}

/// The query with the locks removed, whose totals are the locked request's baseline.
pub(super) fn unlocked(query: &ItemFlowStatsQuery) -> ItemFlowStatsQuery {
    ItemFlowStatsQuery {
        locked_item_ids: None,
        locked_columns: None,
        ..query.clone()
    }
}

/// One output row of [`build_locked_query`]; `kind` says which of the other fields hold what.
#[derive(Debug, Clone, Row, Serialize, Deserialize)]
pub(super) struct LockedRow {
    /// 0 = totals, 1 = node, 2 = edge.
    kind: u8,
    /// Totals: the 1-based lock left out (0 = none). Node: column. Edge: from column.
    a: u32,
    /// Node: item id. Edge: from item id.
    b: u32,
    /// Edge: to item id.
    c: u32,
    wins: u64,
    matches: u64,
    /// Totals: distinct accounts (`uniq`). Node: first purchases.
    players: u64,
    total_kills: u64,
    total_deaths: u64,
    total_assists: u64,
    /// Node only.
    adjusted_win_rate: f64,
    /// Node only.
    avg_net_worth_at_buy: f64,
    /// Totals only.
    avg_net_worth: f64,
    /// Totals only.
    avg_duration_s: f64,
    /// Totals only: games that bought any upgrade in each column.
    reached: Vec<u64>,
    /// Totals only: the won ones of `reached`.
    reached_wins: Vec<u64>,
}

cached_ch_query! {
    pub(super) fn run_locked_query(3600) -> Vec<LockedRow>;
}

pub(super) fn build_locked_query(query: &ItemFlowStatsQuery, parts: &QueryParts) -> String {
    let QueryParts {
        prewhere,
        base_player_filters,
        locks_with,
        first_purchase,
        by_column_select,
        bought_columns,
        upgrades_with,
        extra_settings,
        ..
    } = parts;
    let ids = locked_ids(query);
    let min_matches = query.min_matches.unwrap_or(20);
    // A row missing at most one lock holds the other locks' items.
    let present = ids
        .iter()
        .map(|id| format!("has(items.item_id, {id})"))
        .join(" + ");
    let need = ids.len().saturating_sub(1);
    let locks = (0..ids.len()).map(|i| format!("locked_{i}")).join(", ");
    let col = time_phase_expr("gt");
    let columns = (0..TIME_PHASE_COLUMNS).join(", ");
    let no_columns = (0..TIME_PHASE_COLUMNS).map(|_| "0").join(", ");
    format!(
        "
    WITH {UPGRADE_IDS_WITH}
    SELECT
        kind,
        a,
        toUInt32(if(kind = 2, u_ids[b], b)) AS b,
        toUInt32(if(kind = 2, u_ids[c], 0)) AS c,
        sum(cwins)                     AS wins,
        sum(cm)                        AS matches,
        sum(cpl)                       AS players,
        sum(ck)                        AS total_kills,
        sum(cd)                        AS total_deaths,
        sum(ca)                        AS total_assists,
        toFloat64(if(kind = 1, sum(w * (cwins / cm)) / sum(w), 0)) AS adjusted_win_rate,
        toFloat64(if(kind = 1, sum(cnw) / sum(cm), 0))             AS avg_net_worth_at_buy,
        sum(cnwf) / sum(cm)            AS avg_net_worth,
        sum(cdur) / sum(cm)            AS avg_duration_s,
        sumForEach(creached)           AS reached,
        sumForEach(creached_wins)      AS reached_wins
    FROM (
        SELECT *, sum(cm) OVER (PARTITION BY kind, a, nb) AS w
        FROM (
            {upgrades_with},
        {bought_columns} AS bought_columns{locks_with},
        [{locks}] AS locks,
        arrayFilter(j -> NOT locks[j], arrayEnumerate(locks)) AS missing,
        empty(missing) AS full,
        {by_column_select},
        if(length(missing) <= 1, [(toUInt8(0), toUInt32(if(full, 0, missing[1])), toUInt32(0), toUInt32(0), toUInt64(0), toUInt8(0))], []) AS totals_e,
        if(full, arrayFilter(x -> x.5 > 0, arrayMap(
            (iid, gt, bnw, f) -> (toUInt8(1), toUInt32({col}), toUInt32(iid), toUInt32(0), toUInt64(if(gt > 0 AND bnw > 0, bnw, 0)), toUInt8(f = 1)),
            upgrade_item_ids, upgrade_buy_times, upgrade_net_worths, {first_purchase})), []) AS nodes_e,
        if(full, arrayFlatten(arrayMap(i -> arrayFlatten(arrayMap(f -> arrayMap(t -> (toUInt8(2), toUInt32(i - 1), toUInt32(f), toUInt32(t), toUInt64(0), toUInt8(0)), by_column[i + 1]), by_column[i])), range(1, {TIME_PHASE_COLUMNS}))), []) AS edges_e
            SELECT
                e.1 AS kind,
                e.2 AS a,
                e.3 AS b,
                e.4 AS c,
                if(kind = 1, intDiv(e.5, {NW_BUCKET}), 0) AS nb,
                countIf(won)                   AS cwins,
                count()                        AS cm,
                if(kind = 0, uniqIf(account_id, kind = 0), sum(e.6)) AS cpl,
                sum(kills)                     AS ck,
                sum(deaths)                    AS cd,
                sum(assists)                   AS ca,
                sum(e.5)                       AS cnw,
                sum(net_worth)                 AS cnwf,
                sum(duration_s)                AS cdur,
                sumForEach(if(kind = 0, arrayMap(p -> toUInt64(has(bought_columns, p)), [{columns}]), [{no_columns}])) AS creached,
                sumForEach(if(kind = 0 AND won, arrayMap(p -> toUInt64(has(bought_columns, p)), [{columns}]), [{no_columns}])) AS creached_wins
            FROM match_player
            ARRAY JOIN arrayConcat(totals_e, nodes_e, edges_e) AS e
            PREWHERE {prewhere} AND ({present}) >= {need}
            WHERE TRUE {base_player_filters}
            GROUP BY kind, a, b, c, nb
        )
    )
    GROUP BY kind, a, b, c
    HAVING kind = 0 OR matches >= {min_matches}
    ORDER BY kind ASC, if(kind = 1, a, 0) ASC, matches DESC
    SETTINGS log_comment = 'item_flow_stats_locked', apply_patch_parts = 0{extra_settings}
    "
    )
}

/// Splits the rows of [`build_locked_query`] into nodes, edges and the totals row, whose
/// baseline (`b_*`, `reached_*`) comes from `baseline`, the unlocked request's totals.
pub(super) fn split(
    rows: &[LockedRow],
    baseline: ItemFlowTotalsRow,
    locks: usize,
) -> (Vec<ItemFlowNode>, Vec<ItemFlowEdge>, ItemFlowTotalsRow) {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut without = vec![(0, 0); locks];
    let mut path = None;
    for row in rows {
        // Totals rows carry a lock index, nodes and edges a column.
        let column = u8::try_from(row.a).ok();
        match (row.kind, column) {
            (0, _) if row.a == 0 => path = Some(row),
            (0, _) => {
                if let Some(slot) = row
                    .a
                    .checked_sub(1)
                    .and_then(|i| usize::try_from(i).ok())
                    .and_then(|i| without.get_mut(i))
                {
                    *slot = (row.wins, row.matches);
                }
            }
            (1, Some(column)) => nodes.push(ItemFlowNode {
                column,
                item_id: row.b,
                wins: row.wins,
                losses: row.matches.saturating_sub(row.wins),
                matches: row.matches,
                players: row.players,
                total_kills: row.total_kills,
                total_deaths: row.total_deaths,
                total_assists: row.total_assists,
                adjusted_win_rate: row.adjusted_win_rate,
                avg_net_worth_at_buy: row.avg_net_worth_at_buy,
            }),
            (2, Some(column)) => edges.push(ItemFlowEdge {
                from_column: column,
                from_item_id: row.b,
                to_item_id: row.c,
                wins: row.wins,
                losses: row.matches.saturating_sub(row.wins),
                matches: row.matches,
            }),
            _ => {}
        }
    }
    let empty_columns = vec![0; usize::from(TIME_PHASE_COLUMNS)];
    let (s_wins, s_matches) = path.map_or((0, 0), |p| (p.wins, p.matches));
    let totals = ItemFlowTotalsRow {
        s_wins,
        s_losses: s_matches.saturating_sub(s_wins),
        s_matches,
        s_players: path.map_or(0, |p| p.players),
        s_total_kills: path.map_or(0, |p| p.total_kills),
        s_total_deaths: path.map_or(0, |p| p.total_deaths),
        s_total_assists: path.map_or(0, |p| p.total_assists),
        s_avg_net_worth: path.map_or(0.0, |p| p.avg_net_worth),
        s_avg_duration_s: path.map_or(0.0, |p| p.avg_duration_s),
        summary_reached_per_column: path
            .map_or_else(|| empty_columns.clone(), |p| p.reached.clone()),
        summary_reached_wins_per_column: path.map_or(empty_columns, |p| p.reached_wins.clone()),
        // A game without lock `i` and with every other one, or with all of them.
        loo_wins: without
            .iter()
            .map(|(wins, _)| s_wins.saturating_add(*wins))
            .collect(),
        loo_matches: without
            .iter()
            .map(|(_, matches)| s_matches.saturating_add(*matches))
            .collect(),
        ..baseline
    };
    (nodes, edges, totals)
}

#[cfg(test)]
mod tests {
    use super::super::query_parts;
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    fn locked(locks: u32) -> ItemFlowStatsQuery {
        ItemFlowStatsQuery {
            game_mode: Some(GameMode::Normal),
            hero_ids: Some(vec![15]),
            min_unix_timestamp: Some(1_792_746_000),
            locked_item_ids: Some((1..=locks).collect()),
            locked_columns: Some((0..locks).map(|i| i % 4).collect()),
            ..Default::default()
        }
    }

    #[test]
    fn serves_three_or_more_hero_locks_in_normal_mode() {
        assert!(!applies(&locked(2)));
        assert!(applies(&locked(3)));
        assert!(applies(&locked(25)));
        assert!(!applies(&ItemFlowStatsQuery {
            hero_ids: None,
            ..locked(3)
        }));
        assert!(!applies(&ItemFlowStatsQuery {
            game_mode: Some(GameMode::StreetBrawl),
            ..locked(3)
        }));
    }

    #[test]
    fn locked_query_prefilters_all_but_one_lock() {
        let query = locked(4);
        let sql = build_locked_query(&query, &query_parts(&query));
        assert_valid_sql(&sql);
        assert!(
            sql.contains(
                "AND (has(items.item_id, 1) + has(items.item_id, 2) + has(items.item_id, 3) + has(items.item_id, 4)) >= 3\n"
            ),
            "{sql}"
        );
        assert_eq!(sql.matches("arrayExists(").count(), 4);
        assert!(!sql.contains("upgrades.item_id"));
    }

    #[test]
    fn split_adds_the_path_to_each_leave_one_out() {
        let row = |kind, a, b, c, wins, matches| LockedRow {
            kind,
            a,
            b,
            c,
            wins,
            matches,
            players: 1,
            total_kills: 0,
            total_deaths: 0,
            total_assists: 0,
            adjusted_win_rate: 0.5,
            avg_net_worth_at_buy: 0.0,
            avg_net_worth: 0.0,
            avg_duration_s: 0.0,
            reached: vec![1, 1, 1, 1],
            reached_wins: vec![1, 0, 0, 0],
        };
        let rows = [
            row(0, 0, 0, 0, 3, 5),
            row(0, 2, 0, 0, 1, 4),
            row(1, 3, 7, 0, 2, 20),
            row(2, 1, 7, 9, 10, 30),
        ];
        let baseline = ItemFlowTotalsRow {
            b_matches: 100,
            ..Default::default()
        };
        let (nodes, edges, totals) = split(&rows, baseline, 3);
        assert_eq!(totals.s_matches, 5);
        assert_eq!(totals.s_losses, 2);
        assert_eq!(totals.b_matches, 100);
        assert_eq!(totals.loo_wins, vec![3, 4, 3]);
        assert_eq!(totals.loo_matches, vec![5, 9, 5]);
        assert_eq!(totals.summary_reached_wins_per_column, vec![1, 0, 0, 0]);
        assert_eq!(nodes.len(), 1);
        assert_eq!(
            nodes.first().map(|n| (n.column, n.item_id, n.losses)),
            Some((3, 7, 18))
        );
        assert_eq!(
            edges.first().map(|e| (e.from_column, e.to_item_id)),
            Some((1, 9))
        );
    }
}
