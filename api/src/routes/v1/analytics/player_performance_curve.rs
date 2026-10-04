use core::fmt::Write as _;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, PlayerFilters, filter_protected_accounts, join_filters, round_timestamps,
};
use super::player_performance_curve_agg;
use super::power_up_buffs::PERMANENT_BUFF_TIMES;
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

fn default_resolution() -> Option<u8> {
    10.into()
}

/// Per-tick soul sources as (response name, `match_player` column), averaged per time bucket.
/// Sources without a flat `stats.gold_*` column read their `stats.gold_source_*_gold` column.
/// Order must match the `gold_*_avg`/`gold_*_std` field order in [`PlayerPerformanceCurvePoint`].
const GOLD_SOURCES: [(&str, &str); 18] = [
    ("gold_player", "stats.gold_player"),
    ("gold_player_orbs", "stats.gold_player_orbs"),
    ("gold_lane_creep", "stats.gold_lane_creep"),
    ("gold_lane_creep_orbs", "stats.gold_lane_creep_orbs"),
    ("gold_neutral_creep", "stats.gold_neutral_creep"),
    ("gold_neutral_creep_orbs", "stats.gold_neutral_creep_orbs"),
    ("gold_boss", "stats.gold_boss"),
    ("gold_boss_orb", "stats.gold_boss_orb"),
    ("gold_treasure", "stats.gold_treasure"),
    ("gold_denied", "stats.gold_denied"),
    ("gold_death_loss", "stats.gold_death_loss"),
    ("gold_assists", "stats.gold_source_assists_gold"),
    ("gold_team_bonus", "stats.gold_source_team_bonus_gold"),
    ("gold_breakable", "stats.gold_source_breakable_gold"),
    (
        "gold_ability_assassinate",
        "stats.gold_source_ability_assassinate_gold",
    ),
    (
        "gold_item_trophy_collector",
        "stats.gold_source_item_trophy_collector_gold",
    ),
    (
        "gold_item_cultist_sacrifice",
        "stats.gold_source_item_cultist_sacrifice_gold",
    ),
    (
        "gold_item_goose_egg",
        "stats.gold_source_item_goose_egg_gold",
    ),
];

/// Per-tick cumulative damage dealt per target as (response name, `match_player` column),
/// averaged per time bucket. Order must match the `*_damage_avg`/`*_damage_std` field order in
/// [`PlayerPerformanceCurvePoint`].
const DAMAGE_SOURCES: [(&str, &str); 4] = [
    ("player_damage", "stats.player_damage"),
    ("boss_damage", "stats.boss_damage"),
    ("neutral_damage", "stats.neutral_damage"),
    ("creep_damage", "stats.creep_damage"),
];

/// Per-tick cumulative kills per target (besides hero kills, see `kills_avg`) as (response
/// name, `match_player` column), averaged per time bucket. Order must match the
/// `*_kills_avg`/`*_kills_std` field order in [`PlayerPerformanceCurvePoint`].
const KILL_SOURCES: [(&str, &str); 4] = [
    ("boss_kills", "stats.gold_source_bosses_kills"),
    ("neutral_kills", "stats.neutral_kills"),
    ("creep_kills", "stats.creep_kills"),
    ("denies", "stats.denies"),
];

/// Every metric of a curve point as (response name, `match_player` column), in field order.
pub(super) fn curve_metrics() -> impl Iterator<Item = (&'static str, &'static str)> {
    [
        ("net_worth", "stats.net_worth"),
        ("kills", "stats.kills"),
        ("deaths", "stats.deaths"),
        ("assists", "stats.assists"),
    ]
    .into_iter()
    .chain(GOLD_SOURCES)
    .chain(DAMAGE_SOURCES)
    .chain(KILL_SOURCES)
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct PlayerPerformanceCurveQuery {
    /// Resolution for relative game times in percent (0-100).
    /// **Default:** 10 (buckets of 10%).
    /// Set to **0** to use absolute game time (seconds).
    #[param(minimum = 0, maximum = 100, default = 10)]
    #[serde(default = "default_resolution")]
    pub(super) resolution: Option<u8>,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(
        default = "GameMode::default_option",
        deserialize_with = "GameMode::deserialize_option"
    )]
    #[param(inline, default = "normal")]
    pub(super) game_mode: Option<GameMode>,
    /// Filter matches based on the match mode. Valid values: `unranked`, `private_lobby`, `coop_bot`, `ranked`, `server_test`, `tutorial`, `hero_labs`. **Default:** `ranked,unranked`.
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<crate::routes::v1::matches::types::MatchMode>(), 0..=4))"
        )
    )]
    pub(super) match_mode: Option<Vec<MatchMode>>,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    pub(super) min_unix_timestamp: Option<i64>,
    /// Filter matches based on their start time (Unix timestamp).
    pub(super) max_unix_timestamp: Option<i64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    pub(super) min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    pub(super) max_duration_s: Option<u64>,
    /// Filter players based on their final net worth.
    pub(super) min_networth: Option<u64>,
    /// Filter players based on their final net worth.
    pub(super) max_networth: Option<u64>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    pub(super) min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    pub(super) max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    pub(super) min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    pub(super) max_match_id: Option<u64>,
    /// Filter matches based on the hero IDs. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    pub(super) hero_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to include (only players who have purchased these items). See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    pub(super) include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only players who have not purchased these items). See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    pub(super) exclude_item_ids: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players whose ability upgrade order starts with exactly this sequence (one entry per ability point spent, unlocks included; see `ability_unlock_order_prefix` to match only the unlock order). See more: <https://api.deadlock-api.com/v1/analytics/ability-order-stats>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    pub(super) ability_order_prefix: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players who unlocked (put their first point into) their abilities in exactly this order, e.g. `a,b` for players who unlocked `a` first and `b` second. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    pub(super) ability_unlock_order_prefix: Option<Vec<u32>>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    pub(super) account_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct PlayerPerformanceCurvePoint {
    /// The time point of the data.
    /// If `resolution` (default 10) is > 0, this is a percentage (0, 10, ..., 100).
    /// If `resolution` is 0, this is the match time in seconds.
    pub game_time: u32,
    /// Average net worth at this time point
    pub net_worth_avg: f64,
    /// Standard deviation of net worth at this time point
    pub net_worth_std: f64,
    /// Average kills at this time point
    pub kills_avg: f64,
    /// Standard deviation of kills at this time point
    pub kills_std: f64,
    /// Average deaths at this time point
    pub deaths_avg: f64,
    /// Standard deviation of deaths at this time point
    pub deaths_std: f64,
    /// Average assists at this time point
    pub assists_avg: f64,
    /// Standard deviation of assists at this time point
    pub assists_std: f64,
    /// Average souls earned from hero kills at this time point, including assist souls
    /// (see `gold_assists_avg`)
    pub gold_player_avg: f64,
    /// Standard deviation of `gold_player_avg` at this time point
    pub gold_player_std: f64,
    /// Average souls earned from secured hero-kill orbs at this time point
    pub gold_player_orbs_avg: f64,
    /// Standard deviation of `gold_player_orbs_avg` at this time point
    pub gold_player_orbs_std: f64,
    /// Average souls earned from lane creeps at this time point
    pub gold_lane_creep_avg: f64,
    /// Standard deviation of `gold_lane_creep_avg` at this time point
    pub gold_lane_creep_std: f64,
    /// Average souls earned from secured lane-creep orbs at this time point
    pub gold_lane_creep_orbs_avg: f64,
    /// Standard deviation of `gold_lane_creep_orbs_avg` at this time point
    pub gold_lane_creep_orbs_std: f64,
    /// Average souls earned from neutral (jungle) creeps at this time point
    pub gold_neutral_creep_avg: f64,
    /// Standard deviation of `gold_neutral_creep_avg` at this time point
    pub gold_neutral_creep_std: f64,
    /// Average souls earned from secured neutral-creep orbs at this time point
    pub gold_neutral_creep_orbs_avg: f64,
    /// Standard deviation of `gold_neutral_creep_orbs_avg` at this time point
    pub gold_neutral_creep_orbs_std: f64,
    /// Average souls earned from objectives at this time point
    pub gold_boss_avg: f64,
    /// Standard deviation of `gold_boss_avg` at this time point
    pub gold_boss_std: f64,
    /// Average souls earned from secured objective orbs at this time point
    pub gold_boss_orb_avg: f64,
    /// Standard deviation of `gold_boss_orb_avg` at this time point
    pub gold_boss_orb_std: f64,
    /// Average souls earned from the urn at this time point
    pub gold_treasure_avg: f64,
    /// Standard deviation of `gold_treasure_avg` at this time point
    pub gold_treasure_std: f64,
    /// Average souls denied to enemies at this time point
    pub gold_denied_avg: f64,
    /// Standard deviation of `gold_denied_avg` at this time point
    pub gold_denied_std: f64,
    /// Average souls lost on death at this time point
    pub gold_death_loss_avg: f64,
    /// Standard deviation of `gold_death_loss_avg` at this time point
    pub gold_death_loss_std: f64,
    /// Average souls earned from assists at this time point (part of `gold_player_avg`)
    pub gold_assists_avg: f64,
    /// Standard deviation of `gold_assists_avg` at this time point
    pub gold_assists_std: f64,
    /// Average souls earned from the team bonus at this time point
    pub gold_team_bonus_avg: f64,
    /// Standard deviation of `gold_team_bonus_avg` at this time point
    pub gold_team_bonus_std: f64,
    /// Average souls earned from breakables (crates, statues) at this time point
    pub gold_breakable_avg: f64,
    /// Standard deviation of `gold_breakable_avg` at this time point
    pub gold_breakable_std: f64,
    /// Average souls earned from the Assassinate ability at this time point
    pub gold_ability_assassinate_avg: f64,
    /// Standard deviation of `gold_ability_assassinate_avg` at this time point
    pub gold_ability_assassinate_std: f64,
    /// Average souls earned from the Trophy Collector item at this time point
    pub gold_item_trophy_collector_avg: f64,
    /// Standard deviation of `gold_item_trophy_collector_avg` at this time point
    pub gold_item_trophy_collector_std: f64,
    /// Average souls earned from the Cultist Sacrifice item at this time point
    pub gold_item_cultist_sacrifice_avg: f64,
    /// Standard deviation of `gold_item_cultist_sacrifice_avg` at this time point
    pub gold_item_cultist_sacrifice_std: f64,
    /// Average souls earned from the Golden Goose Egg item at this time point
    pub gold_item_goose_egg_avg: f64,
    /// Standard deviation of `gold_item_goose_egg_avg` at this time point
    pub gold_item_goose_egg_std: f64,
    /// Average damage dealt to enemy heroes at this time point
    pub player_damage_avg: f64,
    /// Standard deviation of `player_damage_avg` at this time point
    pub player_damage_std: f64,
    /// Average damage dealt to objectives at this time point
    pub boss_damage_avg: f64,
    /// Standard deviation of `boss_damage_avg` at this time point
    pub boss_damage_std: f64,
    /// Average damage dealt to neutral (jungle) creeps at this time point
    pub neutral_damage_avg: f64,
    /// Standard deviation of `neutral_damage_avg` at this time point
    pub neutral_damage_std: f64,
    /// Average damage dealt to lane creeps at this time point
    pub creep_damage_avg: f64,
    /// Standard deviation of `creep_damage_avg` at this time point
    pub creep_damage_std: f64,
    /// Average objectives killed (last hits) at this time point
    pub boss_kills_avg: f64,
    /// Standard deviation of `boss_kills_avg` at this time point
    pub boss_kills_std: f64,
    /// Average neutral (jungle) creeps killed at this time point
    pub neutral_kills_avg: f64,
    /// Standard deviation of `neutral_kills_avg` at this time point
    pub neutral_kills_std: f64,
    /// Average lane creeps killed (last hits) at this time point
    pub creep_kills_avg: f64,
    /// Standard deviation of `creep_kills_avg` at this time point
    pub creep_kills_std: f64,
    /// Average lane creeps denied at this time point
    pub denies_avg: f64,
    /// Standard deviation of `denies_avg` at this time point
    pub denies_std: f64,
    /// Average permanent buff (power-up) pickups collected up to this time point. Only
    /// matches since build 6712 (2026-09-29) record pickup times, so only players with at
    /// least one timed permanent pickup count; `null` when there are none.
    pub permanent_buffs_avg: Option<f64>,
    /// Standard deviation of `permanent_buffs_avg` at this time point; `null` when there are
    /// no players with timed permanent pickups.
    pub permanent_buffs_std: Option<f64>,
}

/// Hero-filtered requests read the hero-led `player_performance_curve_by_hero` projection
/// (sorted by `hero_id, game_mode, start_time`) instead of every granule of the base table.
/// Without a hero filter the planner would still pick a hero-led projection and read all of it,
/// so those keep the base table.
fn projection_setting(query: &PlayerPerformanceCurveQuery) -> &'static str {
    if query.hero_ids.as_ref().is_some_and(|h| !h.is_empty()) {
        ""
    } else {
        ", optimize_use_projections = 0"
    }
}

fn build_query(query: &PlayerPerformanceCurveQuery) -> String {
    let info_filters = MatchInfoFilters {
        min_unix_timestamp: query.min_unix_timestamp,
        max_unix_timestamp: query.max_unix_timestamp,
        min_match_id: query.min_match_id,
        max_match_id: query.max_match_id,
        min_average_badge: query.min_average_badge,
        max_average_badge: query.max_average_badge,
        min_duration_s: query.min_duration_s,
        max_duration_s: query.max_duration_s,
    }
    .build();
    let player_filters = join_filters(
        &PlayerFilters {
            hero_ids: query.hero_ids.as_deref(),
            account_ids: query.account_ids.as_deref(),
            min_networth: query.min_networth,
            max_networth: query.max_networth,
            include_item_ids: query.include_item_ids.as_deref(),
            exclude_item_ids: query.exclude_item_ids.as_deref(),
            ability_order_prefix: query.ability_order_prefix.as_deref(),
            ability_unlock_order_prefix: query.ability_unlock_order_prefix.as_deref(),
            ..Default::default()
        }
        .build(),
    );

    let resolution = query.resolution.unwrap_or(10);
    let (game_time_selection, additional_filter) = if resolution == 0 {
        (
            "toUInt32(timestamp_s)".to_string(),
            "WHERE (timestamp_s >= 180) AND ((timestamp_s <= 900 AND timestamp_s % 180 = 0) OR (timestamp_s > 900 AND timestamp_s % 300 = 0))",
        )
    } else {
        (
            format!(
                "toUInt32(floor((timestamp_s / duration_s) * (100 / {resolution})) * {resolution})"
            ),
            "",
        )
    };

    let mut players_sources = String::new();
    let mut data_sources = String::new();
    let mut array_join_sources = String::new();
    let mut select_sources = String::new();
    for (s, column) in GOLD_SOURCES
        .into_iter()
        .chain(DAMAGE_SOURCES)
        .chain(KILL_SOURCES)
    {
        let _ = write!(players_sources, ", {column} as {s}_arr");
        let _ = write!(data_sources, ", {s}_arr as {s}");
        let _ = write!(array_join_sources, ", {s}_arr");
        let _ = write!(
            select_sources,
            ",\n        avg({s}) AS {s}_avg,\n        std({s}) AS {s}_std"
        );
    }

    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    // Cumulative permanent buff pickups at each stats tick, counted before the ARRAY JOIN so
    // only one UInt32 per tick is replicated (not the pickup-time array). Rows without pickup
    // timings (pre-6712 matches) are left out of the average via `has_buff_timings`.
    let players_buffs = format!(
        ", {PERMANENT_BUFF_TIMES} AS buff_times, \
         arrayMap(ts -> toUInt32(arrayCount(t -> t <= ts, buff_times)), stats.time_stamp_s) AS \
         permanent_buffs_arr, notEmpty(buff_times) AS has_buff_timings"
    );
    let projection_setting = projection_setting(query);
    format!(
        "
    WITH t_players AS (
            SELECT stats.time_stamp_s as timestamp_s, stats.net_worth as net_worths, stats.kills as kills_arr, stats.deaths as deaths_arr, stats.assists as assists_arr{players_sources}{players_buffs}, duration_s
            FROM match_player
            WHERE {match_mode_filter}
                AND {game_mode_filter}
                {info_filters}
                {player_filters}
        ),
        t_data AS (
            SELECT timestamp_s, net_worths as net_worth, kills_arr as kills, deaths_arr as deaths, assists_arr as assists{data_sources}, permanent_buffs_arr as permanent_buffs, has_buff_timings, duration_s
            FROM t_players
            ARRAY JOIN timestamp_s, net_worths, kills_arr, deaths_arr, assists_arr{array_join_sources}, permanent_buffs_arr
        )
    SELECT
        {game_time_selection} AS game_time,
        avg(net_worth) AS net_worth_avg,
        std(net_worth) AS net_worth_std,
        avg(kills) AS kills_avg,
        std(kills) AS kills_std,
        avg(deaths) AS deaths_avg,
        std(deaths) AS deaths_std,
        avg(assists) AS assists_avg,
        std(assists) AS assists_std{select_sources},
        avgOrNullIf(permanent_buffs, has_buff_timings) AS permanent_buffs_avg,
        stddevPopOrNullIf(permanent_buffs, has_buff_timings) AS permanent_buffs_std
    FROM t_data
    {additional_filter}
    GROUP BY game_time
    ORDER BY game_time
    SETTINGS log_comment = 'player_performance_curve', apply_patch_parts = 0{projection_setting}
    "
    )
}

/// Whether the agg table holds every day in `[from, to)`. Days are built once and only
/// rebuilt in place, so a positive answer stays true; a negative one is rechecked soon.
#[cached(
    max_size = 1_000,
    ttl_secs = 600,
    convert = "{ days }",
    key = "(i64, i64)"
)]
async fn agg_days_built(
    ch_client: &clickhouse::Client,
    days: (i64, i64),
) -> clickhouse::error::Result<bool> {
    let (from, to) = days;
    if to <= from {
        return Ok(true);
    }
    let built: u64 = ch_client
        .query(&player_performance_curve_agg::built_days_query(from, to))
        .fetch_one()
        .await?;
    Ok(i64::try_from(built).is_ok_and(|built| built == (to - from) / 86_400))
}

#[cached(
    max_size = 5_000,
    ttl_secs = 43200,
    convert = "{ query_str.to_string() }",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<PlayerPerformanceCurvePoint>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_player_performance_curve(
    ch_client: &clickhouse::Client,
    mut query: PlayerPerformanceCurveQuery,
) -> APIResult<Vec<PlayerPerformanceCurvePoint>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let now = chrono::Utc::now().timestamp();
    let agg_plan = match player_performance_curve_agg::plan(&query, now) {
        Some(plan) if agg_days_built(ch_client, plan.required_days(now)).await? => Some(plan),
        _ => None,
    };
    let query_str = match agg_plan {
        Some(plan) => player_performance_curve_agg::build_agg_query(&query, &plan),
        None => build_query(&query),
    };
    debug!(?query_str);
    let rows = run_query(ch_client, &query_str).await?;
    Ok(rows)
}

#[utoipa::path(
    get,
    path = "/player-performance-curve",
    params(PlayerPerformanceCurveQuery),
    responses(
        (status = OK, description = "Player Performance Curve", body = [PlayerPerformanceCurvePoint]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch player performance curve")
    ),
    tags = ["Analytics"],
    summary = "Player Performance Curve",
    description = "
Retrieves player performance statistics (net worth, kills, deaths, assists, souls per source, damage and kills per target) over time throughout matches.

Results are cached for **12 hours** based on the unique combination of query parameters provided.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(crate) async fn player_performance_curve(
    Query(mut query): Query<PlayerPerformanceCurveQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if query.game_mode.is_some_and(|g| g == GameMode::StreetBrawl)
        && (query.min_average_badge.is_some() || query.max_average_badge.is_some())
    {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Cannot filter by average badge for street brawl game mode".to_string(),
        });
    }
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_player_performance_curve(&state.ch_client_ro, query)
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
        fn player_performance_curve_build_query_is_valid_sql(query: PlayerPerformanceCurveQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
