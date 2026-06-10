#![allow(clippy::large_stack_arrays)]

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TtlCache;
use cached::macros::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use strum::Display;
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, PlayerFilters, default_min_matches_u32, filter_protected_accounts,
    join_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

fn default_min_matches() -> Option<u32> {
    default_min_matches_u32()
}

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum BucketQuery {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket Item Stats By Hero
    Hero,
    /// Bucket Item Stats By Team
    Team,
    /// Bucket Item Stats By Start Time (Hour)
    StartTimeHour,
    /// Bucket Item Stats By Start Time (Day)
    StartTimeDay,
    /// Bucket Item Stats By Start Time (Week)
    StartTimeWeek,
    /// Bucket Item Stats By Start Time (Month)
    StartTimeMonth,
    /// Bucket Item Stats by Game Time (Minutes)
    GameTimeMin,
    /// Bucket Item Stats by Game Time Normalized with the match duration
    GameTimeNormalizedPercentage,
    /// Bucket Item Stats by Net Worth (grouped by 1000)
    #[serde(rename = "net_worth_by_1000")]
    #[strum(to_string = "net_worth_by_1000")]
    NetWorthBy1000,
    /// Bucket Item Stats by Net Worth (grouped by 2000)
    #[serde(rename = "net_worth_by_2000")]
    #[strum(to_string = "net_worth_by_2000")]
    NetWorthBy2000,
    /// Bucket Item Stats by Net Worth (grouped by 3000)
    #[serde(rename = "net_worth_by_3000")]
    #[strum(to_string = "net_worth_by_3000")]
    NetWorthBy3000,
    /// Bucket Item Stats by Net Worth (grouped by 5000)
    #[serde(rename = "net_worth_by_5000")]
    #[strum(to_string = "net_worth_by_5000")]
    NetWorthBy5000,
    /// Bucket Item Stats by Net Worth (grouped by 10000)
    #[serde(rename = "net_worth_by_10000")]
    #[strum(to_string = "net_worth_by_10000")]
    NetWorthBy10000,
}

// Per-purchase net worth at buy time. Precomputed at write time into the
// MATERIALIZED column `items.net_worth_at_buy` and exposed via the ARRAY JOIN
// alias `net_worth_at_buy` (see build_query). This avoids reading the large
// `stats.net_worth`/`stats.time_stamp_s` time-series arrays and the per-purchase
// `arrayFirstIndex` search, which was ~44% of a net-worth-bucket query's cost.
const NET_WORTH_AT_BUY_EXPR: &str = "net_worth_at_buy";

impl BucketQuery {
    fn get_select_clause(self) -> String {
        match self {
            Self::NoBucket => "toUInt32(0)".to_owned(),
            Self::Hero => "hero_id".to_owned(),
            Self::Team => "toUInt32(if(team = 'Team0', 0, 1))".to_owned(),
            Self::StartTimeHour => "toStartOfHour(start_time)".to_owned(),
            Self::StartTimeDay => "toStartOfDay(start_time)".to_owned(),
            Self::StartTimeWeek => "toDateTime(toStartOfWeek(start_time))".to_owned(),
            Self::StartTimeMonth => "toDateTime(toStartOfMonth(start_time))".to_owned(),
            Self::GameTimeMin => "toUInt32(floor(buy_time / 60))".to_owned(),
            Self::GameTimeNormalizedPercentage => {
                "toUInt32(floor((buy_time - 1) / duration_s * 100))".to_owned()
            }
            Self::NetWorthBy1000 => {
                format!("toUInt32(floor(({NET_WORTH_AT_BUY_EXPR}) / 1000) * 1000)")
            }
            Self::NetWorthBy2000 => {
                format!("toUInt32(floor(({NET_WORTH_AT_BUY_EXPR}) / 2000) * 2000)")
            }
            Self::NetWorthBy3000 => {
                format!("toUInt32(floor(({NET_WORTH_AT_BUY_EXPR}) / 3000) * 3000)")
            }
            Self::NetWorthBy5000 => {
                format!("toUInt32(floor(({NET_WORTH_AT_BUY_EXPR}) / 5000) * 5000)")
            }
            Self::NetWorthBy10000 => {
                format!("toUInt32(floor(({NET_WORTH_AT_BUY_EXPR}) / 10000) * 10000)")
            }
        }
    }

    /// Whether this bucket's select clause references `net_worth_at_buy`, so the
    /// base query knows to ARRAY JOIN the precomputed `items.net_worth_at_buy`.
    fn needs_net_worth_at_buy(self) -> bool {
        matches!(
            self,
            Self::NetWorthBy1000
                | Self::NetWorthBy2000
                | Self::NetWorthBy3000
                | Self::NetWorthBy5000
                | Self::NetWorthBy10000
        )
    }

    /// Bucket expression against the pre-aggregated `item_stats_agg` view, or
    /// `None` for buckets the view cannot serve. Net-worth and game-time buckets
    /// need per-purchase data, and `StartTimeHour` needs sub-day resolution the
    /// day-grained view does not keep; those run against the base table.
    fn mv_bucket_expr(self) -> Option<&'static str> {
        match self {
            Self::NoBucket => Some("toUInt32(0)"),
            Self::Hero => Some("hero_id"),
            Self::Team => Some("toUInt32(if(team = 'Team0', 0, 1))"),
            Self::StartTimeDay => Some("toStartOfDay(toDateTime(day))"),
            Self::StartTimeWeek => Some("toDateTime(toStartOfWeek(day))"),
            Self::StartTimeMonth => Some("toDateTime(toStartOfMonth(day))"),
            Self::StartTimeHour
            | Self::GameTimeMin
            | Self::GameTimeNormalizedPercentage
            | Self::NetWorthBy1000
            | Self::NetWorthBy2000
            | Self::NetWorthBy3000
            | Self::NetWorthBy5000
            | Self::NetWorthBy10000 => None,
        }
    }
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct ItemStatsQuery {
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
    /// Filter matches based on the hero IDs. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Filter matches based on the hero ID. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[deprecated(note = "Use hero_ids instead")]
    hero_id: Option<u32>,
    /// Filter to matches where one or more of these heroes were on the opposing team. Comma separated. When set, returns "what items beat hero(es) X?" stats. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    enemy_hero_ids: Option<Vec<u32>>,
    /// When `true`, requires *all* of the specified `enemy_hero_ids` to be on the same enemy team. When `false` (default), matches if *any* of the specified hero(es) are on the enemy team. Ignored when `enemy_hero_ids` is unset.
    enemy_hero_ids_all_match: Option<bool>,
    /// Filter the specified enemy hero(es) by their final net worth. Ignored when `enemy_hero_ids` is unset.
    min_enemy_networth: Option<u64>,
    /// Filter the specified enemy hero(es) by their final net worth. Ignored when `enemy_hero_ids` is unset.
    max_enemy_networth: Option<u64>,
    /// When `true`, only counts buyers in the same `assigned_lane` as one of the specified enemy heroes. Ignored when `enemy_hero_ids` is unset. **Default:** `false`.
    same_lane_filter: Option<bool>,
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
    /// Comma separated list of item ids to include. See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude. See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    exclude_item_ids: Option<Vec<u32>>,
    /// The minimum number of matches played for an item to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
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
    /// Filter items bought after this game time (seconds).
    min_bought_at_s: Option<u32>,
    /// Filter items bought before this game time (seconds).
    max_bought_at_s: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ItemStats {
    /// See more: <https://api.deadlock-api.com/v1/assets/items>
    pub item_id: u32,
    pub bucket: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    players: u64,
    /// Average buy time in seconds (absolute)
    pub avg_buy_time_s: f64,
    /// Average sell time in seconds (absolute, for items that were sold)
    pub avg_sell_time_s: f64,
    /// Average buy time as percentage of match duration
    pub avg_buy_time_relative: f64,
    /// Average sell time as percentage of match duration (for items that were sold)
    pub avg_sell_time_relative: f64,
}

/// Horizon of the `item_stats_agg` materialized view, in days. Keep in sync with
/// the `INTERVAL ... DAY` in `clickhouse/item_stats_agg.sql`.
const MV_HORIZON_DAYS: i64 = 65;
/// Horizon of the `item_cohort_stats_*_agg` views, in days. Shorter than
/// `MV_HORIZON_DAYS` because the cohort cross-join makes their refresh far
/// heavier; sized to cover the default 30-day window plus routing margin. Keep
/// in sync with `tools/migrations/clickhouse/31_create_item_cohort_stats_agg.sql`.
const COHORT_MV_HORIZON_DAYS: i64 = 35;
/// Safety margin below the horizon: only route windows whose start sits
/// comfortably inside the materialized range, so a just-refreshed edge (the view
/// drops the oldest day as time advances) never under-serves a request.
const MV_ROUTING_MARGIN_DAYS: i64 = 5;

/// Builds a query against the pre-aggregated `item_stats_agg` view when the
/// request falls within the "global meta" subset it materializes, else `None`
/// (the caller then uses the base-table query). See `clickhouse/item_stats_agg.sql`
/// for the grain and the list of what is and isn't covered.
fn build_mv_query(query: &ItemStatsQuery) -> Option<String> {
    let bucket_expr = query.bucket.mv_bucket_expr()?;

    // Fold the deprecated single hero_id into hero_ids.
    let mut hero_ids = query.hero_ids.clone().unwrap_or_default();
    #[allow(deprecated)]
    if let Some(hero_id) = query.hero_id {
        hero_ids.push(hero_id);
    }

    // The view only covers the shared, non-personalized subset. Anything needing
    // per-purchase data, item-set membership, per-account/enemy context, or a
    // dimension not in the grain (sub-day time, match_id, duration, final net
    // worth, buy time) must use the base table.
    #[allow(deprecated)]
    let personalized = query.account_id.is_some()
        || query.account_ids.as_ref().is_some_and(|v| !v.is_empty())
        || query.enemy_hero_ids.as_ref().is_some_and(|v| !v.is_empty())
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
        || query.min_bought_at_s.is_some()
        || query.max_bought_at_s.is_some()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some();
    if personalized || unsupported_filter {
        return None;
    }

    // The view only holds the last MV_HORIZON_DAYS days; older windows use base.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs()
        .cast_signed();
    let oldest_servable = now - (MV_HORIZON_DAYS - MV_ROUTING_MARGIN_DAYS) * 86_400;
    if query
        .min_unix_timestamp
        .is_none_or(|min_ts| min_ts < oldest_servable)
    {
        return None;
    }

    /* ---------- filters (all on item_stats_agg columns) ---------- */
    let mut filters = vec![GameMode::sql_filter(query.game_mode)];
    if let Some(v) = query.min_unix_timestamp {
        filters.push(format!("day >= toDate({v})"));
    }
    if let Some(v) = query.max_unix_timestamp {
        filters.push(format!("day <= toDate({v})"));
    }
    // Badge: least/greatest mirror the base table's both-teams semantics, with the
    // same >11 / <116 guards as MatchInfoFilters. NULL badges are stored as
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
    if !hero_ids.is_empty() {
        filters.push(format!(
            "hero_id IN ({})",
            hero_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    let where_clause = filters.join(" AND ");

    /* ---------- HAVING (identical to base) ---------- */
    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("matches >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };

    // The per-row averages equal the base query's avg()/avgIf(): the denominators
    // (matches, n_sold) are the same counts.
    Some(format!(
        "
SELECT
    item_id,
    {bucket_expr}    AS bucket,
    sum(n_wins)                  AS wins,
    sum(n_matches) - sum(n_wins) AS losses,
    sum(n_matches)               AS matches,
    uniqMerge(players_state)     AS players,
    sum(sum_buy_time) / sum(n_matches)                       AS avg_buy_time_s,
    if(sum(n_sold) = 0, 0, sum(sum_sold_time) / sum(n_sold)) AS avg_sell_time_s,
    sum(sum_buy_rel) / sum(n_matches)                        AS avg_buy_time_relative,
    if(sum(n_sold) = 0, 0, sum(sum_sold_rel) / sum(n_sold))  AS avg_sell_time_relative
FROM item_stats_agg
WHERE {where_clause}
GROUP BY item_id, bucket
{having_clause}
ORDER BY item_id, bucket
SETTINGS log_comment = 'item_stats_mv'
        "
    ))
}

/// Bucket support against the cohort rollups: returns the rollup table and the
/// bucket expression, or `None` for buckets they cannot serve. The time-grained
/// view stores per-minute buckets, so any coarser grouping (no bucket, start-time
/// day/week/month) merges its states exactly; the net-worth view stores step-1000
/// buckets, so the wider steps (all multiples of 1000) re-bucket exactly.
fn cohort_mv_bucket(bucket: BucketQuery) -> Option<(&'static str, String)> {
    const TIME_AGG: &str = "item_cohort_stats_time_agg";
    const NW_AGG: &str = "item_cohort_stats_net_worth_agg";
    match bucket {
        BucketQuery::NoBucket => Some((TIME_AGG, "toUInt32(0)".to_owned())),
        BucketQuery::StartTimeDay => Some((TIME_AGG, "toStartOfDay(toDateTime(day))".to_owned())),
        BucketQuery::StartTimeWeek => Some((TIME_AGG, "toDateTime(toStartOfWeek(day))".to_owned())),
        BucketQuery::StartTimeMonth => {
            Some((TIME_AGG, "toDateTime(toStartOfMonth(day))".to_owned()))
        }
        BucketQuery::GameTimeMin => Some((TIME_AGG, "bucket_minute".to_owned())),
        BucketQuery::NetWorthBy1000 => Some((NW_AGG, "bucket_net_worth".to_owned())),
        BucketQuery::NetWorthBy2000 => Some((
            NW_AGG,
            "toUInt32(floor(bucket_net_worth / 2000) * 2000)".to_owned(),
        )),
        BucketQuery::NetWorthBy3000 => Some((
            NW_AGG,
            "toUInt32(floor(bucket_net_worth / 3000) * 3000)".to_owned(),
        )),
        BucketQuery::NetWorthBy5000 => Some((
            NW_AGG,
            "toUInt32(floor(bucket_net_worth / 5000) * 5000)".to_owned(),
        )),
        BucketQuery::NetWorthBy10000 => Some((
            NW_AGG,
            "toUInt32(floor(bucket_net_worth / 10000) * 10000)".to_owned(),
        )),
        // Hero/team need dimensions the cohort grain dropped; the normalized
        // game-time bucket needs per-match duration; sub-day windows need
        // sub-day resolution.
        BucketQuery::Hero
        | BucketQuery::Team
        | BucketQuery::StartTimeHour
        | BucketQuery::GameTimeNormalizedPercentage => None,
    }
}

/// Builds a query against the `item_cohort_stats_*_agg` rollups for the
/// single-cohort-item shape (`include_item_ids` with exactly one id and no
/// granular filters), else `None`. This is the shape that otherwise full-scans
/// the base table: the hasAll cohort filter cannot prune any granule.
fn build_cohort_mv_query(query: &ItemStatsQuery) -> Option<String> {
    let cohort_item_id = match query.include_item_ids.as_deref() {
        Some([id]) => *id,
        _ => return None,
    };
    let (table, bucket_expr) = cohort_mv_bucket(query.bucket)?;

    // The rollup grain is (game_mode, day, cohort_item, item, bucket); anything
    // outside it falls back. Badge bounds use the same >11 / <116 no-op guards
    // as MatchInfoFilters. Hero-filtered cohort queries are deliberately
    // excluded: they are served fast by the base-table projection.
    #[allow(deprecated)]
    let unsupported = query.hero_id.is_some()
        || query.hero_ids.as_ref().is_some_and(|v| !v.is_empty())
        || query.account_id.is_some()
        || query.account_ids.as_ref().is_some_and(|v| !v.is_empty())
        || query.enemy_hero_ids.as_ref().is_some_and(|v| !v.is_empty())
        || query
            .exclude_item_ids
            .as_ref()
            .is_some_and(|v| !v.is_empty())
        || query.min_networth.is_some()
        || query.max_networth.is_some()
        || query.min_duration_s.is_some()
        || query.max_duration_s.is_some()
        || query.min_bought_at_s.is_some()
        || query.max_bought_at_s.is_some()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some()
        || query.min_average_badge.is_some_and(|v| v > 11)
        || query.max_average_badge.is_some_and(|v| v < 116);
    if unsupported {
        return None;
    }

    // The views only hold the last COHORT_MV_HORIZON_DAYS days; older windows
    // use the base table.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs()
        .cast_signed();
    let oldest_servable = now - (COHORT_MV_HORIZON_DAYS - MV_ROUTING_MARGIN_DAYS) * 86_400;
    if query
        .min_unix_timestamp
        .is_none_or(|min_ts| min_ts < oldest_servable)
    {
        return None;
    }

    let mut filters = vec![
        GameMode::sql_filter(query.game_mode),
        format!("cohort_item_id = {cohort_item_id}"),
    ];
    if let Some(v) = query.min_unix_timestamp {
        filters.push(format!("day >= toDate({v})"));
    }
    if let Some(v) = query.max_unix_timestamp {
        filters.push(format!("day <= toDate({v})"));
    }
    let where_clause = filters.join(" AND ");

    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("matches >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };

    Some(format!(
        "
SELECT
    item_id,
    {bucket_expr}    AS bucket,
    sum(n_wins)                  AS wins,
    sum(n_matches) - sum(n_wins) AS losses,
    sum(n_matches)               AS matches,
    uniqMerge(players_state)     AS players,
    sum(sum_buy_time) / sum(n_matches)                       AS avg_buy_time_s,
    if(sum(n_sold) = 0, 0, sum(sum_sold_time) / sum(n_sold)) AS avg_sell_time_s,
    sum(sum_buy_rel) / sum(n_matches)                        AS avg_buy_time_relative,
    if(sum(n_sold) = 0, 0, sum(sum_sold_rel) / sum(n_sold))  AS avg_sell_time_relative
FROM {table}
WHERE {where_clause}
GROUP BY item_id, bucket
{having_clause}
ORDER BY item_id, bucket
SETTINGS log_comment = 'item_stats_cohort_mv'
        "
    ))
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &ItemStatsQuery) -> String {
    /* ---------- match_info filters ---------- */
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

    /* ---------- match_player filters ---------- */
    let mut hero_ids = query.hero_ids.clone().unwrap_or_default();
    #[allow(deprecated)]
    if let Some(hero_id) = query.hero_id {
        hero_ids.push(hero_id);
    }
    let has_buyer_hero_filter = !hero_ids.is_empty();
    #[allow(deprecated)]
    let mut player_filters = PlayerFilters {
        hero_ids: if hero_ids.is_empty() {
            None
        } else {
            Some(&hero_ids)
        },
        account_id: query.account_id,
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
        ..Default::default()
    }
    .build();
    if let Some(min_bought_at_s) = query.min_bought_at_s {
        player_filters.push(format!("buy_time >= {min_bought_at_s}"));
    }
    if let Some(max_bought_at_s) = query.max_bought_at_s {
        player_filters.push(format!("buy_time <= {max_bought_at_s}"));
    }
    let player_filters = join_filters(&player_filters);

    /* ---------- misc ---------- */
    let bucket_expr = query.bucket.get_select_clause();

    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("matches >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };

    /* ---------- enemy-team filter (optional) ---------- */
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let enemy_hero_ids = query
        .enemy_hero_ids
        .as_deref()
        .filter(|ids| !ids.is_empty());
    let (enemy_cte, enemy_join, enemy_where) = if let Some(ids) = enemy_hero_ids {
        let unique_ids: Vec<u32> = ids.iter().copied().sorted().dedup().collect();
        let mut enemy_having = vec![];
        if query.enemy_hero_ids_all_match == Some(true) {
            enemy_having.push(format!("uniqExact(hero_id) = {}", unique_ids.len()));
        }
        if let Some(v) = query.min_enemy_networth {
            enemy_having.push(format!("min(net_worth) >= {v}"));
        }
        if let Some(v) = query.max_enemy_networth {
            enemy_having.push(format!("max(net_worth) <= {v}"));
        }
        let enemy_having_clause = if enemy_having.is_empty() {
            String::new()
        } else {
            format!("\n        HAVING {}", enemy_having.join(" AND "))
        };
        let same_lane = query.same_lane_filter == Some(true);
        let lanes_col = if same_lane {
            ",\n            groupUniqArray(assigned_lane) AS enemy_lanes"
        } else {
            ""
        };
        let cte = format!(
            "t_enemy_teams AS (
        SELECT
            match_id,
            team AS enemy_team{lanes_col}
        FROM match_player
        WHERE match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters}
            AND team IN ('Team0', 'Team1')
            AND hero_id IN ({})
        GROUP BY match_id, team{enemy_having_clause}
    )",
            unique_ids.iter().map(ToString::to_string).join(", ")
        );
        let lane_filter = if same_lane {
            "\n            AND has(et.enemy_lanes, assigned_lane)"
        } else {
            ""
        };
        let join = "\n    INNER JOIN t_enemy_teams et USING (match_id)".to_owned();
        let where_extra = format!("\n        AND et.enemy_team != team{lane_filter}");
        (cte, join, where_extra)
    } else {
        (String::new(), String::new(), String::new())
    };

    /* ---------- final query ----------
     *
     * Flat parallel ARRAY JOIN avoids the per-row temporary tuple array that
     * `arrayZip(...) AS tpl` allocates. The `items.item_id`, `items.game_time_s`
     * and `items.sold_time_s` arrays are joined in lockstep; the alias names
     * (`item_id`, `buy_time`, `sold_time`) shadow but do not consume the
     * originals, so `hasAll(items.item_id, ...)` / `not hasAny(items.item_id, ...)`
     * (emitted by PlayerFilters for include/exclude_item_ids) still see the
     * full per-row arrays.
     */
    let mut settings = vec!["log_comment = 'item_stats'", "apply_patch_parts = 0"];
    /*
     * The `item_stats_by_hero_mode_badge` projection is sorted hero_id-first, so any
     * query WITHOUT a buyer hero filter cannot prune it and full-scans the entire
     * projection (~228M rows / ~31 GiB for a 30-day window). The base table serves the
     * same no-hero shapes far more cheaply via its skip indexes (idx_start_time minmax
     * for the time window, account_id bloom for account filters): benchmarked at ~5-8x
     * less I/O and wall time for item-, badge-, and account-filtered no-hero queries.
     *
     * Hero-filtered queries keep the projection: hero_id is its most selective prefix
     * (~2.3% per hero) and, combined with start_time, prunes to ~0.15% of the table, so
     * we disable projections only when there is no buyer hero filter. The single
     * near-neutral case is an all-time query (no start_time bound), where the base table
     * cannot prune by time — but it still reads less I/O, and such queries are rare.
     *
     * (Originally this carve-out covered only account-only shapes; it was generalized to
     * all no-hero shapes after benchmarking the projection vs base-table access paths.)
     */
    if !has_buyer_hero_filter {
        settings.push("optimize_use_projections = 0");
    }
    let settings_clause = settings.join(", ");
    let match_filters =
        format!("match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters}");
    /*
     * The no-hero path reads the materialized `upgrades.*` columns (migration 30):
     * upgrade-only elements with buy_time > 0, baked in at insert time, so the
     * `item_id IN t_upgrades AND buy_time > 0` filter and ~47% of the array bytes
     * disappear. The hero-filtered path must keep `items.*` + the query-time
     * filter: it is served by the item_stats_by_hero_mode_badge projection, which
     * does not contain the upgrades.* columns, so referencing them would silently
     * disable the projection.
     */
    let (items_array_join, upgrade_filter, nw_col) = if has_buyer_hero_filter {
        (
            "items.item_id      AS item_id,\n    items.game_time_s  AS buy_time,\n    items.sold_time_s  AS sold_time",
            "\n    AND item_id IN t_upgrades AND buy_time > 0",
            ",\n    `items.net_worth_at_buy` AS net_worth_at_buy",
        )
    } else {
        (
            "`upgrades.item_id`      AS item_id,\n    `upgrades.game_time_s`  AS buy_time,\n    `upgrades.sold_time_s`  AS sold_time",
            "",
            ",\n    `upgrades.net_worth_at_buy` AS net_worth_at_buy",
        )
    };
    // Only ARRAY JOIN the precomputed net-worth column when a net-worth bucket
    // needs it, so other buckets don't pay to read it.
    let nw_array_join = if query.bucket.needs_net_worth_at_buy() {
        nw_col
    } else {
        ""
    };
    let mut ctes = vec![];
    if has_buyer_hero_filter {
        ctes.push("t_upgrades AS (SELECT id FROM items WHERE type = 'upgrade')".to_owned());
    }
    if !enemy_cte.is_empty() {
        ctes.push(enemy_cte);
    }
    let with_clause = if ctes.is_empty() {
        String::new()
    } else {
        format!("WITH {}", ctes.join(",\n    "))
    };
    format!(
        "
{with_clause}
SELECT
    item_id,
    {bucket_expr}    AS bucket,
    countIf(won)         AS wins,
    countIf(not won)     AS losses,
    wins + losses    AS matches,
    uniq(account_id) AS players,
    avg(buy_time) AS avg_buy_time_s,
    coalesce(avgIf(sold_time, sold_time > 0), 0) AS avg_sell_time_s,
    avg((buy_time / duration_s) * 100) AS avg_buy_time_relative,
    coalesce(avgIf((sold_time / duration_s) * 100, sold_time > 0), 0) AS avg_sell_time_relative
FROM match_player{enemy_join}
ARRAY JOIN
    {items_array_join}{nw_array_join}
WHERE {match_filters}{enemy_where}{upgrade_filter}
    {player_filters}
GROUP BY item_id, bucket
{having_clause}
ORDER BY item_id, bucket
SETTINGS {settings_clause}
        "
    )
}

#[cached(
    ty = "TtlCache<String, Vec<ItemStats>>",
    create = "{ TtlCache::with_ttl(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<ItemStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_item_stats(
    ch_client: &clickhouse::Client,
    mut query: ItemStatsQuery,
) -> APIResult<Vec<ItemStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    // Prefer the pre-aggregated item_stats_agg view for the global-meta subset of
    // parameters; fall back to the base table for everything else, and on any MV
    // error so a missing or rebuilding view never breaks the endpoint.
    if let Some(mv_query) = build_mv_query(&query) {
        debug!(?mv_query);
        match run_query(ch_client, &mv_query).await {
            Ok(rows) => return Ok(rows),
            Err(e) => warn!("item_stats MV query failed, falling back to base table: {e}"),
        }
    }
    if let Some(cohort_mv_query) = build_cohort_mv_query(&query) {
        debug!(?cohort_mv_query);
        match run_query(ch_client, &cohort_mv_query).await {
            Ok(rows) => return Ok(rows),
            Err(e) => warn!("item_stats cohort MV query failed, falling back to base table: {e}"),
        }
    }
    let base_query = build_query(&query);
    debug!(?base_query);
    Ok(run_query(ch_client, &base_query).await?)
}

#[utoipa::path(
    get,
    path = "/item-stats",
    params(ItemStatsQuery),
    responses(
        (status = OK, description = "Item Stats", body = [ItemStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch item stats")
    ),
    tags = ["Analytics"],
    summary = "Item Stats",
    description = "
Retrieves item statistics based on historical match data.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(crate) async fn item_stats(
    Query(mut query): Query<ItemStatsQuery>,
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
    #[allow(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    get_item_stats(&state.ch_client_cached, query)
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
        #[allow(deprecated)]
        fn item_stats_build_query_is_valid_sql(query: ItemStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }

        #[test]
        #[allow(deprecated)]
        fn item_stats_build_mv_query_is_valid_sql(query: ItemStatsQuery) {
            if let Some(sql) = build_mv_query(&query) {
                assert_valid_sql(&sql);
            }
        }
    }
}
