use crate::utils::sql::impl_match_info;
use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use itertools::izip;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    LaneDuoFilterSql, LaneDuoFilters, default_min_matches_u64, filter_protected_accounts,
    round_timestamps,
};
use super::lane_common::{
    LaneGroupBy, LaneGrouping, LaneScanFilters, LaneStat, LaneStats, LaneTableFilters,
    is_grid_sample, matches_having_clause, stat_array,
};
use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::reject_brawl_badge_filter;
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

/// Last sample before the recording cadence coarsens from 180s steps to 300s.
const DEFAULT_SAMPLE_S: u32 = 900;

#[expect(clippy::unnecessary_wraps)]
fn default_sample_time_s() -> Option<u32> {
    Some(DEFAULT_SAMPLE_S)
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct LaneMatchupStatsQuery {
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
    /// Seconds into the match the stat readings are taken at. **Default:** 900. Matchups whose
    /// match ended earlier are still counted in `wins` and `matches_played`, but contribute no
    /// reading; `sample_matches` reports how many did.
    #[serde(default = "default_sample_time_s")]
    #[param(default = 900)]
    sample_time_s: Option<u32>,
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
    /// Comma separated list of extra per-tick stats to report, at most 8. **Default:** none.
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

impl_match_info!(LaneMatchupStatsQuery);

/// One requested stat, read at `sample_time_s` and averaged over the matchups that reached it.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LaneMatchupStat {
    /// Mean of the duo's combined value, summed over its two players.
    pub value: f64,
    /// Population standard deviation of `value` across the counted matchups.
    pub value_std: f64,
    /// Mean of the duo's combined value minus the enemy duo's. Negative means behind.
    pub diff: f64,
    /// Population standard deviation of `diff` across the counted matchups.
    pub diff_std: f64,
}

/// **⚠️ Subject to change:** newly added, fields may change or be removed without notice.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LaneMatchupStats {
    /// The lane the matchup was played in, or `0` when `assigned_lane` was grouped away. See the `lane_info` array of <https://api.deadlock-api.com/v1/assets/generic-data>.
    pub assigned_lane: u32,
    /// The ascending hero id pair that shared the lane, or empty when grouped away. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_ids: Vec<u32>,
    /// The ascending hero id pair they laned against, or empty when grouped away.
    pub enemy_hero_ids: Vec<u32>,
    /// The number of matches `hero_ids` won against `enemy_hero_ids` in this lane.
    pub wins: u64,
    /// The total number of lane matchups between `hero_ids` and `enemy_hero_ids` in this lane.
    pub matches_played: u64,
    /// Seconds into the match the stat readings were taken at. Echoes the `sample_time_s` parameter.
    pub sample_time_s: u32,
    /// Mean souls the duo is ahead by at `sample_time_s`, against that duo. Negative means behind.
    /// `0` when no counted matchup lasted that long.
    pub net_worth_diff: f64,
    /// How many of `matches_played` lasted to `sample_time_s` with all four players still in. Every
    /// reading on this row rests on those matchups only.
    pub sample_matches: u64,
    /// A reading per stat named in `stats`. Empty unless the parameter was set.
    pub stats: HashMap<LaneStat, LaneMatchupStat>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize)]
struct LaneMatchupStatsRow {
    assigned_lane: u32,
    hero_ids: Vec<u32>,
    enemy_hero_ids: Vec<u32>,
    wins: u64,
    matches_played: u64,
    sample_time_s: u32,
    net_worth_diff: f64,
    sample_matches: u64,
    stat_values: Vec<f64>,
    stat_values_std: Vec<f64>,
    stat_diffs: Vec<f64>,
    stat_diffs_std: Vec<f64>,
}

/// Gated on `both_sampled`: a matchup that ended earlier would otherwise enter the mean as a zero.
fn stat_agg(stat: LaneStat, aggregate: &str, measure: &str) -> String {
    format!("round({aggregate}IfOrDefault(x_{stat}_{measure}, both_sampled), 1)")
}

fn stat_columns(stats: &LaneStats, aggregate: &str, measure: &str) -> String {
    stat_array(stats, "Array(Float64)", |stat| {
        stat_agg(stat, aggregate, measure)
    })
}

fn scan_filters(
    query: &LaneMatchupStatsQuery,
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

fn duo_filters(query: &LaneMatchupStatsQuery) -> LaneDuoFilters<'_> {
    LaneDuoFilters {
        accounts: query.account_ids.as_deref(),
        heroes: query.hero_ids.as_deref(),
        enemy_heroes: query.enemy_hero_ids.as_deref(),
    }
}

/// The per-side `SELECT`, reading a `lane_duos` CTE with one row per lane: `assigned_lane`,
/// `team0`, `team1`, `team0_won`, `team1_won`, `both_sampled` and each stat's `<stat>_t0` /
/// `<stat>_t1` totals at the sample.
fn matchup_select(query: &LaneMatchupStatsQuery, stats: &LaneStats, duo_filters: &str) -> String {
    let grouping = LaneGrouping::new(query.group_by.as_deref());
    let dims = grouping.select_all_defined();
    let group_by_clause = grouping.group_by_clause(&[]);

    let sample_time_s = query.sample_time_s.unwrap_or(DEFAULT_SAMPLE_S);
    let side_swap = stats.side_swap();
    let net_worth_diff = stat_agg(LaneStat::NetWorth, "avg", "diff");
    let stat_values = stat_columns(stats, "avg", "value");
    let stat_values_std = stat_columns(stats, "stddevPop", "value");
    let stat_diffs = stat_columns(stats, "avg", "diff");
    let stat_diffs_std = stat_columns(stats, "stddevPop", "diff");

    let having_clause = matches_having_clause(query.min_matches, query.max_matches);

    format!(
        "SELECT
    {dims},
    countIf(won) AS wins,
    COUNT() AS matches_played,
    toUInt32({sample_time_s}) AS sample_time_s,
    {net_worth_diff} AS net_worth_diff,
    countIf(both_sampled) AS sample_matches,
    {stat_values} AS stat_values,
    {stat_values_std} AS stat_values_std,
    {stat_diffs} AS stat_diffs,
    {stat_diffs_std} AS stat_diffs_std
FROM lane_duos
ARRAY JOIN
    [team0, team1] AS duo,
    [team1, team0] AS enemy_duo,
    [team0_won, team1_won] AS won{side_swap}
WHERE true{duo_filters}
{group_by_clause}
{having_clause}
ORDER BY matches_played DESC"
    )
}

/// Matches from here on record a tick exactly on every grid time a player is still in for. Before,
/// ~0.3% of players' first tick at or after a grid time was off the grid (the last such match is
/// `47_056_361`, 2025-11-12), so the table would drop those readings.
const GRID_TICKS_EXACT_SINCE_UNIX_TIMESTAMP: i64 = 1_762_992_000;
const GRID_TICKS_EXACT_SINCE_MATCH_ID: u64 = 47_056_362;

/// Reads `lane_matchups` (migrations 51/52) instead of `match_player`: each 2v2 lane's winner and
/// net worth totals at every grid sample all four players reached, kept current by a materialized
/// view. Only grid samples are stored, so an off-grid `sample_time_s` (first tick at or after it
/// may be a match's final, off-grid tick), extra `stats` and `account_ids` use the base query.
///
/// Equivalent on grid samples because a player still in the match at a grid time has a tick
/// exactly there, so the base query's "first tick at or after" lands on it for all four. That only
/// holds since [`GRID_TICKS_EXACT_SINCE_UNIX_TIMESTAMP`]; windows reaching further back use the
/// base query.
fn build_table_query(query: &LaneMatchupStatsQuery, stats: &LaneStats) -> Option<String> {
    let sample_time_s = query.sample_time_s.unwrap_or(DEFAULT_SAMPLE_S);
    let grid_ticks_exact = query
        .min_unix_timestamp
        .is_some_and(|ts| ts >= GRID_TICKS_EXACT_SINCE_UNIX_TIMESTAMP)
        || query
            .min_match_id
            .is_some_and(|id| id >= GRID_TICKS_EXACT_SINCE_MATCH_ID);
    if !stats.requested.is_empty()
        || query.account_ids.is_some()
        || !is_grid_sample(sample_time_s)
        || !grid_ticks_exact
    {
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
    let matchup_select =
        matchup_select(query, stats, &duo_filters.side_filters("duo", "enemy_duo"));
    // PREWHERE: under FINAL, ClickHouse only moves sorting-key conditions there itself, so the
    // other filters would run after reading every column. Duplicate versions of a row never
    // differ in the filtered columns (checked 2026-10-04), so filtering before FINAL keeps the
    // same rows.
    // An index of 0 (no such sample) reads 0, which `both_sampled` gates out like the base query.
    Some(format!(
        "
WITH lane_duos AS (
    SELECT
        assigned_lane,
        team0,
        team1,
        team0_won,
        team1_won,
        indexOf(sample_times_s, {sample_time_s}) AS sample_index,
        sample_index > 0 AS both_sampled,
        toFloat64(net_worth_team0[sample_index]) AS net_worth_t0,
        toFloat64(net_worth_team1[sample_index]) AS net_worth_t1
    FROM lane_matchups FINAL
    PREWHERE {table_filters}
)
{matchup_select}
SETTINGS log_comment = 'lane_matchup_stats_table', do_not_merge_across_partitions_select_final = 1
    "
    ))
}

fn build_query(query: &LaneMatchupStatsQuery, stats: &LaneStats) -> String {
    let LaneDuoFilterSql {
        account_prefilter,
        hero_prefilter,
        required_heroes,
        duo_filters,
    } = duo_filters(query).build();
    let scan_filters = scan_filters(query, &account_prefilter, &hero_prefilter, &required_heroes);

    let sample_time_s = query.sample_time_s.unwrap_or(DEFAULT_SAMPLE_S);
    let sample_bindings = stats.sample_bindings(sample_time_s);
    let side_totals = stats.side_totals();
    let matchup_select = matchup_select(query, stats, &duo_filters);

    // `groupUniqArrayIf` rather than `groupArrayIf`: without FINAL an unmerged replica row
    // would duplicate a hero and push the duo past the `length = 2` check.
    format!(
        "
WITH lane_duos AS (
    WITH
        {sample_bindings}
    SELECT
        assigned_lane,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team0')) AS team0,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team1')) AS team1,
        anyIf(won, team = 'Team0') AS team0_won,
        anyIf(won, team = 'Team1') AS team1_won,
        (countIf(team = 'Team0' AND has_sample) = 2 AND countIf(team = 'Team1' AND has_sample) = 2) AS both_sampled{side_totals}
    FROM match_player
    WHERE {scan_filters}
    GROUP BY match_id, assigned_lane
    HAVING length(team0) = 2 AND length(team1) = 2
)
{matchup_select}
SETTINGS log_comment = 'lane_matchup_stats', apply_patch_parts = 0, max_threads = 32
    "
    )
}

#[cached(
    max_size = 5_000,
    ttl_secs = 21600,
    convert = "{ query_str.to_string() }",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<LaneMatchupStatsRow>> {
    ch_client.query(query_str).fetch_all().await
}

fn to_response(row: LaneMatchupStatsRow, requested: &[LaneStat]) -> LaneMatchupStats {
    let stats = izip!(
        requested,
        &row.stat_values,
        &row.stat_values_std,
        &row.stat_diffs,
        &row.stat_diffs_std
    )
    .map(|(stat, value, value_std, diff, diff_std)| {
        (
            *stat,
            LaneMatchupStat {
                value: *value,
                value_std: *value_std,
                diff: *diff,
                diff_std: *diff_std,
            },
        )
    })
    .collect();
    LaneMatchupStats {
        assigned_lane: row.assigned_lane,
        hero_ids: row.hero_ids,
        enemy_hero_ids: row.enemy_hero_ids,
        wins: row.wins,
        matches_played: row.matches_played,
        sample_time_s: row.sample_time_s,
        net_worth_diff: row.net_worth_diff,
        sample_matches: row.sample_matches,
        stats,
    }
}

async fn get_lane_matchup_stats(
    ch_client: &clickhouse::Client,
    mut query: LaneMatchupStatsQuery,
) -> APIResult<Vec<LaneMatchupStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let stats = LaneStats::new(query.stats.as_deref())?;
    let table_rows = if let Some(table_query) = build_table_query(&query, &stats) {
        debug!(?table_query);
        // A missing or broken table must never take the endpoint down with it.
        run_query(ch_client, &table_query)
            .await
            .inspect_err(|e| {
                warn!("lane_matchup_stats table query failed, using match_player: {e}");
            })
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
    Ok(rows
        .into_iter()
        .map(|row| to_response(row, &stats.requested))
        .collect())
}

#[utoipa::path(
    get,
    path = "/lane-matchup-stats",
    params(LaneMatchupStatsQuery),
    responses(
        (status = OK, description = "Lane Matchup Stats", body = [LaneMatchupStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch lane matchup stats")
    ),
    tags = ["Analytics"],
    summary = "Lane Matchup Stats (Subject to Change)",
    description = "
> **⚠️ Subject to change:** This endpoint is newly added and not yet stable. Its parameters, response fields and semantics may change or be removed without notice.

Retrieves duo-versus-duo lane statistics: how a pair of heroes sharing a lane performed against the pair of heroes they laned against.

Win rate covers the whole match. Everything else is read at `sample_time_s` (900 by default, the last sample before the game's recording cadence coarsens) off the matchups that lasted that long, counted by `sample_matches`. Souls are always reported, in `net_worth_diff`; pass `stats` for any other per-tick stat the game records — kills, denies, player damage, healing, level and so on — each as the duo's own combined value *and* as its lead over the enemy duo.

Only lanes where *both* sides fielded exactly two players are counted, and each lane contributes one row per side, so every matchup appears twice with the two sides swapped.

`group_by` chooses what a row stands for. The default groups all three dimensions, giving one row per duo-versus-duo matchup per lane. Dropping `enemy_hero_ids` gives a duo's record across every opponent, dropping `hero_ids` gives what a duo is up against, and dropping `assigned_lane` merges the lanes. Folded dimensions come back as `0` / an empty array.

Pass `hero_ids` and `enemy_hero_ids` to scope the response to the duos you care about. Without them the full duo-versus-duo matrix is computed, which is a considerably more expensive query.

Results are cached for **6 hours**. The cache key is determined by the specific combination of filter parameters used in the query. Subsequent requests using the exact same filters within this timeframe will receive the cached response.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(super) async fn lane_matchup_stats(
    Query(mut query): Query<LaneMatchupStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_lane_matchup_stats(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_sided_hero_filter_prefilters_the_scanned_matches() {
        let stats = LaneStats::new(None).unwrap();
        let one_side = build_query(
            &LaneMatchupStatsQuery {
                hero_ids: Some(vec![81, 80]),
                ..Default::default()
            },
            &stats,
        );
        assert!(
            one_side.contains(
                "AND hero_id IN (81, 80) GROUP BY match_id HAVING uniqExact(hero_id) = 2)"
            )
        );

        // Both sides set: the player prefilter narrows the scan instead.
        let both_sides = build_query(
            &LaneMatchupStatsQuery {
                hero_ids: Some(vec![81, 80]),
                enemy_hero_ids: Some(vec![6, 7]),
                ..Default::default()
            },
            &stats,
        );
        assert!(both_sides.contains("hero_id IN (81, 80, 6, 7)"));
        assert!(!both_sides.contains("uniqExact"));

        assert!(!build_query(&LaneMatchupStatsQuery::default(), &stats).contains("uniqExact"));
    }

    #[test]
    fn single_hero_matches_any_duo_including_it() {
        let stats = LaneStats::new(None).unwrap();
        let query = build_query(
            &LaneMatchupStatsQuery {
                hero_ids: Some(vec![3]),
                enemy_hero_ids: Some(vec![15, 31]),
                ..Default::default()
            },
            &stats,
        );
        assert!(query.contains("has(arrayMap(h -> toUInt32(h), duo), 3)"));
        assert!(query.contains("hasAll([15, 31], arrayMap(h -> toUInt32(h), enemy_duo))"));
        // The partner of hero 3 is unconstrained, so only the match-level prefilter may apply.
        assert_eq!(query.matches("hero_id IN").count(), 1);
        assert!(
            query.contains(
                "hero_id IN (3, 15, 31) GROUP BY match_id HAVING uniqExact(hero_id) = 3)"
            )
        );
    }

    #[test]
    fn one_sided_pool_does_not_require_every_pool_hero() {
        let stats = LaneStats::new(None).unwrap();
        let query = build_query(
            &LaneMatchupStatsQuery {
                hero_ids: Some(vec![2, 3, 63]),
                ..Default::default()
            },
            &stats,
        );
        assert!(!query.contains("uniqExact"));
    }
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn lane_matchup_stats_build_query_is_valid_sql(query: LaneMatchupStatsQuery) {
            let stats = LaneStats::new(query.stats.as_deref()).unwrap();
            assert_valid_sql(&build_query(&query, &stats));
            if let Some(table_query) = build_table_query(&query, &stats) {
                assert_valid_sql(&table_query);
            }
        }
    }
}
