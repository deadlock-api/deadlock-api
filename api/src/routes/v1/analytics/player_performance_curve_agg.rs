//! Pre-aggregated player performance curves for requests without player-level filters.
//!
//! A hero-less curve over a season reads every player row in the window (42.8M rows / ~62 GiB
//! for 67 days) and timed out at 20 s. `player_performance_curve_agg_v2` holds, per day, game
//! mode, match mode, badge, 5-minute duration bucket and time key, the exact integer
//! sum, sum of squares and count of every metric, so avg and std come out identical to the base
//! query (up to float rounding). Full days are read from it; the partial days at the edges of
//! the requested window are aggregated from `match_player` on the fly.
//!
//! The table is rebuilt day by day by [`crate::services::cohort_agg_refresh`].

use core::fmt::Write as _;

use super::common_filters::{MatchInfoFilters, is_non_empty, join_filters, rollup_badge_filters};
use super::player_performance_curve::{PlayerPerformanceCurveQuery, curve_metrics};
use super::power_up_buffs::PERMANENT_BUFF_TIMES;
use crate::routes::v1::matches::types::{GameMode, MatchMode};

pub(crate) const AGG_TABLE: &str = "default.player_performance_curve_agg_v2";
pub(crate) const AGG_STAGING: &str = "default.player_performance_curve_agg_v2_staging";
/// Days the refresh job keeps; older days are dropped from the table.
pub(crate) const AGG_HORIZON_DAYS: u32 = 180;

/// Width of a duration bucket. Duration filters that are multiples of it can be served.
const DURATION_BUCKET_S: u64 = 300;
const DAY_S: i64 = 86_400;
/// Marks a stats tick that is not one of the absolute-time sample points.
const NO_TIME: &str = "4294967295";

/// The absolute-time sample points: every 3 minutes up to 15, then every 5 minutes. Keep in
/// sync with the `resolution = 0` filter of the base query.
fn absolute_time_filter(t: &str) -> String {
    format!("{t} >= 180 AND (({t} <= 900 AND {t} % 180 = 0) OR ({t} > 900 AND {t} % 300 = 0))")
}

/// Percent of the match a stats tick falls into, 0-100. Bucketing it with
/// `intDiv(pct, resolution) * resolution` gives the base query's buckets.
fn percent_of_match(t: &str) -> String {
    format!("toUInt32(floor({t} / duration_s * 100))")
}

/// Per tick metric arrays and buff counts of one `match_player` row, plus `extra` columns.
fn tick_arrays(extra: &str) -> String {
    let mut arrays = String::new();
    for (name, column) in curve_metrics() {
        let _ = write!(arrays, ", {column} AS {name}_arr");
    }
    format!(
        "{extra}{arrays},
        {PERMANENT_BUFF_TIMES} AS buff_times, notEmpty(buff_times) AS has_buff_timings,
        arrayMap(ts -> toUInt32(arrayCount(t -> t <= ts, buff_times)), stats.time_stamp_s) AS permanent_buffs_arr"
    )
}

/// `ARRAY JOIN` list zipping the metric arrays into one row per tick.
fn tick_array_join() -> String {
    let mut join = String::new();
    for (name, _) in curve_metrics() {
        let _ = write!(join, ", {name}_arr AS {name}");
    }
    format!("{join}, permanent_buffs_arr AS permanent_buffs")
}

/// Sum, sum of squares and count aggregates, in the column order of the agg table.
fn sum_aggregates() -> String {
    let mut sums = String::from("count() AS n");
    for (name, _) in curve_metrics() {
        let _ = write!(
            sums,
            ",\n    sum(toUInt64({name})) AS {name}_sum, sum(toUInt64({name}) * {name}) AS {name}_sq"
        );
    }
    sums.push_str(
        ",\n    countIf(has_buff_timings) AS permanent_buffs_n,
    sumIf(toUInt64(permanent_buffs), has_buff_timings) AS permanent_buffs_sum,
    sumIf(toUInt64(permanent_buffs) * permanent_buffs, has_buff_timings) AS permanent_buffs_sq",
    );
    sums
}

/// The rows of the agg table for the matches selected by `since_clause`, in its column order.
/// Every tick appears twice: once under its absolute game time (only the sample points) and
/// once under its percent of the match (`relative`).
pub(crate) fn agg_select_body(since_clause: &str) -> String {
    let arrays = tick_arrays(", game_mode, match_mode, start_time, average_badge");
    let join = tick_array_join();
    let sums = sum_aggregates();
    let absolute = absolute_time_filter("t");
    let percent = percent_of_match("t");
    format!(
        "SELECT
    game_mode,
    match_mode,
    toDate(start_time) AS day,
    ifNull(average_badge, 0) AS least_badge,
    ifNull(average_badge, 65535) AS greatest_badge,
    toUInt16(intDiv(duration_s, {DURATION_BUCKET_S})) AS duration_bucket,
    duration_s % {DURATION_BUCKET_S} = 0 AS duration_on_edge,
    relative,
    game_time,
    {sums}
FROM (
    SELECT duration_s{arrays},
        arrayMap(t -> if({absolute}, t, {NO_TIME}), stats.time_stamp_s) AS absolute_times,
        arrayMap(t -> {percent}, stats.time_stamp_s) AS percent_times
    FROM default.match_player
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND {since_clause}
        AND duration_s > 0
)
ARRAY JOIN [false, true] AS relative
ARRAY JOIN if(relative, percent_times, absolute_times) AS game_time{join}
WHERE game_time != {NO_TIME}
GROUP BY game_mode, match_mode, day, least_badge, greatest_badge, duration_bucket, duration_on_edge, relative, game_time"
    )
}

/// How a request is split between the agg table and `match_player`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AggPlan {
    /// First full UTC day read from the agg table (unix seconds of its midnight).
    pub(super) first_day: i64,
    /// Midnight after the last full day read from the agg table.
    pub(super) end_day: i64,
    /// Partial-day windows `[from, to]` (inclusive) read from `match_player`.
    edges: Vec<(i64, i64)>,
}

impl AggPlan {
    /// Days the agg table must have been built for: every full day before today. Today's
    /// partition may still be missing right after midnight; it then simply lacks the newest
    /// matches, like any agg row between two refreshes.
    pub(super) fn required_days(&self, now: i64) -> (i64, i64) {
        (
            self.first_day,
            self.end_day.min(now - now.rem_euclid(DAY_S)),
        )
    }
}

/// Splits `query` into full days for the agg table and edge windows for `match_player`, or
/// `None` when the agg table cannot answer it: player-level or match id filters, match modes
/// outside Ranked/Unranked, duration filters off the bucket grid, a window older than the
/// horizon, or no full day in the window. Expects rounded timestamps.
pub(super) fn plan(query: &PlayerPerformanceCurveQuery, now: i64) -> Option<AggPlan> {
    let has_player_filters = is_non_empty(query.hero_ids.as_deref())
        || is_non_empty(query.account_ids.as_deref())
        || is_non_empty(query.include_item_ids.as_deref())
        || is_non_empty(query.exclude_item_ids.as_deref())
        || is_non_empty(query.ability_order_prefix.as_deref())
        || is_non_empty(query.ability_unlock_order_prefix.as_deref())
        || query.min_networth.is_some()
        || query.max_networth.is_some()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some();
    let on_grid = |d: Option<u64>| d.is_none_or(|d| d % DURATION_BUCKET_S == 0);
    if has_player_filters
        || !MatchMode::is_agg_servable(query.match_mode.as_deref())
        || !on_grid(query.min_duration_s)
        || !on_grid(query.max_duration_s)
    {
        return None;
    }
    let min = query.min_unix_timestamp.unwrap_or(0).max(0);
    let first_day = min + (DAY_S - min.rem_euclid(DAY_S)) % DAY_S;
    let today = now - now.rem_euclid(DAY_S);
    let horizon_start = today - (i64::from(AGG_HORIZON_DAYS) - 1) * DAY_S;
    // `start_time <= max` is inclusive: a day is full when its last second is in the window.
    let end_day = match query.max_unix_timestamp {
        Some(max) => (max + 1) - (max + 1).rem_euclid(DAY_S),
        None => today + DAY_S,
    };
    if first_day < horizon_start || end_day <= first_day {
        return None;
    }
    let mut edges = Vec::new();
    if min < first_day {
        edges.push((min, first_day - 1));
    }
    if let Some(max) = query.max_unix_timestamp
        && max >= end_day
    {
        edges.push((end_day, max));
    }
    Some(AggPlan {
        first_day,
        end_day,
        edges,
    })
}

/// The base query's badge and duration filters, rewritten for the agg table's columns.
fn agg_filters(query: &PlayerPerformanceCurveQuery) -> String {
    let mut filters = join_filters(&rollup_badge_filters(
        query.min_average_badge,
        query.max_average_badge,
    ));
    if let Some(min) = query.min_duration_s {
        let _ = write!(
            filters,
            " AND duration_bucket >= {}",
            min / DURATION_BUCKET_S
        );
    }
    if let Some(max) = query.max_duration_s {
        let bucket = max / DURATION_BUCKET_S;
        let _ = write!(
            filters,
            " AND (duration_bucket < {bucket} OR (duration_bucket = {bucket} AND duration_on_edge))"
        );
    }
    filters
}

/// Builds the curve from the agg table's full days plus `match_player` for the edge windows.
/// Same output columns as the base query.
pub(super) fn build_agg_query(query: &PlayerPerformanceCurveQuery, plan: &AggPlan) -> String {
    let resolution = query.resolution.unwrap_or(10);
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());

    let mut summed = String::from("sum(n) AS n");
    let mut output = String::new();
    for (name, _) in curve_metrics() {
        let _ = write!(
            summed,
            ", sum({name}_sum) AS {name}_sum, sum({name}_sq) AS {name}_sq"
        );
        let _ = write!(
            output,
            ",\n    {name}_sum / n AS {name}_avg,\n    \
             sqrt(greatest({name}_sq / n - pow({name}_sum / n, 2), 0)) AS {name}_std"
        );
    }
    summed.push_str(
        ", sum(permanent_buffs_n) AS permanent_buffs_n, \
         sum(permanent_buffs_sum) AS permanent_buffs_sum, sum(permanent_buffs_sq) AS permanent_buffs_sq",
    );

    let agg_time = if resolution == 0 {
        "game_time".to_string()
    } else {
        format!("intDiv(game_time, {resolution}) * {resolution}")
    };
    let relative = resolution != 0;
    let mut parts = vec![format!(
        "SELECT toUInt32({agg_time}) AS gt, {summed}
        FROM {AGG_TABLE}
        WHERE relative = {relative}
            AND day >= toDate({first_day}) AND day < toDate({end_day})
            AND {match_mode_filter}
            AND {game_mode_filter}{filters}
        GROUP BY gt",
        first_day = plan.first_day,
        end_day = plan.end_day,
        filters = agg_filters(query),
    )];

    let (edge_time, edge_filter) = if resolution == 0 {
        (
            "timestamp_s".to_string(),
            format!("WHERE {}", absolute_time_filter("timestamp_s")),
        )
    } else {
        (
            format!(
                "intDiv({}, {resolution}) * {resolution}",
                percent_of_match("timestamp_s")
            ),
            String::new(),
        )
    };
    let arrays = tick_arrays(", stats.time_stamp_s AS timestamp_s");
    let join = tick_array_join();
    let sums = sum_aggregates();
    for &(from, to) in &plan.edges {
        let info_filters = MatchInfoFilters {
            min_unix_timestamp: Some(from),
            max_unix_timestamp: Some(to),
            min_match_id: None,
            max_match_id: None,
            ..query.match_info()
        }
        .build();
        parts.push(format!(
            "SELECT toUInt32({edge_time}) AS gt, {sums}
        FROM (
            SELECT duration_s{arrays}
            FROM match_player
            WHERE {match_mode_filter}
                AND {game_mode_filter}
                AND duration_s > 0{info_filters}
        )
        ARRAY JOIN timestamp_s{join}
        {edge_filter}
        GROUP BY gt"
        ));
    }

    format!(
        "
    SELECT
    toUInt32(gt) AS game_time{output},
    if(permanent_buffs_n = 0, NULL, permanent_buffs_sum / permanent_buffs_n) AS permanent_buffs_avg,
    if(permanent_buffs_n = 0, NULL, sqrt(greatest(permanent_buffs_sq / permanent_buffs_n - pow(permanent_buffs_sum / permanent_buffs_n, 2), 0))) AS permanent_buffs_std
    FROM (
        SELECT gt, {summed}
        FROM (
        {parts}
        )
        GROUP BY gt
    )
    ORDER BY game_time
    SETTINGS log_comment = 'player_performance_curve_agg', apply_patch_parts = 0, optimize_use_projections = 0
    ",
        parts = parts.join("\n        UNION ALL\n        "),
    )
}

/// Days in `[from, to)` (unix midnights) the refresh job has built, from its state table.
pub(super) fn built_days_query(from: i64, to: i64) -> String {
    format!(
        "SELECT count() FROM {state} FINAL
        WHERE table_name = '{AGG_TABLE}' AND day >= toDate({from}) AND day < toDate({to})
        SETTINGS log_comment = 'player_performance_curve_agg_coverage'",
        state = crate::services::cohort_agg_refresh::STATE_TABLE,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    const NOW: i64 = 1_791_200_000; // 2026-10-05 11:33:20 UTC
    const TODAY: i64 = NOW - NOW % DAY_S;

    fn query(min: Option<i64>, max: Option<i64>) -> PlayerPerformanceCurveQuery {
        PlayerPerformanceCurveQuery {
            resolution: Some(0),
            min_unix_timestamp: min,
            max_unix_timestamp: max,
            ..Default::default()
        }
    }

    #[test]
    fn open_window_reads_full_days_and_the_partial_first_day() {
        // Season start 17:00 UTC, 67 days ago.
        let min = TODAY - 67 * DAY_S + 17 * 3600;
        let plan = plan(&query(Some(min), None), NOW).unwrap();
        assert_eq!(plan.first_day, TODAY - 66 * DAY_S);
        assert_eq!(plan.end_day, TODAY + DAY_S);
        assert_eq!(plan.edges, vec![(min, TODAY - 66 * DAY_S - 1)]);
        assert_eq!(plan.required_days(NOW), (TODAY - 66 * DAY_S, TODAY));
    }

    #[test]
    fn closed_window_reads_both_partial_days() {
        let min = TODAY - 10 * DAY_S + 3600;
        let max = TODAY - 2 * DAY_S + 5 * 3600;
        let plan = plan(&query(Some(min), Some(max)), NOW).unwrap();
        assert_eq!(plan.first_day, TODAY - 9 * DAY_S);
        assert_eq!(plan.end_day, TODAY - 2 * DAY_S);
        assert_eq!(
            plan.edges,
            vec![(min, TODAY - 9 * DAY_S - 1), (TODAY - 2 * DAY_S, max)]
        );
    }

    #[test]
    fn day_aligned_window_needs_no_edges() {
        // `round_timestamps` makes `max` an hour boundary; midnight - 1 s is the last second.
        let plan = plan(
            &query(Some(TODAY - 5 * DAY_S), Some(TODAY - DAY_S - 1)),
            NOW,
        )
        .unwrap();
        assert_eq!(plan.edges, vec![]);
        assert_eq!(plan.end_day, TODAY - DAY_S);
    }

    #[test]
    fn unservable_requests_use_the_base_table() {
        // Today counts as a full day of an open window; the hour before it is an edge.
        assert_eq!(
            plan(&query(Some(TODAY - 3600), None), NOW).map(|p| p.edges.len()),
            Some(1)
        );
        // Less than a full day.
        assert!(plan(&query(Some(TODAY + 3600), None), NOW).is_none());
        // Older than the horizon.
        assert!(plan(&query(Some(0), None), NOW).is_none());
        let mut q = query(Some(TODAY - 5 * DAY_S), None);
        q.hero_ids = Some(vec![7]);
        assert!(plan(&q, NOW).is_none());
        let mut q = query(Some(TODAY - 5 * DAY_S), None);
        q.max_duration_s = Some(2000);
        assert!(plan(&q, NOW).is_none());
        let mut q = query(Some(TODAY - 5 * DAY_S), None);
        q.match_mode = Some(vec![MatchMode::PrivateLobby]);
        assert!(plan(&q, NOW).is_none());
    }

    #[test]
    fn agg_sql_is_valid() {
        assert_valid_sql(&agg_select_body("start_time >= now() - INTERVAL 1 DAY"));
        for resolution in [0, 5] {
            let mut q = query(Some(TODAY - 10 * DAY_S + 3600), Some(TODAY - DAY_S + 3600));
            q.resolution = Some(resolution);
            q.min_average_badge = Some(50);
            q.max_duration_s = Some(2400);
            let plan = plan(&q, NOW).unwrap();
            assert_valid_sql(&build_agg_query(&q, &plan));
        }
        assert_valid_sql(&built_days_query(TODAY - DAY_S, TODAY));
    }
}
