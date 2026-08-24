use core::fmt::Write as _;
use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use itertools::{Itertools, izip};
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    LaneDuoFilterSql, LaneDuoFilters, MatchInfoFilters, default_min_matches_u64,
    filter_protected_accounts, round_timestamps,
};
use super::lane_common::{
    LaneGroupBy, LaneGrouping, LaneScanFilters, LaneStat, LaneStats, SAMPLE_GRID_FILTER,
    matches_having_clause, stat_array,
};
use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

/// First sample `match_player.stats` records.
const FIRST_SAMPLE_S: u32 = 180;

/// `t` and `sample_matchups` lead every sample tuple; each stat then contributes four aggregates.
const CURVE_TUPLE_LEADING: usize = 2;

#[allow(clippy::unnecessary_wraps)]
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
    /// Comma separated list of hero ids the *ally* duo has to be drawn from. Omit to return every duo. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Comma separated list of hero ids the *enemy* duo has to be drawn from. Omit to return every duo. See more: <https://api.deadlock-api.com/v1/assets/heroes>
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
    /// CTEs to splice in after `lane_duos`.
    cte: String,
    /// ` AND ...` narrowing the per-sample pass.
    filter: String,
}

fn min_matches_pushdown(
    grouping: &LaneGrouping,
    min_matches: Option<u64>,
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
    let cte = format!(
        "
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

fn scan_filters(query: &LaneSoulCurveQuery, accounts: &str, heroes: &str) -> String {
    LaneScanFilters {
        game_mode: query.game_mode,
        match_mode: query.match_mode.as_deref(),
        info: MatchInfoFilters {
            min_unix_timestamp: query.min_unix_timestamp,
            max_unix_timestamp: query.max_unix_timestamp,
            min_match_id: query.min_match_id,
            max_match_id: query.max_match_id,
            min_average_badge: query.min_average_badge,
            max_average_badge: query.max_average_badge,
            min_duration_s: query.min_duration_s,
            max_duration_s: query.max_duration_s,
        },
        assigned_lanes: query.assigned_lanes.as_deref(),
        accounts,
        heroes,
    }
    .build()
}

fn build_query(query: &LaneSoulCurveQuery, stats: &LaneStats) -> String {
    let mut time_bounds = String::new();
    if let Some(v) = query.min_time_s {
        let _ = write!(time_bounds, " AND time_stamp_s >= {v}");
    }
    if let Some(v) = query.max_time_s {
        let _ = write!(time_bounds, " AND time_stamp_s <= {v}");
    }

    let LaneDuoFilterSql {
        account_prefilter,
        hero_prefilter,
        duo_filters,
    } = LaneDuoFilters {
        accounts: query.account_ids.as_deref(),
        heroes: query.hero_ids.as_deref(),
        enemy_heroes: query.enemy_hero_ids.as_deref(),
    }
    .build();
    let scan_filters = scan_filters(query, &account_prefilter, &hero_prefilter);

    let grouping = LaneGrouping::new(query.group_by.as_deref());
    let grouped_select = grouping.select_grouped();
    let outer_dims = grouping.select_all_by_name();
    let per_time_group_by = grouping.group_by_clause(&["t"]);
    let outer_group_by = grouping.group_by_clause(&[]);

    let tick_array_join = stats.tick_array_join();
    let side_totals = stats.side_totals();
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
    let MinMatchesPushdown {
        cte: prune_cte,
        filter: prune_filter,
    } = min_matches_pushdown(&grouping, query.min_matches, &duo_filters);

    // The duo is resolved once per lane, not once per lane *and sample*: repeating the hash-set
    // aggregate across a grouping this size is what made the full-length curve slow.
    //
    // `groupUniqArrayIf` rather than `groupArrayIf`: without FINAL an unmerged replica row would
    // duplicate a hero and push the duo past the `length = 2` check.
    format!(
        "
WITH lane_duos AS (
    SELECT
        match_id,
        assigned_lane AS duo_lane,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team0')) AS team0,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team1')) AS team1
    FROM match_player
    WHERE {scan_filters}
    GROUP BY match_id, assigned_lane
    HAVING length(team0) = 2 AND length(team1) = 2
),{prune_cte}
lane_samples AS (
    SELECT
        match_id,
        assigned_lane,
        time_stamp_s AS t{side_totals}
    FROM match_player
    ARRAY JOIN stats.time_stamp_s AS time_stamp_s{tick_array_join}
    WHERE {scan_filters} AND {SAMPLE_GRID_FILTER}{time_bounds}{prune_filter}
    GROUP BY match_id, assigned_lane, time_stamp_s
    HAVING count() = 4
),
-- `lane_duos` already proved the lane is two a side, so `count() = 4` means all four were still in.
per_time AS (
    SELECT
    {grouped_select}
        t,
        COUNT() AS sample_matchups{sample_aggregates}
    FROM lane_samples AS s
    INNER JOIN lane_duos AS d ON s.match_id = d.match_id AND s.assigned_lane = d.duo_lane
    ARRAY JOIN
    [d.team0, d.team1] AS duo,
    [d.team1, d.team0] AS enemy_duo{side_swap}
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
ORDER BY matches_played DESC
SETTINGS log_comment = 'lane_soul_curve', apply_patch_parts = 0
    "
    )
}

#[cached(
    ttl_secs = 3600,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<LaneSoulCurveRow>> {
    ch_client.query(query_str).fetch_all().await
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
    let ch_query = build_query(&query, &stats);
    debug!(?ch_query);
    Ok(run_query(ch_client, &ch_query)
        .await?
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

Results are cached for **1 hour** based on the combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

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
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_lane_soul_curve(&state.ch_client_cached, query)
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
        }
    }
}
