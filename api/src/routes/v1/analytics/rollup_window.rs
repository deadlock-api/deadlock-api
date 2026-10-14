//! Splits a request window between a day-grained rollup and its base table.
//!
//! A rollup grained on `day` can only answer whole UTC days. Rounding a mid-day bound to whole
//! days counts matches outside the window (patches ship mid-day, so a patch range would count the
//! previous patch), so the whole days are read from the rollup and the partial days at either end
//! are aggregated from the base table into rows of the rollup's shape. Every rollup row is a sum or
//! a mergeable state, so the caller's outer aggregation runs unchanged over both.
//!
//! A [`Coverage::Incremental`] rollup may lack days, and lags behind ingestion on the days it has.
//! Its reads fill both gaps from the base table as well, so they count exactly what the base table
//! holds (see [`Rollup::source`]).

use super::common_filters::{range_filters, rollup_badge_base_filters, rollup_badge_filters};
use crate::routes::v1::matches::types::{GameMode, MatchMode};

pub(super) const DAY_S: i64 = 86_400;

/// How an inclusive `[min, max]` window splits into whole days and partial-day edges.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct DaySplit {
    /// First whole UTC day (unix seconds of its midnight).
    pub(super) first_day: i64,
    /// Midnight after the last whole day, `None` for a window without an upper bound.
    pub(super) end_day: Option<i64>,
    /// Partial-day windows `[from, to]` (inclusive), read from the base table.
    pub(super) edges: Vec<(i64, i64)>,
}

impl DaySplit {
    /// Splits the inclusive `[min, max]` window, or `None` when it holds no whole day. A missing
    /// `min` means the start of the data.
    pub(super) fn new(min: Option<i64>, max: Option<i64>) -> Option<Self> {
        let min = min.unwrap_or(0).max(0);
        let first_day =
            (min.div_euclid(DAY_S) + i64::from(min.rem_euclid(DAY_S) != 0)).saturating_mul(DAY_S);
        // `start_time <= max` is inclusive: a day is whole when its last second is in the window.
        let end_day = max.map(|max| {
            max.saturating_add(1)
                .div_euclid(DAY_S)
                .saturating_mul(DAY_S)
        });
        if end_day.is_some_and(|end_day| end_day <= first_day) {
            return None;
        }
        let mut edges = Vec::new();
        if min < first_day {
            edges.push((min, first_day - 1));
        }
        if let (Some(max), Some(end_day)) = (max, end_day)
            && max >= end_day
        {
            edges.push((end_day, max));
        }
        Some(Self {
            first_day,
            end_day,
            edges,
        })
    }

    /// Filters on a rollup's `day` column selecting exactly the whole days.
    pub(super) fn day_filters(&self) -> Vec<String> {
        let mut filters = vec![format!("day >= toDate({})", self.first_day)];
        if let Some(end_day) = self.end_day {
            filters.push(format!("day < toDate({end_day})"));
        }
        filters
    }
}

/// The filters of a rollup request, on the rollup's grain columns and pushed down onto
/// `match_player` for the rows of the window's partial days (see [`Rollup::source`]).
pub(super) struct RollupFilters {
    pub(super) rollup: Vec<String>,
    pub(super) base: Vec<String>,
}

impl RollupFilters {
    /// The game mode, match mode and badge filters, the ones every rollup grain has.
    pub(super) fn new(
        game_mode: Option<GameMode>,
        match_mode: Option<&[MatchMode]>,
        min_average_badge: Option<u8>,
        max_average_badge: Option<u8>,
    ) -> Self {
        let mut rollup = vec![GameMode::sql_filter(game_mode)];
        rollup.extend(MatchMode::agg_sql_filter(match_mode));
        let mut base = rollup.clone();
        rollup.extend(rollup_badge_filters(min_average_badge, max_average_badge));
        base.extend(rollup_badge_base_filters(
            min_average_badge,
            max_average_badge,
        ));
        Self { rollup, base }
    }
}

/// Which days of a window a [`Rollup`] holds, and how completely.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Coverage {
    /// Every day, as of the table's last refresh (views recomputed as a whole). Reads serve
    /// the rollup's rows as they are.
    Complete,
    /// Day partitions built one at a time by `services/cohort_agg_refresh.rs`. Each holds the
    /// matches ingested up to its [`BUILT_THROUGH`] time, and the table keeps only the last
    /// `horizon_days` days. Reads take every day the table lacks, and every match ingested after
    /// its day was built, from the base table.
    Incremental { horizon_days: u32 },
}

/// How far before an incremental rollup's built days a window it serves may start. Those days
/// are read from the base table by [`Rollup::source`]'s rows, which only the caller can weigh
/// against its own base-table query.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Reach {
    /// Any window, from the start of the data: the caller's base-table query reads at least the
    /// rows the rollup's base-table scans do, so every built day the rollup serves saves work.
    Unlimited,
    /// Windows starting at most this many whole days before the first built day: the caller's
    /// base-table query has a cheaper access path (e.g. a projection) over long spans.
    Days(i64),
}

/// Column of a [`Coverage::Incremental`] rollup: the newest `match_player.created_at` its day
/// partition includes, the same in every row of the partition, which the refresh job replaces
/// as a whole. 0 marks a day built before the column existed, which reads treat as missing.
pub(crate) const BUILT_THROUGH: &str = "built_through";

/// A day-grained rollup table: its grain (group-by) columns, each with the `match_player`
/// expression it is computed from, and its measures, sums or mergeable aggregate states.
pub(super) struct Rollup<'a> {
    pub(super) table: &'a str,
    /// `(column, match_player expression)` pairs.
    pub(super) grain: &'a [(&'a str, &'a str)],
    pub(super) measures: &'a str,
    pub(super) coverage: Coverage,
}

/// What the base-table rows of a window's partial days, and of what an incremental rollup lacks,
/// are built from (see [`Rollup::source`]).
pub(super) struct EdgeRows {
    /// Selects the base-table matches to aggregate, with the pushed-down filters.
    pub(super) where_clause: String,
    /// `expr AS column, ` for each grain column the query needs.
    pub(super) grain_select: String,
    /// Those grain columns, comma separated.
    pub(super) group_by: String,
}

impl Rollup<'_> {
    /// Whether the rollup should serve a window starting at `min_unix_timestamp` (`None`: the
    /// start of the data) rather than the caller's base-table query, given how far before its
    /// built days the caller lets it `reach`.
    pub(super) fn serves(&self, min_unix_timestamp: Option<i64>, reach: Reach) -> bool {
        match (self.coverage, reach) {
            (Coverage::Complete, _) | (Coverage::Incremental { .. }, Reach::Unlimited) => true,
            (Coverage::Incremental { horizon_days }, Reach::Days(days)) => {
                let Ok(now) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
                else {
                    return false;
                };
                let today = now.as_secs().cast_signed().div_euclid(DAY_S) * DAY_S;
                let first_built = today - (i64::from(horizon_days) - 1) * DAY_S;
                min_unix_timestamp.is_some_and(|min| min >= first_built - days * DAY_S)
            }
        }
    }

    /// A parenthesized `FROM` source over the window of `split`: the rollup's whole days,
    /// `UNION ALL` base-table rows built by `edge`, each `SELECT` of them reading the base table
    /// once.
    ///
    /// The base-table rows cover the partial days. For a [`Coverage::Incremental`] rollup they
    /// also cover the whole days it lacks, in one scan, and the matches ingested after their day
    /// was built, in another: the two filter on different skip indexes (`start_time`,
    /// `created_at`), and one `OR`ed scan could prune with neither. The rollup's state is read
    /// in the same query, so a day it rebuilds in between is never counted twice.
    ///
    /// It yields the measures and only the grain columns that `filters` or `outer` (the
    /// expressions of the query reading the source, e.g. its bucket) reference. `edge` must return
    /// a base-table `SELECT` with the measures and at least those grain columns, and should group
    /// by them alone ([`EdgeRows::grain_select`], [`EdgeRows::group_by`]): the base-table rows
    /// then build as few aggregate states as the result needs.
    ///
    /// `filters.rollup` must only reference grain columns. They apply to the rollup rows and the
    /// base-table rows alike, so they hold without `filters.base`, which is only pushed into the
    /// base-table scans to read less.
    pub(super) fn source(
        &self,
        split: &DaySplit,
        filters: &RollupFilters,
        outer: &str,
        edge: impl Fn(&EdgeRows) -> String,
    ) -> String {
        let RollupFilters {
            rollup: filters,
            base: base_filters,
        } = filters;
        let grain = self
            .grain
            .iter()
            .filter(|(col, _)| filters.iter().any(|f| references(f, col)) || references(outer, col))
            .collect::<Vec<_>>();
        let columns = grain
            .iter()
            .map(|(col, _)| *col)
            .chain([self.measures])
            .collect::<Vec<_>>()
            .join(", ");
        let table = self.table;
        let mut rollup_filters = filters.clone();
        rollup_filters.extend(split.day_filters());
        if matches!(self.coverage, Coverage::Incremental { .. }) {
            rollup_filters.push(format!("{BUILT_THROUGH} > 0"));
        }
        let mut parts = vec![format!(
            "SELECT {columns} FROM {table} WHERE {}",
            rollup_filters.join(" AND ")
        )];
        let filters = filters.join(" AND ");
        let edge_where = if filters.is_empty() {
            String::new()
        } else {
            format!(" WHERE {filters}")
        };
        let edge_rows = |windows: &str| {
            let where_clause = [format!("({windows})")]
                .into_iter()
                .chain(base_filters.iter().cloned())
                .collect::<Vec<_>>()
                .join(" AND ");
            let rows = edge(&EdgeRows {
                where_clause,
                grain_select: grain
                    .iter()
                    .map(|(col, expr)| format!("{expr} AS {col}, "))
                    .collect::<Vec<_>>()
                    .concat(),
                group_by: grain
                    .iter()
                    .map(|(col, _)| *col)
                    .collect::<Vec<_>>()
                    .join(", "),
            });
            format!("SELECT {columns} FROM (\n{rows}\n){edge_where}")
        };
        let mut windows = split
            .edges
            .iter()
            .map(|&(from, to)| {
                format!(
                    "({})",
                    range_filters("start_time", Some(from), Some(to)).join(" AND ")
                )
            })
            .collect::<Vec<_>>();
        match self.coverage {
            Coverage::Complete => {}
            Coverage::Incremental { .. } => {
                let built = BuiltDays::new(table, split);
                windows.extend(built.missing_windows(split));
                parts.push(edge_rows(&built.unbuilt_rows()));
            }
        }
        if !windows.is_empty() {
            parts.push(edge_rows(&windows.join(" OR ")));
        }
        format!("(\n{}\n)", parts.join("\nUNION ALL\n"))
    }
}

/// Scalar subqueries over the days an incremental rollup has built within a window, from which
/// the base-table scans of [`Rollup::source`] select what the rollup lacks. The built days are
/// expected to be one contiguous run, `[start, end)`: the refresh job builds every day of its
/// horizon. Days missing inside the run are still read correctly, just without index pruning.
struct BuiltDays {
    /// Midnight of the first built day, or of the window's first day when none is built.
    start: String,
    /// Midnight after the last built day, or of the window's first day when none is built.
    end: String,
    /// `Map(Date, DateTime)` of each built day to its [`BUILT_THROUGH`] time. Missing days read
    /// as 0, so all of their rows count as unbuilt.
    built_through: String,
    /// The oldest [`BUILT_THROUGH`] time if every day of `[start, end)` is built, else 0. A
    /// constant lower bound on `created_at`, so the `idx_created_at` minmax index prunes the
    /// built days' scan.
    oldest_built_through: String,
}

impl BuiltDays {
    fn new(table: &str, split: &DaySplit) -> Self {
        let days = format!(
            "SELECT day, max({BUILT_THROUGH}) AS built_through FROM {table} WHERE {} GROUP BY day HAVING built_through > 0",
            split.day_filters().join(" AND ")
        );
        let first_day = split.first_day;
        let scalar = |expr: &str| format!("(SELECT {expr} FROM ({days}))");
        Self {
            start: scalar(&format!(
                "toDateTime(ifNull(minOrNull(day), toDate({first_day})))"
            )),
            end: scalar(&format!(
                "toDateTime(ifNull(maxOrNull(day) + 1, toDate({first_day})))"
            )),
            built_through: scalar(
                "CAST((groupArray(day), groupArray(built_through)), 'Map(Date, DateTime)')",
            ),
            oldest_built_through: scalar(
                "if(count() = dateDiff('day', min(day), max(day)) + 1, min(built_through), toDateTime(0))",
            ),
        }
    }

    /// The window's whole days before and after the built run.
    fn missing_windows(&self, split: &DaySplit) -> [String; 2] {
        let Self { start, end, .. } = self;
        let before = format!(
            "(start_time >= {} AND start_time < {start})",
            split.first_day
        );
        let after = match split.end_day {
            Some(end_day) => format!("(start_time >= {end} AND start_time < {end_day})"),
            None => format!("(start_time >= {end})"),
        };
        [before, after]
    }

    /// The matches of the built run ingested after their day was built.
    fn unbuilt_rows(&self) -> String {
        let Self {
            start,
            end,
            built_through,
            oldest_built_through,
        } = self;
        format!(
            "start_time >= {start} AND start_time < {end} AND created_at > {oldest_built_through} \
             AND created_at > {built_through}[toDate(start_time)]"
        )
    }
}

/// Whether `sql` mentions the identifier `column` (not as part of a longer identifier).
fn references(sql: &str, column: &str) -> bool {
    let is_ident = |c: char| c.is_ascii_alphanumeric() || c == '_';
    sql.match_indices(column).any(|(i, _)| {
        !sql[..i].ends_with(is_ident) && !sql[i + column.len()..].starts_with(is_ident)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    const DAY: i64 = 1_791_158_400; // 2026-10-05 00:00:00 UTC
    const H: i64 = 3600;

    #[test]
    fn mid_day_bounds_become_edges() {
        let split = DaySplit::new(Some(DAY + 14 * H), Some(DAY + 3 * DAY_S + 14 * H)).unwrap();
        assert_eq!(split.first_day, DAY + DAY_S);
        assert_eq!(split.end_day, Some(DAY + 3 * DAY_S));
        assert_eq!(
            split.edges,
            vec![
                (DAY + 14 * H, DAY + DAY_S - 1),
                (DAY + 3 * DAY_S, DAY + 3 * DAY_S + 14 * H)
            ]
        );
    }

    #[test]
    fn day_aligned_window_has_no_edges() {
        let split = DaySplit::new(Some(DAY), Some(DAY + 3 * DAY_S - 1)).unwrap();
        assert_eq!(split.first_day, DAY);
        assert_eq!(split.end_day, Some(DAY + 3 * DAY_S));
        assert_eq!(split.edges, vec![]);
    }

    #[test]
    fn max_at_midnight_reads_one_second_of_the_next_day() {
        let split = DaySplit::new(Some(DAY), Some(DAY + 3 * DAY_S)).unwrap();
        assert_eq!(split.end_day, Some(DAY + 3 * DAY_S));
        assert_eq!(split.edges, vec![(DAY + 3 * DAY_S, DAY + 3 * DAY_S)]);
    }

    #[test]
    fn open_window_reads_every_day_after_the_first() {
        let split = DaySplit::new(Some(DAY + H), None).unwrap();
        assert_eq!(split.first_day, DAY + DAY_S);
        assert_eq!(split.end_day, None);
        assert_eq!(split.edges, vec![(DAY + H, DAY + DAY_S - 1)]);
        assert_eq!(
            split.day_filters(),
            vec![format!("day >= toDate({})", DAY + DAY_S)]
        );

        let all_time = DaySplit::new(Some(0), None).unwrap();
        assert_eq!((all_time.first_day, all_time.edges), (0, vec![]));
        assert_eq!(DaySplit::new(None, None).unwrap().first_day, 0);
        assert_eq!(DaySplit::new(Some(-5 * DAY_S), None).unwrap().first_day, 0);
    }

    #[test]
    fn window_without_a_whole_day_is_not_split() {
        assert!(DaySplit::new(Some(DAY + H), Some(DAY + 23 * H)).is_none());
        // Spans midnight but neither day is whole.
        assert!(DaySplit::new(Some(DAY + 12 * H), Some(DAY + DAY_S + 12 * H)).is_none());
        assert!(DaySplit::new(Some(DAY), Some(DAY - 1)).is_none());
        assert!(DaySplit::new(Some(DAY), Some(i64::MIN)).is_none());
    }

    #[test]
    fn extreme_bounds_do_not_overflow() {
        let split = DaySplit::new(Some(i64::MAX - DAY_S * 3), Some(i64::MAX));
        if let Some(split) = split {
            assert!(split.edges.iter().all(|&(from, to)| from <= to));
        }
        let split = DaySplit::new(Some(DAY), Some(i64::MAX)).unwrap();
        assert_eq!(split.edges.last().map(|e| e.1), Some(i64::MAX));
    }

    #[test]
    fn source_unions_whole_days_and_one_scan_of_the_edges() {
        let rollup = Rollup {
            table: "t_agg",
            grain: &[
                ("game_mode", "game_mode"),
                ("day", "toDate(start_time)"),
                ("hero_id", "hero_id"),
                ("least_badge", "ifNull(average_badge, 0)"),
            ],
            measures: "n",
            coverage: Coverage::Complete,
        };
        let split = DaySplit::new(Some(DAY + 14 * H), Some(DAY + 3 * DAY_S + 14 * H)).unwrap();
        let filters = RollupFilters {
            rollup: vec!["game_mode = 1".to_owned()],
            base: vec!["game_mode = 1".to_owned()],
        };
        let source = rollup.source(&split, &filters, "toStartOfDay(toDateTime(day))", |edge| {
            assert_eq!(
                edge.grain_select,
                "game_mode AS game_mode, toDate(start_time) AS day, "
            );
            assert_eq!(edge.group_by, "game_mode, day");
            format!(
                "SELECT {}count() AS n FROM match_player WHERE {} GROUP BY {}",
                edge.grain_select, edge.where_clause, edge.group_by
            )
        });
        assert!(source.contains(&format!(
            "SELECT game_mode, day, n FROM t_agg WHERE game_mode = 1 AND day >= toDate({}) AND day < toDate({})",
            DAY + DAY_S,
            DAY + 3 * DAY_S
        )));
        assert!(source.contains(&format!(
            "WHERE ((start_time >= {} AND start_time <= {}) OR (start_time >= {} AND start_time <= {})) AND game_mode = 1",
            DAY + 14 * H,
            DAY + DAY_S - 1,
            DAY + 3 * DAY_S,
            DAY + 3 * DAY_S + 14 * H
        )));
        assert_eq!(source.matches("UNION ALL").count(), 1);
        assert!(source.contains(") WHERE game_mode = 1"));
        assert_valid_sql(&format!("SELECT sum(n) FROM {source}"));

        let aligned = DaySplit::new(Some(DAY), Some(DAY + DAY_S - 1)).unwrap();
        let no_filters = RollupFilters {
            rollup: vec![],
            base: vec![],
        };
        let source = rollup.source(&aligned, &no_filters, "toUInt32(0)", |_| unreachable!());
        assert!(!source.contains("UNION ALL"));
        assert!(source.contains("SELECT n FROM t_agg WHERE day >= "));
        assert_valid_sql(&format!("SELECT sum(n) FROM {source}"));
    }

    #[test]
    fn incremental_source_fills_what_the_rollup_lacks_from_the_base_table() {
        let rollup = Rollup {
            table: "t_agg",
            grain: &[("game_mode", "game_mode"), ("day", "toDate(start_time)")],
            measures: "n",
            coverage: Coverage::Incremental { horizon_days: 120 },
        };
        let filters = RollupFilters {
            rollup: vec!["game_mode = 1".to_owned()],
            base: vec!["game_mode = 1".to_owned()],
        };
        let edge = |edge: &EdgeRows| {
            format!(
                "SELECT {}count() AS n FROM match_player WHERE {} GROUP BY {}",
                edge.grain_select, edge.where_clause, edge.group_by
            )
        };
        let split = DaySplit::new(Some(DAY + 14 * H), Some(DAY + 3 * DAY_S + 14 * H)).unwrap();
        let source = rollup.source(&split, &filters, "toUInt32(0)", edge);
        // The built days, the matches ingested after their day was built, and one scan of the
        // partial days with the days the rollup lacks.
        assert_eq!(source.matches("UNION ALL").count(), 2);
        assert!(source.contains(&format!(
            "FROM t_agg WHERE game_mode = 1 AND day >= toDate({}) AND day < toDate({}) AND built_through > 0",
            DAY + DAY_S,
            DAY + 3 * DAY_S
        )));
        assert!(source.contains(&format!(
            "(start_time >= {} AND start_time <= {}) OR (start_time >= {} AND start_time <= {}) OR (start_time >= {} AND start_time < (SELECT toDateTime(ifNull(minOrNull(day), toDate({}))) FROM (SELECT day, max(built_through) AS built_through FROM t_agg WHERE day >= toDate({}) AND day < toDate({}) GROUP BY day HAVING built_through > 0)))",
            DAY + 14 * H,
            DAY + DAY_S - 1,
            DAY + 3 * DAY_S,
            DAY + 3 * DAY_S + 14 * H,
            DAY + DAY_S,
            DAY + DAY_S,
            DAY + DAY_S,
            DAY + 3 * DAY_S
        )));
        assert!(source.contains("AND start_time < "));
        assert!(source.contains("AND created_at > (SELECT if(count() = dateDiff('day', min(day), max(day)) + 1, min(built_through), toDateTime(0))"));
        assert!(source.contains("[toDate(start_time)]) AND game_mode = 1"));
        assert_valid_sql(&format!("SELECT sum(n) FROM {source}"));

        // Without an upper bound, everything after the built run is read from the base table.
        let open = DaySplit::new(Some(DAY), None).unwrap();
        let source = rollup.source(&open, &filters, "toUInt32(0)", edge);
        assert!(
            source.contains(
                "OR (start_time >= (SELECT toDateTime(ifNull(maxOrNull(day) + 1, toDate("
            )
        );
        assert_valid_sql(&format!("SELECT sum(n) FROM {source}"));
    }

    #[test]
    fn incremental_rollups_serve_windows_within_the_callers_reach() {
        let rollup = |coverage| Rollup {
            table: "t_agg",
            grain: &[],
            measures: "n",
            coverage,
        };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .cast_signed();
        let first_built = now - now.rem_euclid(DAY_S) - 119 * DAY_S;
        let reach = first_built - 10 * DAY_S;

        let incremental = rollup(Coverage::Incremental { horizon_days: 120 });
        assert!(incremental.serves(Some(now - DAY_S), Reach::Days(0)));
        assert!(incremental.serves(Some(first_built), Reach::Days(0)));
        assert!(!incremental.serves(Some(first_built - 1), Reach::Days(0)));
        assert!(incremental.serves(Some(reach), Reach::Days(10)));
        assert!(!incremental.serves(Some(reach - 1), Reach::Days(10)));
        assert!(!incremental.serves(None, Reach::Days(10)));
        assert!(incremental.serves(None, Reach::Unlimited));
        assert!(incremental.serves(Some(0), Reach::Unlimited));

        let complete = rollup(Coverage::Complete);
        assert!(complete.serves(None, Reach::Days(0)));
    }

    #[test]
    fn references_matches_whole_identifiers() {
        assert!(references("hero_id IN (1)", "hero_id"));
        assert!(!references("enemy_hero_id = 1", "hero_id"));
        assert!(references("toStartOfDay(toDateTime(day))", "day"));
        assert!(!references("toStartOfDay(start_time)", "day"));
        assert!(references(
            "if(greatest_badge = 65535, 0, greatest_badge)",
            "greatest_badge"
        ));
    }
}
