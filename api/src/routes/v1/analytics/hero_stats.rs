use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use strum::Display;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, PlayerFilters, filter_protected_accounts, join_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum BucketQuery {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket Hero Stats By Max Average Badge Level (tier = first digits, subtier = last digit) of both teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    AvgBadge,
    /// Bucket Hero Stats By Start Time (Hour)
    StartTimeHour,
    /// Bucket Hero Stats By Start Time (Day)
    StartTimeDay,
    /// Bucket Hero Stats By Start Time (Week)
    StartTimeWeek,
    /// Bucket Hero Stats By Start Time (Month)
    StartTimeMonth,
}

impl BucketQuery {
    fn get_select_clause(self) -> &'static str {
        match self {
            Self::NoBucket => "toUInt32(0)",
            Self::AvgBadge => "toUInt32(assumeNotNull(coalesce(average_badge, 0)))",
            Self::StartTimeHour => "toStartOfHour(start_time)",
            Self::StartTimeDay => "toStartOfDay(start_time)",
            Self::StartTimeWeek => "toDateTime(toStartOfWeek(start_time))",
            Self::StartTimeMonth => "toDateTime(toStartOfMonth(start_time))",
        }
    }

    /// Bucket expression against the pre-aggregated `hero_stats_agg` view, or `None`
    /// for buckets it cannot serve. The view is grained on `day` (a `Date`), so
    /// `StartTimeHour` needs sub-day resolution it does not keep and runs against the
    /// base table. `AvgBadge` buckets by the per-match `greatest_badge` (stored as
    /// 65535 when null, which we map back to 0 to mirror `coalesce(..., 0)`).
    fn mv_bucket_expr(self) -> Option<&'static str> {
        match self {
            Self::NoBucket => Some("toUInt32(0)"),
            Self::AvgBadge => Some("toUInt32(if(greatest_badge = 65535, 0, greatest_badge))"),
            Self::StartTimeDay => Some("toStartOfDay(toDateTime(day))"),
            Self::StartTimeWeek => Some("toDateTime(toStartOfWeek(day))"),
            Self::StartTimeMonth => Some("toDateTime(toStartOfMonth(day))"),
            Self::StartTimeHour => None,
        }
    }
}

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
    /// Filter players based on the number of matches they have played with a specific hero within the filtered time range.
    min_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero within the filtered time range.
    max_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero in their entire history.
    min_hero_matches_total: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero in their entire history.
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
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    ability_order_prefix: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players who unlocked (put their first point into) their abilities in exactly this order, e.g. `a,b` for players who unlocked `a` first and `b` second. See more: <https://api.deadlock-api.com/v1/assets/heroes>
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
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
}

impl HeroStatsQuery {
    fn has_ability_order_filter(&self) -> bool {
        self.ability_order_prefix
            .as_ref()
            .is_some_and(|v| !v.is_empty())
            || self
                .ability_unlock_order_prefix
                .as_ref()
                .is_some_and(|v| !v.is_empty())
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
}

/// Horizon of the `hero_stats_agg_v2` materialized view, in days. Keep in sync with
/// the `INTERVAL ... DAY` in the view's refresh `SELECT`.
const MV_HORIZON_DAYS: i64 = 65;
/// Safety margin below the horizon: only route windows whose start sits
/// comfortably inside the materialized range, so a just-refreshed edge (the view
/// drops the oldest day as time advances) never under-serves a request.
const MV_ROUTING_MARGIN_DAYS: i64 = 5;

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
fn build_mv_query(query: &HeroStatsQuery) -> Option<String> {
    let bucket_expr = query.bucket.mv_bucket_expr()?;
    // Per-player / per-row filters the grain cannot express → base table.
    #[expect(deprecated)]
    let personalized = query.account_id.is_some()
        || query.account_ids.as_ref().is_some_and(|v| !v.is_empty())
        || query
            .include_item_ids
            .as_ref()
            .is_some_and(|v| !v.is_empty())
        || query
            .exclude_item_ids
            .as_ref()
            .is_some_and(|v| !v.is_empty());
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

    // Pick the rollup: the hourly 65-day `hero_stats_agg` for windows that start
    // comfortably inside its horizon (freshest data), else the 6-hourly full-history
    // `hero_stats_agg_all` (covers all-time / old windows the hot view can't).
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs()
        .cast_signed();
    let oldest_servable = now - (MV_HORIZON_DAYS - MV_ROUTING_MARGIN_DAYS) * 86_400;
    let (mv_table, mv_log_comment) = if query
        .min_unix_timestamp
        .is_some_and(|min_ts| min_ts >= oldest_servable)
    {
        ("hero_stats_agg_v2", "hero_stats_mv")
    } else {
        ("hero_stats_agg_all_v2", "hero_stats_mv_all")
    };

    let mut filters = vec![GameMode::sql_filter(query.game_mode)];
    filters.extend(MatchMode::agg_sql_filter(query.match_mode.as_deref()));
    if let Some(v) = query.min_unix_timestamp {
        filters.push(format!("day >= toDate({v})"));
    }
    if let Some(v) = query.max_unix_timestamp {
        filters.push(format!("day <= toDate({v})"));
    }
    // Badge: least/greatest mirror the base table's both-teams semantics, with the
    // same >11 / <116 guards as MatchInfoFilters. Null badges are stored as
    // 0 / 65535, so any active filter excludes them just like the base table.
    if let Some(v) = query.min_average_badge
        && v > 11
    {
        filters.push(format!("least_badge >= {v}"));
    }
    if let Some(v) = query.max_average_badge
        && v < 116
    {
        filters.push(format!("greatest_badge <= {v}"));
    }
    let where_clause = filters.join(" AND ");

    let matches_per_bucket = if query.bucket == BucketQuery::NoBucket {
        "matches".to_owned()
    } else {
        "sum(sum(n_matches)) OVER (PARTITION BY bucket)".to_owned()
    };

    Some(format!(
        "
    SELECT
        hero_id,
        {bucket_expr} AS bucket,
        sum(n_wins) AS wins,
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
        sum(n_permanent_buff_timing_matches) AS permanent_buff_timing_matches
    FROM {mv_table}
    WHERE {where_clause}
    GROUP BY hero_id, bucket
    ORDER BY hero_id, bucket
    SETTINGS log_comment = '{mv_log_comment}'
    "
    ))
}

#[expect(clippy::too_many_lines)]
fn build_query(query: &HeroStatsQuery) -> String {
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
    let mut player_hero_filters = vec![];
    if let Some(min_hero_matches) = min_hero_matches {
        player_hero_filters.push(format!("uniq(match_id) >= {min_hero_matches}"));
    }
    if let Some(max_hero_matches) = max_hero_matches {
        player_hero_filters.push(format!("uniq(match_id) <= {max_hero_matches}"));
    }
    let player_hero_filters = if player_hero_filters.is_empty() {
        "TRUE".to_owned()
    } else {
        player_hero_filters.join(" AND ")
    };
    let mut player_hero_total_filters = vec![];
    if let Some(min_hero_matches) = min_hero_matches_total {
        player_hero_total_filters.push(format!("count() >= {min_hero_matches}"));
    }
    if let Some(max_hero_matches) = max_hero_matches_total {
        player_hero_total_filters.push(format!("count() <= {max_hero_matches}"));
    }
    let player_hero_total_filters = if player_hero_total_filters.is_empty() {
        "TRUE".to_owned()
    } else {
        player_hero_total_filters.join(" AND ")
    };
    let bucket = query.bucket.get_select_clause();
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    let match_filters = format!("AND {match_mode_filter} AND {game_mode_filter} {info_filters}");
    let has_player_hero_cte = min_hero_matches.is_some() || max_hero_matches.is_some();
    let has_player_hero_total_cte =
        min_hero_matches_total.is_some() || max_hero_matches_total.is_some();
    #[expect(deprecated)]
    let has_account_filter = query.account_id.is_some()
        || query
            .account_ids
            .as_ref()
            .is_some_and(|ids| !ids.is_empty());
    let has_item_filter = query
        .include_item_ids
        .as_ref()
        .is_some_and(|ids| !ids.is_empty())
        || query
            .exclude_item_ids
            .as_ref()
            .is_some_and(|ids| !ids.is_empty())
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
        (format!("PREWHERE TRUE {match_filters}"), String::new())
    } else {
        (String::new(), match_filters.clone())
    };
    let mut ctes: Vec<String> = vec![];
    if has_player_hero_cte {
        ctes.push(format!(
            "t_players AS (
            SELECT account_id, hero_id
            FROM {source_table}
            WHERE TRUE
                {player_filters}
                {match_filters}
            GROUP BY account_id, hero_id
            HAVING {player_hero_filters}
        )"
        ));
    }
    // Only the accounts in the window can pass the filter, so the history count is limited to
    // them: a primary-key range on player_match_history instead of grouping all of it (500M rows
    // into a 2-4 GiB hash table).
    if has_player_hero_total_cte {
        ctes.push(format!(
            "t_players2 AS (
            SELECT account_id, hero_id
            FROM player_match_history
            WHERE account_id IN (
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
    let matches_per_bucket = if query.bucket == BucketQuery::NoBucket {
        "matches".to_owned()
    } else {
        format!("sum(count(distinct match_id)) OVER (PARTITION BY {bucket})")
    };

    format!(
        "
    WITH {with_clause}
    SELECT
        hero_id,
        {bucket} AS bucket,
        countIf(won) AS wins,
        countIf(not won) AS losses,
        wins + losses AS matches,
        {matches_per_bucket} AS matches_per_bucket,
        sum(kills) AS total_kills,
        sum(deaths) AS total_deaths,
        sum(assists) AS total_assists,
        sum(net_worth) AS total_net_worth,
        sum(last_hits) AS total_last_hits,
        sum(denies) AS total_denies,
        sum(max_player_damage) AS total_player_damage,
        sum(max_player_damage_taken) AS total_player_damage_taken,
        sum(max_boss_damage) AS total_boss_damage,
        sum(max_creep_damage) AS total_creep_damage,
        sum(max_neutral_damage) AS total_neutral_damage,
        sum(max_max_health) AS total_max_health,
        sum(max_shots_hit) AS total_shots_hit,
        sum(max_shots_missed) AS total_shots_missed,
        toUInt64(sum(ifNull(permanent_buffs, 0))) AS total_permanent_buffs,
        count(permanent_buffs) AS permanent_buff_matches,
        toUInt64(sum(ifNull(first_permanent_buff_time_s, 0))) AS total_first_permanent_buff_time_s,
        count(first_permanent_buff_time_s) AS permanent_buff_timing_matches
    FROM mp
    GROUP BY hero_id, bucket
    ORDER BY hero_id, bucket
    SETTINGS log_comment = 'hero_stats', apply_patch_parts = 0
    "
    )
}

// Concurrent misses of one query share a single run. by_key holds a hashed bucket lock (hits
// included) for the whole query; this endpoint runs few queries at once, so collisions are rare.
#[cached(
    max_size = 5_000,
    ttl_secs = 21600,
    sync_writes = "by_key",
    sync_writes_buckets = 1024,
    convert = "{ query_str.to_string() }",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<AnalyticsHeroStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_hero_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroStatsQuery,
) -> APIResult<Vec<AnalyticsHeroStats>> {
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
    if query.game_mode.is_some_and(|g| g == GameMode::StreetBrawl)
        && (query.min_average_badge.is_some() || query.max_average_badge.is_some())
    {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Cannot filter by average badge for street brawl game mode".to_string(),
        });
    }
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
        let (prewhere, where_clause) = prewhere.split_once("WHERE").expect("PREWHERE then WHERE");
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
            assert!(sql.contains("count(permanent_buffs) AS permanent_buff_matches"));
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
        assert!(sql.contains("HAVING count() <= 24\n"));
        assert!(sql.contains("IN t_players\n"));
        assert!(sql.contains("IN t_players2\n"));
    }

    #[test]
    fn entire_history_filter_reads_window_accounts_with_final() {
        let sql = build_query(&HeroStatsQuery {
            min_unix_timestamp: Some(1_786_147_200),
            max_hero_matches_total: Some(24),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM player_match_history\n            WHERE account_id IN ("));
        assert!(sql.contains("FROM match_player FINAL"));
        assert!(!sql.contains("LIMIT 1 BY"));
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
