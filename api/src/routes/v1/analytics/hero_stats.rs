use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    BucketQuery, PlayerFilters, filter_protected_accounts, is_non_empty, join_filters,
    range_filters, rollup_oldest_servable, round_timestamps,
};
use super::rollup_window::{Coverage, DaySplit, EdgeRows, Rollup, RollupFilters};
use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{
    comma_separated_deserialize_option, comma_separated_steam_ids_option,
    default_last_month_timestamp, parse_steam_id_option,
};
use crate::utils::sql::{MatchInfoFilters, cached_ch_query, impl_match_info};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct HeroStatsQuery {
    /// Bucket allows you to group the stats by a specific field.
    #[serde(default)]
    #[param(inline)]
    bucket: BucketQuery,
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
    /// Filter players based on their final net worth.
    min_networth: Option<u64>,
    /// Filter players based on their final net worth.
    max_networth: Option<u64>,
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
    /// Filter players based on the number of matches they have played with a specific hero within the filtered time range (all durations, even with a duration filter).
    min_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero within the filtered time range (all durations, even with a duration filter).
    max_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero in their entire history, counting only matches of the selected `game_mode`.
    min_hero_matches_total: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero in their entire history, counting only matches of the selected `game_mode`.
    max_hero_matches_total: Option<u64>,
    /// Comma separated list of item ids to include (only players who have purchased these items). See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only players who have not purchased these items). See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    exclude_item_ids: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players whose ability upgrade order starts with exactly this sequence (one entry per ability point spent, unlocks included; see `ability_unlock_order_prefix` to match only the unlock order). See more: <https://api.deadlock-api.com/v1/analytics/ability-order-stats>
    // Order matters, and repeated keys reach the API reordered: clients must send one `a,b` value.
    #[param(explode = false)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    ability_order_prefix: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players who unlocked (put their first point into) their abilities in exactly this order, e.g. `a,b` for players who unlocked `a` first and `b` second. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    // Order matters, and repeated keys reach the API reordered: clients must send one `a,b` value.
    #[param(explode = false)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    ability_unlock_order_prefix: Option<Vec<u32>>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_steam_ids_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
}

impl_match_info!(HeroStatsQuery);

impl HeroStatsQuery {
    fn has_ability_order_filter(&self) -> bool {
        is_non_empty(self.ability_order_prefix.as_deref())
            || is_non_empty(self.ability_unlock_order_prefix.as_deref())
    }

    /// The hero-match bounds that actually filter. Every player in the window has played the
    /// hero at least once, so a minimum of 0 or 1 is no filter (the website sends 0); a maximum
    /// always filters.
    fn hero_matches_bounds(&self) -> (Option<u64>, Option<u64>) {
        (
            self.min_hero_matches.filter(|&v| v > 1),
            self.max_hero_matches,
        )
    }

    /// Same as [`Self::hero_matches_bounds`], for the entire-history counts.
    fn hero_matches_total_bounds(&self) -> (Option<u64>, Option<u64>) {
        (
            self.min_hero_matches_total.filter(|&v| v > 1),
            self.max_hero_matches_total,
        )
    }
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct AnalyticsHeroStats {
    /// See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_id: u8,
    bucket: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    matches_per_bucket: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
    total_net_worth: u64,
    total_last_hits: u64,
    total_denies: u64,
    total_player_damage: u64,
    total_player_damage_taken: u64,
    total_boss_damage: u64,
    total_creep_damage: u64,
    total_neutral_damage: u64,
    total_max_health: u64,
    total_shots_hit: u64,
    total_shots_missed: u64,
    /// Sum of permanent buff (power-up) pickups over the `permanent_buff_matches` matches.
    /// Average per match: `total_permanent_buffs / permanent_buff_matches`. Buff types:
    /// <https://api.deadlock-api.com/v1/assets/misc-entities>
    total_permanent_buffs: u64,
    /// Matches that carry buff pickup counts. Equals `matches`, except on account-scoped
    /// queries (`account_ids` without item or ability filters): those read a per-account table
    /// that only has buff counts for matches ingested since build 6712 (late September 2026).
    permanent_buff_matches: u64,
    /// Sum of the game time (seconds) of each player's first permanent buff pickup, over the
    /// `permanent_buff_timing_matches` matches.
    /// Average: `total_first_permanent_buff_time_s / permanent_buff_timing_matches`.
    total_first_permanent_buff_time_s: u64,
    /// Matches with pickup timings. Only matches since build 6712 (2026-09-29) record pickup
    /// times, and only players with at least one permanent pickup count here.
    permanent_buff_timing_matches: u64,
    /// Sum of `matches` over all heroes in this bucket, counting only the UTC days from this
    /// hero's first match in the response on. A pick rate that leaves out the part of the range
    /// before the hero's release: `matches / bucket_matches_since_first_day` times the players
    /// per match. The hero's first day counts whole, so it still includes the hours before its
    /// first match.
    bucket_matches_since_first_day: u64,
}

/// Groups `days`, rows per `hero_id`, `bucket` and `day` with an `n_matches` column, into the
/// response rows that `columns` (aggregates over those rows) select, and adds
/// `bucket_matches_since_first_day` from the same rows: a hero's first day across all buckets,
/// and each bucket's matches per day. Grouping by day first reads no more rows; it only adds a
/// few thousand groups (heroes × days) to the aggregation.
fn group_hero_days(columns: &str, days: &str, log_comment: &str) -> String {
    format!(
        "
    SELECT * EXCEPT (first_day, day_matches),
        arraySum(mapValues(mapFilter((d, n) -> d >= first_day, day_matches)))
            AS bucket_matches_since_first_day
    FROM (
        SELECT
            hero_id,
            bucket,
            {columns},
            min(min(day)) OVER (PARTITION BY hero_id) AS first_day,
            sumMap(sumMap(map(day, n_matches))) OVER (PARTITION BY bucket) AS day_matches
        FROM ({days}
        )
        GROUP BY hero_id, bucket
    )
    ORDER BY hero_id, bucket
    SETTINGS log_comment = '{log_comment}', apply_patch_parts = 0
    "
    )
}

/// Horizon of the `hero_stats_agg_v2` materialized view, in days. Keep in sync with
/// the `INTERVAL ... DAY` in the view's refresh `SELECT`.
const MV_HORIZON_DAYS: i64 = 65;

/// Grain columns of the hero-stats rollups, with the `match_player` expressions of [`mv_rows`].
const MV_GRAIN: &[(&str, &str)] = &[
    ("game_mode", "game_mode"),
    ("match_mode", "match_mode"),
    ("hero_id", "hero_id"),
    ("least_badge", "ifNull(average_badge, 0)"),
    ("greatest_badge", "ifNull(average_badge, 65535)"),
    ("day", "toDate(start_time)"),
];
/// Measure columns of the hero-stats rollups, as [`mv_rows`] yields them.
const MV_MEASURES: &str = "n_matches, n_wins, sum_kills, sum_deaths, sum_assists, sum_net_worth, sum_last_hits, \
    sum_denies, sum_player_damage, sum_player_damage_taken, sum_boss_damage, sum_creep_damage, \
    sum_neutral_damage, sum_max_health, sum_shots_hit, sum_shots_missed, sum_permanent_buffs, \
    n_permanent_buff_timing_matches, sum_first_permanent_buff_time_s";

/// The hero-stats rollup rows of a window's partial days. Keep in sync with the `SELECT` of both
/// views in `tools/migrations/clickhouse/50_power_up_buff_analytics.sql`.
fn mv_rows(
    EdgeRows {
        where_clause,
        grain_select,
        group_by,
    }: &EdgeRows,
) -> String {
    format!(
        "SELECT
    {grain_select}count() AS n_matches,
    sum(won) AS n_wins,
    sum(kills) AS sum_kills,
    sum(deaths) AS sum_deaths,
    sum(assists) AS sum_assists,
    sum(net_worth) AS sum_net_worth,
    sum(last_hits) AS sum_last_hits,
    sum(denies) AS sum_denies,
    sum(max_player_damage) AS sum_player_damage,
    sum(max_player_damage_taken) AS sum_player_damage_taken,
    sum(max_boss_damage) AS sum_boss_damage,
    sum(max_creep_damage) AS sum_creep_damage,
    sum(max_neutral_damage) AS sum_neutral_damage,
    sum(max_max_health) AS sum_max_health,
    sum(max_shots_hit) AS sum_shots_hit,
    sum(max_shots_missed) AS sum_shots_missed,
    sum(permanent_buffs) AS sum_permanent_buffs,
    count(first_permanent_buff_time_s) AS n_permanent_buff_timing_matches,
    sum(ifNull(first_permanent_buff_time_s, 0)) AS sum_first_permanent_buff_time_s
FROM (
    SELECT
        game_mode, match_mode, hero_id, match_id, start_time, average_badge, won, kills, deaths,
        assists, net_worth, last_hits, denies, max_player_damage, max_player_damage_taken,
        max_boss_damage, max_creep_damage, max_neutral_damage, max_max_health, max_shots_hit,
        max_shots_missed, account_id, permanent_buffs, first_permanent_buff_time_s
    FROM default.match_player
    WHERE match_mode IN ('Ranked', 'Unranked') AND {where_clause}
    LIMIT 1 BY match_id, account_id
)
GROUP BY {group_by}"
    )
}

/// Builds a query against a pre-aggregated hero-stats rollup when the request falls
/// within the "global meta" subset they materialize, else `None` (the caller then
/// uses the base-table query). Both rollups are grained on
/// `(game_mode, day, hero_id, least_badge, greatest_badge)`, so they serve
/// `game_mode` + time-range + badge-range filters and the non-hourly buckets, but
/// anything per-player or per-row (account, item set, net worth, duration, match id,
/// hero match counts) or needing sub-day resolution must use the base table.
///
/// Two rollups back this: the hourly-refreshed last-65-days `hero_stats_agg_v2` and the
/// 6-hourly full-history `hero_stats_agg_all_v2`. Recent windows use the hot one (freshest
/// data); older / all-time windows — notably the date-picker-reset
/// `min_unix_timestamp=0` state, which used to full-scan `match_player` and time out —
/// use the full-history one. A request reads exactly one table, so totals never
/// double-count. The `_v2` views (migration 50) add the permanent buff pickup sums; every
/// rolled-up row has buff counts, so `permanent_buff_matches` is `n_matches`.
///
/// Only the window's whole days come from the rollup; its partial days are aggregated from
/// `match_player` (see [`rollup_window`](super::rollup_window)). A window without a whole day
/// uses the base table.
fn build_mv_query(query: &HeroStatsQuery) -> Option<String> {
    let bucket_expr = query.bucket.mv_bucket_expr()?;
    // Per-player / per-row filters the grain cannot express → base table.
    #[expect(deprecated)]
    let personalized = query.account_id.is_some()
        || is_non_empty(query.account_ids.as_deref())
        || is_non_empty(query.include_item_ids.as_deref())
        || is_non_empty(query.exclude_item_ids.as_deref());
    let unsupported_filter = query.min_networth.is_some()
        || query.max_networth.is_some()
        || query.min_duration_s.is_some()
        || query.max_duration_s.is_some()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some()
        || query.hero_matches_bounds() != (None, None)
        || query.hero_matches_total_bounds() != (None, None)
        || query.has_ability_order_filter();
    // The rollups only ingest Ranked/Unranked, so any other mode would read zero rows.
    let unsupported_match_mode = !MatchMode::is_agg_servable(query.match_mode.as_deref());
    if personalized || unsupported_filter || unsupported_match_mode {
        return None;
    }
    let split = DaySplit::new(query.min_unix_timestamp, query.max_unix_timestamp)?;

    // Pick the rollup: the hourly 65-day `hero_stats_agg` for windows that start
    // comfortably inside its horizon (freshest data), else the 6-hourly full-history
    // `hero_stats_agg_all` (covers all-time / old windows the hot view can't).
    let oldest_servable = rollup_oldest_servable(MV_HORIZON_DAYS)?;
    let (mv_table, mv_log_comment) = if query
        .min_unix_timestamp
        .is_some_and(|min_ts| min_ts >= oldest_servable)
    {
        ("hero_stats_agg_v2", "hero_stats_mv")
    } else {
        ("hero_stats_agg_all_v2", "hero_stats_mv_all")
    };

    let filters = RollupFilters::new(
        query.game_mode,
        query.match_mode.as_deref(),
        query.min_average_badge,
        query.max_average_badge,
    );
    let rollup = Rollup {
        table: mv_table,
        grain: MV_GRAIN,
        measures: MV_MEASURES,
        coverage: Coverage::Complete,
    };
    let source = rollup.source(
        &split,
        &filters,
        &format!("hero_id, {bucket_expr}, day"),
        mv_rows,
    );
    let day_sums = MV_MEASURES
        .split(',')
        .map(|measure| format!("sum({0}) AS {0}", measure.trim()))
        .collect::<Vec<_>>()
        .join(", ");

    let matches_per_bucket = if query.bucket == BucketQuery::NoBucket {
        "matches"
    } else {
        "sum(sum(n_matches)) OVER (PARTITION BY bucket)"
    };

    Some(group_hero_days(
        &format!(
            "sum(n_wins) AS wins,
            toUInt64(sum(n_matches) - sum(n_wins)) AS losses,
            sum(n_matches) AS matches,
            {matches_per_bucket} AS matches_per_bucket,
            sum(sum_kills) AS total_kills,
            sum(sum_deaths) AS total_deaths,
            sum(sum_assists) AS total_assists,
            sum(sum_net_worth) AS total_net_worth,
            sum(sum_last_hits) AS total_last_hits,
            sum(sum_denies) AS total_denies,
            sum(sum_player_damage) AS total_player_damage,
            sum(sum_player_damage_taken) AS total_player_damage_taken,
            sum(sum_boss_damage) AS total_boss_damage,
            sum(sum_creep_damage) AS total_creep_damage,
            sum(sum_neutral_damage) AS total_neutral_damage,
            sum(sum_max_health) AS total_max_health,
            sum(sum_shots_hit) AS total_shots_hit,
            sum(sum_shots_missed) AS total_shots_missed,
            sum(sum_permanent_buffs) AS total_permanent_buffs,
            sum(n_matches) AS permanent_buff_matches,
            sum(sum_first_permanent_buff_time_s) AS total_first_permanent_buff_time_s,
            sum(n_permanent_buff_timing_matches) AS permanent_buff_timing_matches"
        ),
        &format!(
            "
        SELECT hero_id, {bucket_expr} AS bucket, day, {day_sums}
        FROM {source}
        GROUP BY hero_id, bucket, day"
        ),
        mv_log_comment,
    ))
}

#[expect(clippy::too_many_lines)]
fn build_query(query: &HeroStatsQuery) -> String {
    let info_filters = query.match_info().build();
    #[expect(deprecated)]
    let player_filters = PlayerFilters {
        account_id: query.account_id,
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
        ability_order_prefix: query.ability_order_prefix.as_deref(),
        ability_unlock_order_prefix: query.ability_unlock_order_prefix.as_deref(),
        ..Default::default()
    }
    .build();
    let player_filters = join_filters(&player_filters);
    let (min_hero_matches, max_hero_matches) = query.hero_matches_bounds();
    let (min_hero_matches_total, max_hero_matches_total) = query.hero_matches_total_bounds();
    // Only used by the CTEs below, which exist only when a bound is set.
    let player_hero_filters =
        range_filters("uniq(match_id)", min_hero_matches, max_hero_matches).join(" AND ");
    // player_match_history holds a match twice until both sources' inserts merge.
    let player_hero_total_filters = range_filters(
        "uniqExact(match_id)",
        min_hero_matches_total,
        max_hero_matches_total,
    )
    .join(" AND ");
    let bucket = query.bucket.base_expr();
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    let match_filters = format!("AND {match_mode_filter} AND {game_mode_filter} {info_filters}");
    // The in-window hero match count spans the whole window: a duration filter (one bucket of the
    // by-duration chart) must not narrow it to the player's matches of that duration.
    let window_info_filters = MatchInfoFilters {
        min_duration_s: None,
        max_duration_s: None,
        ..query.match_info()
    }
    .build();
    let window_match_filters =
        format!("AND {match_mode_filter} AND {game_mode_filter} {window_info_filters}");
    let has_player_hero_cte = min_hero_matches.is_some() || max_hero_matches.is_some();
    let has_player_hero_total_cte =
        min_hero_matches_total.is_some() || max_hero_matches_total.is_some();
    #[expect(deprecated)]
    let has_account_filter =
        query.account_id.is_some() || is_non_empty(query.account_ids.as_deref());
    let has_item_filter = is_non_empty(query.include_item_ids.as_deref())
        || is_non_empty(query.exclude_item_ids.as_deref())
        || query.has_ability_order_filter();
    // An account-scoped read is a primary-key range on player_match_stats but opens every part
    // of match_player; only the item and ability arrays, which player_match_stats does not
    // carry, force the wide table.
    let source_table = if has_account_filter && !has_item_filter {
        "player_match_stats"
    } else {
        "match_player"
    };
    // The window-wide read dedups with FINAL: it streams the ReplacingMergeTree merge in
    // parallel where `LIMIT 1 BY` funnels every row through one hash set (measured 30-76% less
    // wall time on 5-week to 7-month windows, same bytes read, peak memory within 1.4x). FINAL
    // also keeps the planner off the hero_stats_by_hero projection, which cannot prune by
    // start_time. Account- and hero-CTE-scoped reads are primary-key or join bound and keep
    // `LIMIT 1 BY`. The entire-history CTE is a set filter on the window-wide read, so it takes
    // FINAL too (measured 56-90% less wall time than `LIMIT 1 BY` on a 10-week window).
    let use_final = !has_account_filter && !has_player_hero_cte;
    let (final_clause, dedup_clause) = if use_final {
        (" FINAL", "")
    } else {
        ("", "LIMIT 1 BY match_id, account_id")
    };
    // Under FINAL, ClickHouse only moves sorting-key conditions to PREWHERE, so the match-level
    // filters would otherwise be applied after reading every column of every row. Duplicate
    // (match_id, account_id) versions are re-ingests that never differ in these match-level
    // columns (checked on partitions >= 100: 1,540 duplicate pairs, none differing), so
    // filtering before FINAL keeps the same rows, the same semantics as the `LIMIT 1 BY` path.
    let (prewhere_clause, where_match_filters) = if use_final {
        (format!("PREWHERE TRUE {match_filters}"), "")
    } else {
        (String::new(), match_filters.as_str())
    };
    let mut ctes: Vec<String> = vec![];
    if has_player_hero_cte {
        ctes.push(format!(
            "t_players AS (
            SELECT account_id, hero_id
            FROM {source_table}
            WHERE TRUE
                {player_filters}
                {window_match_filters}
            GROUP BY account_id, hero_id
            HAVING {player_hero_filters}
        )"
        ));
    }
    // Only the accounts in the window can pass the filter, so the history count is limited to
    // them: a primary-key range on player_match_history instead of grouping all of it (500M rows
    // into a 2-4 GiB hash table). Experience counts in the selected game mode only, so Street
    // Brawl or bot games don't lift a player into a higher bucket of the normal-mode stats.
    if has_player_hero_total_cte {
        ctes.push(format!(
            "t_players2 AS (
            SELECT account_id, hero_id
            FROM player_match_history
            WHERE {game_mode_filter} AND account_id IN (
                SELECT account_id
                FROM {source_table}
                WHERE TRUE
                    {player_filters}
                    {match_filters}
            )
            GROUP BY account_id, hero_id
            HAVING {player_hero_total_filters}
        )"
        ));
    }
    let hero_matches_join = if has_player_hero_cte {
        "AND (account_id, hero_id) IN t_players"
    } else {
        ""
    };
    let hero_total_join = if has_player_hero_total_cte {
        "AND (account_id, hero_id) IN t_players2"
    } else {
        ""
    };
    // Both tables carry the per-row buff scalars (see `power_up_buffs`); on player_match_stats
    // they are NULL for rows ingested before the columns existed, hence the `count(...)`
    // denominators below.
    ctes.push(format!(
        "mp AS (
        SELECT
            hero_id, account_id, match_id, won, kills, deaths, assists, net_worth, last_hits, denies,
            max_player_damage, max_player_damage_taken, max_boss_damage, max_creep_damage,
            max_neutral_damage, max_max_health, max_shots_hit, max_shots_missed,
            start_time, average_badge, permanent_buffs, first_permanent_buff_time_s
        FROM {source_table}{final_clause}
        {prewhere_clause}
        WHERE TRUE
            {player_filters}
            {where_match_filters}
            {hero_matches_join}
            {hero_total_join}
        {dedup_clause}
    )"
    ));
    let with_clause = ctes.join(",\n    ");
    // The distinct count only where a bucket reads it: it costs more than the rest of the aggregation.
    let (matches_per_bucket, distinct_matches) = if query.bucket == BucketQuery::NoBucket {
        ("matches", "")
    } else {
        (
            "sum(sum(n_distinct_matches)) OVER (PARTITION BY bucket)",
            "count(distinct match_id) AS n_distinct_matches,",
        )
    };

    group_hero_days(
        &format!(
            "sum(n_wins) AS wins,
            sum(n_losses) AS losses,
            wins + losses AS matches,
            {matches_per_bucket} AS matches_per_bucket,
            sum(sum_kills) AS total_kills,
            sum(sum_deaths) AS total_deaths,
            sum(sum_assists) AS total_assists,
            sum(sum_net_worth) AS total_net_worth,
            sum(sum_last_hits) AS total_last_hits,
            sum(sum_denies) AS total_denies,
            sum(sum_player_damage) AS total_player_damage,
            sum(sum_player_damage_taken) AS total_player_damage_taken,
            sum(sum_boss_damage) AS total_boss_damage,
            sum(sum_creep_damage) AS total_creep_damage,
            sum(sum_neutral_damage) AS total_neutral_damage,
            sum(sum_max_health) AS total_max_health,
            sum(sum_shots_hit) AS total_shots_hit,
            sum(sum_shots_missed) AS total_shots_missed,
            sum(sum_permanent_buffs) AS total_permanent_buffs,
            sum(n_permanent_buff_matches) AS permanent_buff_matches,
            sum(sum_first_permanent_buff_time_s) AS total_first_permanent_buff_time_s,
            sum(n_permanent_buff_timing_matches) AS permanent_buff_timing_matches"
        ),
        &format!(
            "
        WITH {with_clause}
        SELECT
            hero_id,
            {bucket} AS bucket,
            toDate(start_time) AS day,
            countIf(won) AS n_wins,
            countIf(not won) AS n_losses,
            n_wins + n_losses AS n_matches,
            {distinct_matches}
            sum(kills) AS sum_kills,
            sum(deaths) AS sum_deaths,
            sum(assists) AS sum_assists,
            sum(net_worth) AS sum_net_worth,
            sum(last_hits) AS sum_last_hits,
            sum(denies) AS sum_denies,
            sum(max_player_damage) AS sum_player_damage,
            sum(max_player_damage_taken) AS sum_player_damage_taken,
            sum(max_boss_damage) AS sum_boss_damage,
            sum(max_creep_damage) AS sum_creep_damage,
            sum(max_neutral_damage) AS sum_neutral_damage,
            sum(max_max_health) AS sum_max_health,
            sum(max_shots_hit) AS sum_shots_hit,
            sum(max_shots_missed) AS sum_shots_missed,
            toUInt64(sum(ifNull(permanent_buffs, 0))) AS sum_permanent_buffs,
            count(permanent_buffs) AS n_permanent_buff_matches,
            toUInt64(sum(ifNull(first_permanent_buff_time_s, 0))) AS sum_first_permanent_buff_time_s,
            count(first_permanent_buff_time_s) AS n_permanent_buff_timing_matches
        FROM mp
        GROUP BY hero_id, bucket, day"
        ),
        "hero_stats",
    )
}

// Concurrent misses of one query share a single run. by_key holds a hashed bucket lock (hits
// included) for the whole query; this endpoint runs few queries at once, so collisions are rare.
cached_ch_query! {
    fn run_query(5_000, 3600) -> Vec<AnalyticsHeroStats>;
}

async fn get_hero_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroStatsQuery,
) -> APIResult<Arc<Vec<AnalyticsHeroStats>>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_mv_query(&query).unwrap_or_else(|| build_query(&query));
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
}

#[utoipa::path(
    get,
    path = "/hero-stats",
    params(HeroStatsQuery),
    responses(
        (status = OK, description = "Hero Stats", body = [AnalyticsHeroStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Stats",
    description = "
Retrieves performance statistics for each hero based on historical match data.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(crate) async fn hero_stats(
    Query(mut query): Query<HeroStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    #[expect(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    get_hero_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn window_wide_read_dedups_with_final() {
        let sql = build_query(&HeroStatsQuery {
            min_unix_timestamp: Some(1_786_147_200),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM match_player FINAL"));
        assert!(!sql.contains("LIMIT 1 BY"));
        assert!(!sql.contains("optimize_use_projections"));
        // Match-level filters are PREWHERE under FINAL, not WHERE.
        let prewhere = sql
            .split("PREWHERE")
            .nth(1)
            .expect("FINAL read has a PREWHERE");
        let (prewhere, rest) = prewhere.split_once("WHERE").expect("PREWHERE then WHERE");
        let (where_clause, _) = rest.split_once("SELECT").expect("the CTE, then its query");
        assert!(prewhere.contains("start_time >= 1786147200"));
        assert!(!where_clause.contains("start_time"));
    }

    #[test]
    fn dedup_by_limit_keeps_match_filters_in_where() {
        let sql = build_query(&HeroStatsQuery {
            min_unix_timestamp: Some(1_786_147_200),
            min_hero_matches: Some(5),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(!sql.contains("PREWHERE"));
        assert!(sql.contains("LIMIT 1 BY"));
    }

    #[test]
    fn buff_sums_come_from_the_scalar_columns_on_every_path() {
        for query in [
            HeroStatsQuery {
                min_unix_timestamp: Some(1_786_147_200),
                min_networth: Some(1),
                ..Default::default()
            },
            HeroStatsQuery {
                account_ids: Some(vec![1, 2]),
                ..Default::default()
            },
        ] {
            let sql = build_query(&query);
            assert_valid_sql(&sql);
            assert!(sql.contains("average_badge, permanent_buffs, first_permanent_buff_time_s"));
            assert!(sql.contains("count(permanent_buffs) AS n_permanent_buff_matches"));
            assert!(!sql.contains("power_up_buffs"));
        }
        let mv = build_mv_query(&HeroStatsQuery {
            min_unix_timestamp: Some(0),
            ..Default::default()
        })
        .expect("routes to a rollup");
        assert_valid_sql(&mv);
        assert!(mv.contains("FROM hero_stats_agg_all_v2"));
        assert!(mv.contains("sum(n_matches) AS permanent_buff_matches"));
        assert!(mv.contains("GROUP BY hero_id, bucket, day"));
    }

    #[test]
    fn rollup_reads_whole_days_and_the_partial_days_from_match_player() {
        // 2026-10-05 14:00 to 2026-10-08 14:00 UTC, the window of issue #471.
        let (min, max) = (1_791_208_800, 1_791_468_000);
        let sql = build_mv_query(&HeroStatsQuery {
            min_unix_timestamp: Some(min),
            max_unix_timestamp: Some(max),
            bucket: BucketQuery::StartTimeDay,
            game_mode: Some(GameMode::Normal),
            min_average_badge: Some(50),
            ..Default::default()
        })
        .expect("routes to a rollup");
        assert_valid_sql(&sql);
        assert!(sql.contains("day >= toDate(1791244800) AND day < toDate(1791417600)"));
        // Both partial days in one scan, the badge filter pushed below the dedup.
        assert_eq!(sql.matches("UNION ALL").count(), 1);
        assert!(sql.contains(
            "((start_time >= 1791208800 AND start_time <= 1791244799) OR \
             (start_time >= 1791417600 AND start_time <= 1791468000)) AND game_mode = 1 AND \
             ifNull(average_badge, 0) >= 50\n    LIMIT 1 BY match_id, account_id"
        ));
        // Grouped by the bucket's and the filters' grain only.
        assert!(sql.contains("GROUP BY game_mode, hero_id, least_badge, day"));

        // Day-aligned: the rollup alone.
        let aligned = build_mv_query(&HeroStatsQuery {
            min_unix_timestamp: Some(1_791_244_800),
            max_unix_timestamp: Some(1_791_417_599),
            ..Default::default()
        })
        .expect("routes to a rollup");
        assert!(!aligned.contains("UNION ALL"));
        assert!(!aligned.contains("match_player"));

        // No whole day: the base table.
        assert!(
            build_mv_query(&HeroStatsQuery {
                min_unix_timestamp: Some(min),
                max_unix_timestamp: Some(min + 12 * 3600),
                ..Default::default()
            })
            .is_none()
        );
    }

    #[test]
    fn edge_rows_mirror_the_rollup_views() {
        let migration = include_str!(
            "../../../../../tools/migrations/clickhouse/50_power_up_buff_analytics.sql"
        );
        let rows = mv_rows(&EdgeRows {
            where_clause: String::new(),
            grain_select: String::new(),
            group_by: String::new(),
        });
        for line in rows.lines().filter(|l| l.contains(" AS ")) {
            let line = line.trim().trim_end_matches(',');
            assert!(migration.contains(line), "{line}");
        }
        for (col, expr) in MV_GRAIN {
            assert!(
                migration.contains(&format!("{expr} AS {col}")) || col == expr,
                "{col}"
            );
        }
    }

    #[test]
    fn trivial_hero_match_minimums_still_route_to_a_rollup() {
        for min in [0, 1] {
            let query = HeroStatsQuery {
                min_unix_timestamp: Some(0),
                min_hero_matches: Some(min),
                min_hero_matches_total: Some(min),
                ..Default::default()
            };
            assert!(build_mv_query(&query).is_some());
            let sql = build_query(&query);
            assert!(!sql.contains("t_players"));
            assert!(sql.contains("FINAL"));
        }
    }

    #[test]
    fn hero_match_maximum_applies_alongside_a_trivial_minimum() {
        let query = HeroStatsQuery {
            min_hero_matches: Some(0),
            max_hero_matches: Some(5),
            min_hero_matches_total: Some(1),
            max_hero_matches_total: Some(24),
            ..Default::default()
        };
        assert!(build_mv_query(&query).is_none());
        let sql = build_query(&query);
        assert_valid_sql(&sql);
        assert!(sql.contains("HAVING uniq(match_id) <= 5\n"));
        assert!(sql.contains("HAVING uniqExact(match_id) <= 24\n"));
        assert!(sql.contains("IN t_players\n"));
        assert!(sql.contains("IN t_players2\n"));
    }

    #[test]
    fn entire_history_filter_reads_window_accounts_with_final() {
        let sql = build_query(&HeroStatsQuery {
            min_unix_timestamp: Some(1_786_147_200),
            max_hero_matches_total: Some(24),
            game_mode: Some(GameMode::Normal),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains(
            "FROM player_match_history\n            WHERE game_mode = 1 AND account_id IN ("
        ));
        assert!(sql.contains("FROM match_player FINAL"));
        assert!(!sql.contains("LIMIT 1 BY"));
    }

    #[test]
    fn hero_match_count_spans_every_duration() {
        let sql = build_query(&HeroStatsQuery {
            min_unix_timestamp: Some(1_786_147_200),
            min_duration_s: Some(2700),
            max_duration_s: Some(3000),
            min_hero_matches: Some(10),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        let (t_players, mp) = sql.split_once("mp AS (").expect("mp CTE");
        assert!(t_players.contains("start_time >= 1786147200"));
        assert!(!t_players.contains("duration_s"));
        assert!(mp.contains("duration_s >= 2700"));
    }

    #[test]
    fn account_scoped_read_keeps_limit_by_dedup() {
        let sql = build_query(&HeroStatsQuery {
            account_ids: Some(vec![1, 2]),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM player_match_stats\n"));
        assert!(!sql.contains("FINAL"));
        assert!(sql.contains("LIMIT 1 BY match_id, account_id"));
    }

    #[test]
    fn ability_order_filter_reads_match_player_not_rollups() {
        let query = HeroStatsQuery {
            account_ids: Some(vec![1]),
            ability_order_prefix: Some(vec![1_999_680_326, 1_842_576_017]),
            ..Default::default()
        };
        assert!(build_mv_query(&query).is_none());
        let sql = build_query(&query);
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM match_player\n"));
        assert!(sql.contains("arraySlice(abilities, 1, 2) = [1999680326, 1842576017]"));

        let unlock = HeroStatsQuery {
            ability_unlock_order_prefix: Some(vec![1_999_680_326, 1_842_576_017]),
            ..Default::default()
        };
        assert!(build_mv_query(&unlock).is_none());
        let sql = build_query(&unlock);
        assert_valid_sql(&sql);
        assert!(
            sql.contains("arraySlice(arrayDistinct(abilities), 1, 2) = [1999680326, 1842576017]")
        );
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
        fn hero_stats_build_query_is_valid_sql(query: HeroStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }

        #[test]
        fn hero_stats_build_mv_query_is_valid_sql(mut query: HeroStatsQuery) {
            // Force routing into the MV path: clear the filters that disqualify it
            // and pick a min timestamp comfortably inside the horizon.
            #[expect(deprecated)]
            {
                query.account_id = None;
            }
            query.account_ids = None;
            query.include_item_ids = None;
            query.exclude_item_ids = None;
            query.min_networth = None;
            query.max_networth = None;
            query.min_duration_s = None;
            query.max_duration_s = None;
            query.min_match_id = None;
            query.max_match_id = None;
            query.min_hero_matches = None;
            query.max_hero_matches = None;
            query.min_hero_matches_total = None;
            query.max_hero_matches_total = None;
            query.ability_order_prefix = None;
            query.ability_unlock_order_prefix = None;
            query.min_unix_timestamp = Some(i64::MAX / 2);
            if let Some(mv) = build_mv_query(&query) {
                assert_valid_sql(&mv);
            }
        }
    }
}
