use core::fmt::Write as _;
use std::collections::HashMap;
use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use itertools::{Itertools, izip};
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    LaneDuoFilterSql, LaneDuoFilters, default_min_matches_u64, filter_protected_accounts,
    join_filters, range_filters, round_timestamps,
};
use super::lane_common::{
    LaneGroupBy, LaneGrouping, LaneScanFilters, LaneStat, LaneStats, LaneTableFilters,
    SAMPLE_GRID_FILTER, matches_having_clause, stat_array,
};
use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};
use crate::utils::sql::{cached_ch_query, impl_match_info};

/// First sample `match_player.stats` records.
const FIRST_SAMPLE_S: u32 = 180;

/// `t` and `sample_matchups` lead every sample tuple; each stat then contributes four aggregates.
const CURVE_TUPLE_LEADING: usize = 2;

/// The team flag and sample times lead every player tuple; each stat then contributes its samples.
const PLAYER_TUPLE_LEADING: usize = 2;

#[expect(clippy::unnecessary_wraps)]
fn default_min_time_s() -> Option<u32> {
    Some(FIRST_SAMPLE_S)
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct LaneSoulCurveQuery {
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(
        default = "GameMode::default_option",
        deserialize_with = "GameMode::deserialize_option"
    )]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on the match mode. Valid values: `unranked`, `private_lobby`, `coop_bot`, `ranked`, `server_test`, `tutorial`, `hero_labs`. **Default:** `ranked,unranked`.
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<crate::routes::v1::matches::types::MatchMode>(), 0..=4))"
        )
    )]
    match_mode: Option<Vec<MatchMode>>,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    min_unix_timestamp: Option<i64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<i64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// Earliest sample to return, in seconds into the match. **Default:** 180.
    #[serde(default = "default_min_time_s")]
    #[param(default = 180)]
    min_time_s: Option<u32>,
    /// Latest sample to return, in seconds into the match. Omit to follow every matchup to the end
    /// of its match.
    max_time_s: Option<u32>,
    /// Comma separated list of `assigned_lane` values to restrict the response to. See the `lane_info` array of <https://api.deadlock-api.com/v1/assets/generic-data>.
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    assigned_lanes: Option<Vec<u32>>,
    /// Comma separated list of hero ids the *ally* duo has to be drawn from, or a single hero id the *ally* duo has to include. Omit to return every duo. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Comma separated list of hero ids the *enemy* duo has to be drawn from, or a single hero id the *enemy* duo has to include. Omit to return every duo. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    enemy_hero_ids: Option<Vec<u32>>,
    /// Comma separated list of extra per-tick stats to return curves for, at most 8. **Default:** none.
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<super::lane_common::LaneStat>(), 0..=4))"
        )
    )]
    stats: Option<Vec<LaneStat>>,
    /// Comma separated list of dimensions to group by. Valid values: `assigned_lane`, `hero_ids`, `enemy_hero_ids`. **Default:** all three.
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<super::lane_common::LaneGroupBy>(), 0..=3))"
        )
    )]
    group_by: Option<Vec<LaneGroupBy>>,
    /// The minimum number of lane matchups behind a row for it to be included in the response.
    #[serde(default = "default_min_matches_u64")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u64>,
    /// The maximum number of lane matchups behind a row for it to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u64>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
}

impl_match_info!(LaneSoulCurveQuery);

/// One requested stat's curve. All four arrays line up with `sample_times_s`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LaneStatCurve {
    /// Mean of the duo's combined value, summed over its two players.
    pub value: Vec<f64>,
    /// Population standard deviation of `value` across the counted matchups.
    pub value_std: Vec<f64>,
    /// Mean of the duo's combined value minus the enemy duo's. Negative means behind.
    pub diff: Vec<f64>,
    /// Population standard deviation of `diff` across the counted matchups.
    pub diff_std: Vec<f64>,
}

/// **⚠️ Subject to change:** newly added, fields may change or be removed without notice.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LaneSoulCurve {
    /// The lane the matchup was played in, or `0` when `assigned_lane` was grouped away. See the `lane_info` array of <https://api.deadlock-api.com/v1/assets/generic-data>.
    pub assigned_lane: u32,
    /// The ascending hero id pair that shared the lane, or empty when grouped away. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_ids: Vec<u32>,
    /// The ascending hero id pair they laned against, or empty when grouped away.
    pub enemy_hero_ids: Vec<u32>,
    /// Seconds into the match each entry of the curves was sampled at, ascending.
    pub sample_times_s: Vec<u32>,
    /// How many lane matchups were still running at the matching entry of `sample_times_s`.
    /// Falls off towards the end of the curve as shorter matches drop out.
    pub sample_matches: Vec<u64>,
    /// Lane matchups behind the row, counted at its *first* sample. This is what `min_matches` and
    /// `max_matches` filter on, so it does not move when the requested time range changes; read
    /// `sample_matches` for what any individual point rests on.
    pub matches_played: u64,
    /// Mean souls the duo is ahead by at the matching entry of `sample_times_s`. Negative means
    /// behind. Same length as `sample_times_s`.
    pub net_worth_diff: Vec<f64>,
    /// Population standard deviation of the lead across the counted matchups, at the matching entry
    /// of `sample_times_s`. Same length as `sample_times_s`.
    ///
    /// Spread between individual games, not uncertainty about the mean: it stays wide however many
    /// matchups are counted, because lane outcomes genuinely differ that much.
    pub net_worth_diff_std: Vec<f64>,
    /// A curve per stat named in `stats`. Empty unless the parameter was set.
    pub stats: HashMap<LaneStat, LaneStatCurve>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize)]
struct LaneSoulCurveRow {
    assigned_lane: u32,
    hero_ids: Vec<u32>,
    enemy_hero_ids: Vec<u32>,
    sample_times_s: Vec<u32>,
    sample_matches: Vec<u64>,
    matches_played: u64,
    net_worth_diff: Vec<f64>,
    net_worth_diff_std: Vec<f64>,
    stat_values: Vec<Vec<f64>>,
    stat_values_std: Vec<Vec<f64>>,
    stat_diffs: Vec<Vec<f64>>,
    stat_diffs_std: Vec<Vec<f64>>,
}

/// 1-based position of `stat`'s `slot`-th aggregate in a [`sample_tuple`].
fn tuple_index(stats: &LaneStats, stat: LaneStat, slot: usize) -> usize {
    let stat_pos = stats
        .computed
        .iter()
        .position(|s| *s == stat)
        .unwrap_or_default();
    CURVE_TUPLE_LEADING + 1 + 4 * stat_pos + slot
}

fn curve_columns(stats: &LaneStats, slot: usize) -> String {
    stat_array(stats, "Array(Array(Float64))", |stat| {
        format!("arrayMap(x -> x.{}, curve)", tuple_index(stats, stat, slot))
    })
}

/// One player's on-grid samples: `(is_team0, times, <one array per stat>)`.
fn player_tuple(stats: &LaneStats) -> String {
    stats.computed.iter().fold(
        "team = 'Team0', arrayFilter((v, k) -> k, stats.time_stamp_s, on_grid)".to_string(),
        |mut acc, stat| {
            let _ = write!(acc, ", arrayFilter((v, k) -> k, stats.{stat}, on_grid)");
            acc
        },
    )
}

/// Each side's total of every stat at sample `t`, one player-sample row at a time.
fn side_totals(stats: &LaneStats) -> String {
    stats.computed.iter().fold(String::new(), |mut acc, stat| {
        let _ = write!(
            acc,
            ",\n        toFloat64(sumIf({stat}_sample, p.1)) AS {stat}_t0,\n        toFloat64(sumIf({stat}_sample, NOT p.1)) AS {stat}_t1"
        );
        acc
    })
}

/// Unrolls a player tuple's sample arrays alongside its times.
fn sample_array_join(stats: &LaneStats) -> String {
    stats
        .computed
        .iter()
        .enumerate()
        .fold(String::new(), |mut acc, (i, stat)| {
            let _ = write!(acc, ", p.{} AS {stat}_sample", PLAYER_TUPLE_LEADING + 1 + i);
            acc
        })
}

fn sample_aggregates(stats: &LaneStats) -> String {
    stats.computed.iter().fold(String::new(), |mut acc, stat| {
        let _ = write!(
            acc,
            ",\n        round(avg(x_{stat}_value), 1) AS x_{stat}_value_avg,\n        round(stddevPop(x_{stat}_value), 1) AS x_{stat}_value_std,\n        round(avg(x_{stat}_diff), 1) AS x_{stat}_diff_avg,\n        round(stddevPop(x_{stat}_diff), 1) AS x_{stat}_diff_std"
        );
        acc
    })
}

fn sample_tuple(stats: &LaneStats) -> String {
    stats
        .computed
        .iter()
        .fold("t, sample_matchups".to_string(), |mut acc, stat| {
            let _ = write!(
                acc,
                ", x_{stat}_value_avg, x_{stat}_value_std, x_{stat}_diff_avg, x_{stat}_diff_std"
            );
            acc
        })
}

/// Drops matches that cannot clear `min_matches` before the per-sample pass runs. Only a few
/// thousand of the million-odd duo pairings are played often enough to qualify, so this is where
/// most of the work goes away. Counting lanes rather than samples over-approximates, so it can only
/// keep rows the final `HAVING` would keep anyway.
#[derive(Default)]
struct MinMatchesPushdown {
    /// CTEs to splice in ahead of `lanes`.
    cte: String,
    /// ` AND ...` narrowing the per-sample pass.
    filter: String,
}

fn min_matches_pushdown(
    grouping: &LaneGrouping,
    min_matches: Option<u64>,
    scan_filters: &str,
    duo_filters: &str,
) -> MinMatchesPushdown {
    let dims = grouping.dims();
    let Some(min) = min_matches.filter(|m| *m > 1).filter(|_| !dims.is_empty()) else {
        return MinMatchesPushdown::default();
    };
    // `duo_lane` rather than `assigned_lane`: the per-sample pass owns that name, and the join
    // below reads both.
    let cols = dims
        .iter()
        .map(|dim| match dim {
            LaneGroupBy::AssignedLane => "duo_lane",
            LaneGroupBy::HeroIds => "duo",
            LaneGroupBy::EnemyHeroIds => "enemy_duo",
        })
        .join(", ");
    // Only the hero columns: reading `stats` here would double the scan this pruning pays for.
    let cte = format!(
        "
lane_duos AS (
    SELECT
        match_id,
        assigned_lane AS duo_lane,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team0')) AS team0,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team1')) AS team1
    FROM match_player
    WHERE {scan_filters}
    GROUP BY match_id, assigned_lane
    HAVING length(team0) = 2 AND length(team1) = 2
),
lane_pairs AS (
    SELECT match_id, duo_lane, duo, enemy_duo
    FROM lane_duos
    ARRAY JOIN
    [team0, team1] AS duo,
    [team1, team0] AS enemy_duo
    WHERE true{duo_filters}
),
kept_matches AS (
    SELECT match_id
    FROM lane_pairs
    WHERE ({cols}) IN (SELECT {cols} FROM lane_pairs GROUP BY {cols} HAVING count() >= {min})
),"
    );
    MinMatchesPushdown {
        cte,
        filter: " AND match_id IN (SELECT match_id FROM kept_matches)".to_string(),
    }
}

fn scan_filters(
    query: &LaneSoulCurveQuery,
    accounts: &str,
    heroes: &str,
    required_heroes: &[u32],
) -> String {
    LaneScanFilters {
        game_mode: query.game_mode,
        match_mode: query.match_mode.as_deref(),
        info: query.match_info(),
        assigned_lanes: query.assigned_lanes.as_deref(),
        accounts,
        heroes,
        required_heroes,
    }
    .build()
}

fn time_bounds(query: &LaneSoulCurveQuery, column: &str) -> String {
    join_filters(&range_filters(column, query.min_time_s, query.max_time_s))
}

fn duo_filters(query: &LaneSoulCurveQuery) -> LaneDuoFilters<'_> {
    LaneDuoFilters {
        accounts: query.account_ids.as_deref(),
        heroes: query.hero_ids.as_deref(),
        enemy_heroes: query.enemy_hero_ids.as_deref(),
    }
}

/// `per_time` and the final curve `SELECT`, reading a `lane_samples` CTE with one row per lane and
/// sample: `assigned_lane`, `t`, `team0`, `team1` and each stat's `<stat>_t0` / `<stat>_t1` totals.
fn curve_select(query: &LaneSoulCurveQuery, stats: &LaneStats, duo_filters: &str) -> String {
    let grouping = LaneGrouping::new(query.group_by.as_deref());
    let grouped_select = grouping.select_grouped();
    let outer_dims = grouping.select_all_by_name();
    let per_time_group_by = grouping.group_by_clause(&["t"]);
    let outer_group_by = grouping.group_by_clause(&[]);

    let side_swap = stats.side_swap();
    let sample_aggregates = sample_aggregates(stats);
    let sample_tuple = sample_tuple(stats);
    let net_worth_diff = tuple_index(stats, LaneStat::NetWorth, 2);
    let net_worth_diff_std = tuple_index(stats, LaneStat::NetWorth, 3);
    let stat_values = curve_columns(stats, 0);
    let stat_values_std = curve_columns(stats, 1);
    let stat_diffs = curve_columns(stats, 2);
    let stat_diffs_std = curve_columns(stats, 3);
    let having_clause = matches_having_clause(query.min_matches, query.max_matches);

    format!(
        "per_time AS (
    SELECT
    {grouped_select}
        t,
        COUNT() AS sample_matchups{sample_aggregates}
    FROM lane_samples
    ARRAY JOIN
    [team0, team1] AS duo,
    [team1, team0] AS enemy_duo{side_swap}
    WHERE true{duo_filters}
    {per_time_group_by}
)
SELECT
    {outer_dims},
    arrayMap(x -> x.1, arraySort(groupArray(({sample_tuple}))) AS curve) AS sample_times_s,
    arrayMap(x -> x.2, curve) AS sample_matches,
    max(sample_matchups) AS matches_played,
    arrayMap(x -> x.{net_worth_diff}, curve) AS net_worth_diff,
    arrayMap(x -> x.{net_worth_diff_std}, curve) AS net_worth_diff_std,
    {stat_values} AS stat_values,
    {stat_values_std} AS stat_values_std,
    {stat_diffs} AS stat_diffs,
    {stat_diffs_std} AS stat_diffs_std
FROM per_time
{outer_group_by}
{having_clause}
ORDER BY matches_played DESC"
    )
}

/// Reads `lane_matchups` (migration 51) instead of `match_player`: each 2v2 lane's net worth
/// totals at every grid sample all four players reached, kept current by a materialized view.
/// Re-aggregating the per-tick `stats` arrays of every lane in the window is what makes the
/// base query cost ~6-10 CPU-s for 30 days. The table holds net worth only and no per-player
/// rows, so extra `stats` and `account_ids` use the base query.
fn build_table_query(query: &LaneSoulCurveQuery, stats: &LaneStats) -> Option<String> {
    if !stats.requested.is_empty() || query.account_ids.is_some() {
        return None;
    }
    let duo_filters = duo_filters(query);
    let table_filters = LaneTableFilters {
        game_mode: query.game_mode,
        match_mode: query.match_mode.as_deref(),
        info: query.match_info(),
        assigned_lanes: query.assigned_lanes.as_deref(),
        duos: &duo_filters,
    }
    .build();
    let time_bounds = time_bounds(query, "t");
    let curve_select = curve_select(query, stats, &duo_filters.side_filters("duo", "enemy_duo"));
    // PREWHERE: under FINAL, ClickHouse only moves sorting-key conditions there itself, so the
    // other filters would run after reading every column. Duplicate versions of a row never
    // differ in the filtered columns (checked 2026-10-04), so filtering before FINAL keeps the
    // same rows.
    Some(format!(
        "
WITH
lane_samples AS (
    SELECT
        assigned_lane,
        t,
        team0,
        team1,
        toFloat64(net_worth_sample_t0) AS net_worth_t0,
        toFloat64(net_worth_sample_t1) AS net_worth_t1
    FROM lane_matchups FINAL
    ARRAY JOIN
        sample_times_s AS t,
        net_worth_team0 AS net_worth_sample_t0,
        net_worth_team1 AS net_worth_sample_t1
    PREWHERE {table_filters}
    WHERE true{time_bounds}
),
{curve_select}
SETTINGS log_comment = 'lane_soul_curve_table', do_not_merge_across_partitions_select_final = 1
    "
    ))
}

fn build_query(query: &LaneSoulCurveQuery, stats: &LaneStats) -> String {
    let time_bounds = time_bounds(query, "time_stamp_s");

    let LaneDuoFilterSql {
        account_prefilter,
        hero_prefilter,
        required_heroes,
        duo_filters,
    } = duo_filters(query).build();
    let scan_filters = scan_filters(query, &account_prefilter, &hero_prefilter, &required_heroes);

    let grouping = LaneGrouping::new(query.group_by.as_deref());
    let player_tuple = player_tuple(stats);
    let side_totals = side_totals(stats);
    let sample_array_join = sample_array_join(stats);
    let curve_select = curve_select(query, stats, &duo_filters);

    let MinMatchesPushdown {
        cte: prune_cte,
        filter: prune_filter,
    } = min_matches_pushdown(&grouping, query.min_matches, &scan_filters, &duo_filters);

    // One pass over `match_player`: each lane keeps its duos and its players' on-grid samples, which
    // are then unrolled into per-sample totals. Resolving the duos in a second scan and joining it
    // back read the table, and the hero prefilter, twice.
    //
    // `groupUniqArrayIf` rather than `groupArrayIf`: without FINAL an unmerged replica row would
    // duplicate a hero and push the duo past the `length = 2` check. The same row would make the
    // sample's player count 5, so it is dropped there as well.
    format!(
        "
WITH{prune_cte}
lanes AS (
    WITH arrayMap(time_stamp_s -> {SAMPLE_GRID_FILTER}{time_bounds}, stats.time_stamp_s) AS on_grid
    SELECT
        match_id,
        assigned_lane,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team0')) AS team0,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team1')) AS team1,
        groupArray(({player_tuple})) AS players
    FROM match_player
    WHERE {scan_filters}{prune_filter}
    GROUP BY match_id, assigned_lane
    HAVING length(team0) = 2 AND length(team1) = 2
),
lane_samples AS (
    SELECT
        assigned_lane,
        t,
        any(team0) AS team0,
        any(team1) AS team1{side_totals}
    FROM lanes
    ARRAY JOIN players AS p
    ARRAY JOIN p.2 AS t{sample_array_join}
    GROUP BY match_id, assigned_lane, t
    HAVING count() = 4
),
-- `lanes` already proved the lane is two a side, so four players at `t` means all four were still in.
{curve_select}
SETTINGS log_comment = 'lane_soul_curve', apply_patch_parts = 0
    "
    )
}

cached_ch_query! {
    fn run_query(5_000, 21600) -> Vec<LaneSoulCurveRow>;
}

fn to_response(row: LaneSoulCurveRow, requested: &[LaneStat]) -> LaneSoulCurve {
    let stats = izip!(
        requested,
        row.stat_values,
        row.stat_values_std,
        row.stat_diffs,
        row.stat_diffs_std
    )
    .map(|(stat, value, value_std, diff, diff_std)| {
        (
            *stat,
            LaneStatCurve {
                value,
                value_std,
                diff,
                diff_std,
            },
        )
    })
    .collect();
    LaneSoulCurve {
        assigned_lane: row.assigned_lane,
        hero_ids: row.hero_ids,
        enemy_hero_ids: row.enemy_hero_ids,
        sample_times_s: row.sample_times_s,
        sample_matches: row.sample_matches,
        matches_played: row.matches_played,
        net_worth_diff: row.net_worth_diff,
        net_worth_diff_std: row.net_worth_diff_std,
        stats,
    }
}

async fn get_lane_soul_curve(
    ch_client: &clickhouse::Client,
    mut query: LaneSoulCurveQuery,
) -> APIResult<Vec<LaneSoulCurve>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let stats = LaneStats::new(query.stats.as_deref())?;
    let table_rows = if let Some(table_query) = build_table_query(&query, &stats) {
        debug!(?table_query);
        // A missing or broken table must never take the endpoint down with it.
        run_query(ch_client, &table_query)
            .await
            .inspect_err(|e| warn!("lane_soul_curve table query failed, using match_player: {e}"))
            .ok()
    } else {
        None
    };
    let rows = if let Some(rows) = table_rows {
        rows
    } else {
        let ch_query = build_query(&query, &stats);
        debug!(?ch_query);
        run_query(ch_client, &ch_query).await?
    };
    Ok(Arc::unwrap_or_clone(rows)
        .into_iter()
        .map(|row| to_response(row, &stats.requested))
        .collect())
}

#[utoipa::path(
    get,
    path = "/lane-soul-curve",
    params(LaneSoulCurveQuery),
    responses(
        (status = OK, description = "Lane Soul Curve", body = [LaneSoulCurve]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch lane soul curve")
    ),
    tags = ["Analytics"],
    summary = "Lane Soul Curve (Subject to Change)",
    description = "
> **⚠️ Subject to change:** This endpoint is newly added and not yet stable. Its parameters, response fields and semantics may change or be removed without notice.

Retrieves how a duo's lead over the duo they laned against develops over the course of the match.

The curve is not interpolated: it carries exactly the samples the game records, which are every 180 seconds up to the 15 minute mark and every 300 seconds after that. It runs from `min_time_s` (180 by default) to `max_time_s`, which is open by default, so a matchup is followed until its matches end. `sample_matches` reports how many matchups were still running at each point, and thins out towards the end of the curve.

Only lanes where *both* sides fielded exactly two players are counted, and each lane contributes one row per side, so every matchup appears twice with the two sides swapped.

Souls are always reported, in `net_worth_diff`. Pass `stats` for curves of any other per-tick stat the game records — kills, denies, player damage, healing, level and so on — each as the duo's own combined value *and* as its lead over the enemy duo.

`group_by` chooses what a row stands for. The default groups all three dimensions, giving one row per duo-versus-duo matchup per lane. Dropping `enemy_hero_ids` gives a duo's curve across every opponent, dropping `hero_ids` gives what a duo is up against, and dropping `assigned_lane` merges the lanes. Folded dimensions come back as `0` / an empty array.

Pass `hero_ids` and `enemy_hero_ids` to scope the response to the duos you care about. Without them the full duo-versus-duo matrix is computed, which is a considerably more expensive query.

Results are cached for **6 hours** based on the combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(super) async fn lane_soul_curve(
    Query(mut query): Query<LaneSoulCurveQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_lane_soul_curve(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn lane_soul_curve_build_query_is_valid_sql(query: LaneSoulCurveQuery) {
            let stats = LaneStats::new(query.stats.as_deref()).unwrap();
            assert_valid_sql(&build_query(&query, &stats));
            if let Some(table_query) = build_table_query(&query, &stats) {
                assert_valid_sql(&table_query);
            }
        }
    }
}
