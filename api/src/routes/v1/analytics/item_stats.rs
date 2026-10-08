use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use strum::Display;
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    CORRUPTED_ITEMS_MIN_MATCH_ID, CORRUPTED_ITEMS_MIN_UNIX_TIMESTAMP, MatchInfoFilters,
    PlayerFilters, account_match_prefilter, corrupted_sql, default_min_matches_u32,
    filter_protected_accounts, join_filters, not_corrupted_sql, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{
    comma_separated_chains_deserialize_option, comma_separated_deserialize_option,
    default_last_month_timestamp, parse_steam_id_option,
};
use crate::utils::sql::{
    MAX_FILTERING_AVERAGE_BADGE, MIN_FILTERING_AVERAGE_BADGE, cached_ch_query, having_clause,
    id_list, impl_match_info,
};

/// Maximum number of independent `item_order` chains accepted per request.
const MAX_ITEM_ORDER_CHAINS: usize = 10;
/// Maximum number of item ids in a single `item_order` chain.
const MAX_ITEM_ORDER_LEN: usize = 10;

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
            Self::Hero => "toUInt32(hero_id)".to_owned(),
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
            Self::Hero => Some("toUInt32(hero_id)"),
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

/// How corrupted purchases are counted. Build 6712+: the Broker swaps a T3/T4 upgrade for a
/// corrupted version that keeps the normal item's id.
#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum CorruptedItemsFilter {
    /// Only normal purchases. Corrupted purchases are left out.
    #[default]
    Exclude,
    /// Count corrupted purchases as purchases of the normal item.
    Include,
    /// Only corrupted purchases: stats for the corrupted variant of each item.
    Only,
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
    /// Filter by purchase order. Each value is a comma-separated, ordered list of item
    /// ids (e.g. `1396247347,3977876567`). This is a *constraint*, not an inclusion
    /// filter: for each adjacent pair in the list, a match is excluded only when the
    /// player bought **both** items but bought the later one first. Builds missing
    /// either item are unaffected. Repeat the parameter for multiple independent
    /// orderings. See more: <https://api.deadlock-api.com/v1/assets/items>
    #[param(value_type = Option<Vec<String>>)]
    #[serde(
        default,
        deserialize_with = "comma_separated_chains_deserialize_option"
    )]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_chains()")
    )]
    item_order: Option<Vec<Vec<u32>>>,
    /// How to count corrupted items (build 6712+: a T3/T4 upgrade that the Broker swapped for a corrupted version with the same item id). `exclude`: only normal purchases. `include`: corrupted purchases count as the normal item. `only`: only corrupted purchases, so each row describes the corrupted variant of `item_id`. Compare it with the same request using `exclude`. Corrupted items only exist in matches from 2026-09-29 on, so `only` ignores earlier time and match-id bounds. `include` and `only` skip the pre-aggregated rollups, so those requests are slower. **Default:** `exclude`, or `include` if the deprecated `include_corrupted_items=true` is set.
    #[serde(default)]
    #[param(inline)]
    corrupted_items: Option<CorruptedItemsFilter>,
    /// Deprecated alias of `corrupted_items=include`. `corrupted_items` takes precedence when both are set.
    #[serde(default)]
    #[param(default = false)]
    #[deprecated(note = "Use corrupted_items=include instead")]
    include_corrupted_items: Option<bool>,
}

impl_match_info!(ItemStatsQuery);

impl ItemStatsQuery {
    #[expect(deprecated)]
    fn corrupted_items(&self) -> CorruptedItemsFilter {
        self.corrupted_items
            .unwrap_or(if self.include_corrupted_items == Some(true) {
                CorruptedItemsFilter::Include
            } else {
                CorruptedItemsFilter::Exclude
            })
    }

    /// Whether corrupted purchases are counted at all. The rollups are built from
    /// `upgrades.*`, which has none, so such requests always go to the base table.
    fn reads_corrupted(&self) -> bool {
        self.corrupted_items() != CorruptedItemsFilter::Exclude
    }

    /// `corrupted_items=only` with a time or match-id upper bound before the first match that
    /// can contain a corrupted item: the result is empty, so no query needs to run.
    fn corrupted_only_range_is_empty(&self) -> bool {
        self.corrupted_items() == CorruptedItemsFilter::Only
            && (self
                .max_unix_timestamp
                .is_some_and(|v| v < CORRUPTED_ITEMS_MIN_UNIX_TIMESTAMP)
                || self
                    .max_match_id
                    .is_some_and(|v| v < CORRUPTED_ITEMS_MIN_MATCH_ID))
    }

    fn has_ability_order_filter(&self) -> bool {
        self.ability_order_prefix
            .as_ref()
            .is_some_and(|v| !v.is_empty())
            || self
                .ability_unlock_order_prefix
                .as_ref()
                .is_some_and(|v| !v.is_empty())
    }
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

// All rollups below (`item_stats_agg`, `item_cohort_stats_*_agg_v2`, `item_enemy_stats_agg`)
// are built from the `upgrades.*` arrays, which exclude corrupted purchases (migration 42),
// and keep no per-purchase corruption dimension: `corrupted_items` `include`/`only` requests
// always go to the base table.

/// Horizon of the `item_stats_agg` materialized view, in days. Keep in sync with
/// the `INTERVAL ... DAY` in `clickhouse/item_stats_agg.sql`.
const MV_HORIZON_DAYS: i64 = 65;
/// Horizon of the `item_cohort_stats_*_agg` tables, in days. Matches
/// `MV_HORIZON_DAYS` so cohort queries over the current-patch window (a fixed
/// start date, often >30 days back) route to the rollup instead of the base
/// table. Also bounds `item_enemy_stats_agg`, which the same job maintains. Keep in
/// sync with `HORIZON_DAYS` in `services/cohort_agg_refresh.rs`
/// and the backfill range in
/// `tools/migrations/clickhouse/32_cohort_agg_incremental.sql`.
const COHORT_MV_HORIZON_DAYS: i64 = 65;
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
    #[expect(deprecated)]
    if let Some(hero_id) = query.hero_id {
        hero_ids.push(hero_id);
    }

    // The view only covers the shared, non-personalized subset. Anything needing
    // per-purchase data, item-set membership, per-account/enemy context, or a
    // dimension not in the grain (sub-day time, match_id, duration, final net
    // worth, buy time), or a match mode the view does not ingest, must use the base table.
    #[expect(deprecated)]
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
        || query.item_order.as_ref().is_some_and(|v| !v.is_empty())
        || query.has_ability_order_filter()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some()
        || query.reads_corrupted()
        || !MatchMode::is_agg_servable(query.match_mode.as_deref());
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
    filters.extend(MatchMode::agg_sql_filter(query.match_mode.as_deref()));
    if let Some(v) = query.min_unix_timestamp {
        filters.push(format!("day >= toDate({v})"));
    }
    if let Some(v) = query.max_unix_timestamp {
        filters.push(format!("day <= toDate({v})"));
    }
    // Badge: least/greatest mirror the base table's both-teams semantics, with the
    // same badge guards as MatchInfoFilters. NULL badges are stored as
    // 0 / 65535, so any active filter excludes them just like the base table.
    if let Some(v) = query.min_average_badge
        && v > MIN_FILTERING_AVERAGE_BADGE
    {
        filters.push(format!("least_badge >= {v}"));
    }
    if let Some(v) = query.max_average_badge
        && v < MAX_FILTERING_AVERAGE_BADGE
    {
        filters.push(format!("greatest_badge <= {v}"));
    }
    if !hero_ids.is_empty() {
        filters.push(format!("hero_id IN ({})", id_list(&hero_ids)));
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
    let having_clause = having_clause(&having_filters);

    // The per-row averages equal the base query's avg()/avgIf(): the denominators
    // (matches, n_sold) are the same counts. players_state is a uniqCombined(14) state
    // (migration 39): merging plain uniq states was ~99% of this query's CPU.
    Some(format!(
        "
SELECT
    item_id,
    {bucket_expr}    AS bucket,
    sum(n_wins)                            AS wins,
    toUInt64(sum(n_matches) - sum(n_wins)) AS losses,
    sum(n_matches)                         AS matches,
    uniqCombinedMerge(14)(players_state)   AS players,
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
    const TIME_AGG: &str = "item_cohort_stats_time_agg_v2";
    const NW_AGG: &str = "item_cohort_stats_net_worth_agg_v2";
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
    #[expect(deprecated)]
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
        || query.item_order.as_ref().is_some_and(|v| !v.is_empty())
        || query.has_ability_order_filter()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some()
        || query
            .min_average_badge
            .is_some_and(|v| v > MIN_FILTERING_AVERAGE_BADGE)
        || query
            .max_average_badge
            .is_some_and(|v| v < MAX_FILTERING_AVERAGE_BADGE)
        || query.reads_corrupted()
        || !MatchMode::is_agg_servable(query.match_mode.as_deref());
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
    filters.extend(MatchMode::agg_sql_filter(query.match_mode.as_deref()));
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
    let having_clause = having_clause(&having_filters);

    Some(format!(
        "
SELECT
    item_id,
    {bucket_expr}    AS bucket,
    sum(n_wins)                            AS wins,
    toUInt64(sum(n_matches) - sum(n_wins)) AS losses,
    sum(n_matches)                         AS matches,
    uniqCombinedMerge(14)(players_state)   AS players,
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

/// Builds a query against the `item_enemy_stats_agg` rollup for the plain "what
/// beats hero X" shape (exactly one enemy hero, no granular filters), else `None`.
/// On the base table this shape decompresses the item arrays of the whole window:
/// the enemy hero is in ~20% of matches, spread evenly, so no granule is skipped.
#[expect(clippy::too_many_lines)]
fn build_enemy_mv_query(query: &ItemStatsQuery) -> Option<String> {
    let enemy_hero_id = match query.enemy_hero_ids.as_deref() {
        Some(ids) if !ids.is_empty() && ids.iter().all_equal() => ids[0],
        _ => return None,
    };
    // Hero/team are not in the rollup grain; hero-filtered enemy queries are
    // served fast by the base-table projection.
    let bucket_expr = match query.bucket {
        BucketQuery::Hero | BucketQuery::Team => return None,
        bucket => bucket.mv_bucket_expr()?,
    };

    #[expect(deprecated)]
    let unsupported = query.hero_id.is_some()
        || query.hero_ids.as_ref().is_some_and(|v| !v.is_empty())
        || query.account_id.is_some()
        || query.account_ids.as_ref().is_some_and(|v| !v.is_empty())
        || query.min_enemy_networth.is_some()
        || query.max_enemy_networth.is_some()
        || query.same_lane_filter == Some(true)
        || query
            .include_item_ids
            .as_ref()
            .is_some_and(|v| !v.is_empty())
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
        || query.item_order.as_ref().is_some_and(|v| !v.is_empty())
        || query.has_ability_order_filter()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some()
        || query.reads_corrupted()
        || !MatchMode::is_agg_servable(query.match_mode.as_deref());
    if unsupported {
        return None;
    }

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
        format!("enemy_hero_id = {enemy_hero_id}"),
    ];
    filters.extend(MatchMode::agg_sql_filter(query.match_mode.as_deref()));
    if let Some(v) = query.min_unix_timestamp {
        filters.push(format!("day >= toDate({v})"));
    }
    if let Some(v) = query.max_unix_timestamp {
        filters.push(format!("day <= toDate({v})"));
    }
    // Same badge semantics and no-op guards as build_mv_query.
    if let Some(v) = query.min_average_badge
        && v > MIN_FILTERING_AVERAGE_BADGE
    {
        filters.push(format!("least_badge >= {v}"));
    }
    if let Some(v) = query.max_average_badge
        && v < MAX_FILTERING_AVERAGE_BADGE
    {
        filters.push(format!("greatest_badge <= {v}"));
    }
    let where_clause = filters.join(" AND ");

    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("matches >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches <= {max_matches}"));
    }
    let having_clause = having_clause(&having_filters);

    Some(format!(
        "
SELECT
    item_id,
    {bucket_expr}    AS bucket,
    sum(n_wins)                            AS wins,
    toUInt64(sum(n_matches) - sum(n_wins)) AS losses,
    sum(n_matches)                         AS matches,
    uniqCombinedMerge(14)(players_state)   AS players,
    sum(sum_buy_time) / sum(n_matches)                       AS avg_buy_time_s,
    if(sum(n_sold) = 0, 0, sum(sum_sold_time) / sum(n_sold)) AS avg_sell_time_s,
    sum(sum_buy_rel) / sum(n_matches)                        AS avg_buy_time_relative,
    if(sum(n_sold) = 0, 0, sum(sum_sold_rel) / sum(n_sold))  AS avg_sell_time_relative
FROM item_enemy_stats_agg
WHERE {where_clause}
GROUP BY item_id, bucket
{having_clause}
ORDER BY item_id, bucket
SETTINGS log_comment = 'item_stats_enemy_mv'
        "
    ))
}

/// Tracing companion to [`build_cohort_mv_query`]: for a single-cohort-item request
/// that still reached the base table, names the first condition that kept it off the
/// `item_cohort_stats_*_agg` rollups. `"eligible"` means the rollup was not declined
/// (so a routed query must have errored and fallen back). Keep the checks in sync with
/// `build_cohort_mv_query`'s `None` branches; diagnostic only, no effect on results.
#[expect(deprecated)]
fn cohort_mv_skip_reason(query: &ItemStatsQuery) -> &'static str {
    fn nonempty<T>(v: Option<&[T]>) -> bool {
        v.is_some_and(|v| !v.is_empty())
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs().cast_signed());
    let oldest_servable = now - (COHORT_MV_HORIZON_DAYS - MV_ROUTING_MARGIN_DAYS) * 86_400;

    let reasons = [
        (
            !matches!(query.include_item_ids.as_deref(), Some([_])),
            "not_single_item",
        ),
        (cohort_mv_bucket(query.bucket).is_none(), "bucket"),
        (
            query.hero_id.is_some() || nonempty(query.hero_ids.as_deref()),
            "hero",
        ),
        (
            query.account_id.is_some() || nonempty(query.account_ids.as_deref()),
            "account",
        ),
        (nonempty(query.enemy_hero_ids.as_deref()), "enemy"),
        (nonempty(query.exclude_item_ids.as_deref()), "exclude_items"),
        (
            query.min_networth.is_some() || query.max_networth.is_some(),
            "networth",
        ),
        (
            query.min_duration_s.is_some() || query.max_duration_s.is_some(),
            "duration",
        ),
        (
            query.min_bought_at_s.is_some() || query.max_bought_at_s.is_some(),
            "bought_at",
        ),
        (nonempty(query.item_order.as_deref()), "item_order"),
        (query.has_ability_order_filter(), "ability_order"),
        (
            query.min_match_id.is_some() || query.max_match_id.is_some(),
            "match_id",
        ),
        (
            !MatchMode::is_agg_servable(query.match_mode.as_deref()),
            "match_mode",
        ),
        (
            query
                .min_average_badge
                .is_some_and(|v| v > MIN_FILTERING_AVERAGE_BADGE),
            "badge",
        ),
        (
            query
                .max_average_badge
                .is_some_and(|v| v < MAX_FILTERING_AVERAGE_BADGE),
            "badge",
        ),
        (
            query.corrupted_items() == CorruptedItemsFilter::Include,
            "include_corrupted",
        ),
        (
            query.corrupted_items() == CorruptedItemsFilter::Only,
            "only_corrupted",
        ),
        (query.min_unix_timestamp.is_none(), "no_min_timestamp"),
        (
            query
                .min_unix_timestamp
                .is_some_and(|ts| ts < oldest_servable),
            "horizon",
        ),
    ];
    reasons
        .into_iter()
        .find_map(|(hit, reason)| hit.then_some(reason))
        .unwrap_or("eligible")
}

/// Builds the conditional build-order predicate for a single ordered `chain`, or
/// `None` for a no-op chain (fewer than 2 ids).
///
/// For each adjacent pair `(a, b)` the match is excluded **only** when the player
/// bought both `a` and `b` and bought `b` before `a`; builds missing either item are
/// left untouched (this is a constraint, not a presence filter). Ties are lenient:
/// equal first-purchase times (`<=`) are not treated as a violation. `indexOf` returns
/// the first occurrence, so the comparison is on each item's *first* purchase time; the
/// `NOT has(...)` guards make the absent-item case (where `indexOf` is 0) pass.
fn item_order_predicate(chain: &[u32]) -> Option<String> {
    if chain.len() < 2 {
        return None;
    }
    let first_buy =
        |id: u32| format!("arrayElement(items.game_time_s, indexOf(items.item_id, {id}))");
    let clause = chain
        .windows(2)
        .map(|w| {
            let (a, b) = (w[0], w[1]);
            format!(
                "(NOT has(items.item_id, {a}) OR NOT has(items.item_id, {b}) OR {} <= {})",
                first_buy(a),
                first_buy(b),
            )
        })
        .join(" AND ");
    // Each adjacent-pair clause is already parenthesized; AND-joining them yields a
    // valid predicate element (join_filters AND-joins it with the other filters).
    Some(clause)
}

/// Validates `item_order` chains, rejecting degenerate or oversized input with a `400`.
/// Each chain must list at least two item ids that are not all identical, and both the
/// chain count and per-chain length are bounded to keep the generated SQL small.
fn validate_item_order(chains: Option<&[Vec<u32>]>) -> APIResult<()> {
    let Some(chains) = chains else {
        return Ok(());
    };
    let bad_request = |message: &str| APIError::status_msg(StatusCode::BAD_REQUEST, message);
    if chains.len() > MAX_ITEM_ORDER_CHAINS {
        return Err(bad_request("Too many item_order constraints"));
    }
    for chain in chains {
        if chain.len() < 2 {
            return Err(bad_request("Each item_order must list at least 2 item ids"));
        }
        if chain.len() > MAX_ITEM_ORDER_LEN {
            return Err(bad_request("An item_order chain has too many item ids"));
        }
        if chain.iter().all(|&id| id == chain[0]) {
            return Err(bad_request(
                "An item_order chain must use distinct item ids",
            ));
        }
    }
    Ok(())
}

#[expect(clippy::too_many_lines)]
fn build_query(query: &ItemStatsQuery) -> String {
    let corrupted_items = query.corrupted_items();
    let only_corrupted = corrupted_items == CorruptedItemsFilter::Only;
    /* ---------- match_info filters ----------
     *
     * `corrupted_items=only`: no match before build 6712 can match, so raise the lower bounds
     * to the first possible match. The `match_id` bound prunes whole partitions, for the base
     * table and for the hero-led projection alike. The projection has no `start_time` index,
     * so without that bound it would read every hero row of the table. All windows that
     * start before the patch also produce the same SQL, so they share one cache entry.
     */
    let (min_unix_timestamp, min_match_id) = if only_corrupted {
        (
            Some(
                query
                    .min_unix_timestamp
                    .map_or(CORRUPTED_ITEMS_MIN_UNIX_TIMESTAMP, |v| {
                        v.max(CORRUPTED_ITEMS_MIN_UNIX_TIMESTAMP)
                    }),
            ),
            Some(
                query
                    .min_match_id
                    .map_or(CORRUPTED_ITEMS_MIN_MATCH_ID, |v| {
                        v.max(CORRUPTED_ITEMS_MIN_MATCH_ID)
                    }),
            ),
        )
    } else {
        (query.min_unix_timestamp, query.min_match_id)
    };
    let info_filters = MatchInfoFilters {
        min_unix_timestamp,
        min_match_id,
        ..query.match_info()
    };
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());

    /* ---------- match_player filters ---------- */
    let mut hero_ids = query.hero_ids.clone().unwrap_or_default();
    #[expect(deprecated)]
    if let Some(hero_id) = query.hero_id {
        hero_ids.push(hero_id);
    }
    let has_buyer_hero_filter = !hero_ids.is_empty();
    #[expect(deprecated)]
    let player_filter_inputs = PlayerFilters {
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
        ability_order_prefix: query.ability_order_prefix.as_deref(),
        ability_unlock_order_prefix: query.ability_unlock_order_prefix.as_deref(),
        ..Default::default()
    };
    let mut player_filters = player_filter_inputs.build();
    player_filters.extend(account_match_prefilter(
        player_filter_inputs,
        &info_filters,
        &match_mode_filter,
        &game_mode_filter,
    ));
    let info_filters = info_filters.build();
    if let Some(min_bought_at_s) = query.min_bought_at_s {
        player_filters.push(format!("buy_time >= {min_bought_at_s}"));
    }
    if let Some(max_bought_at_s) = query.max_bought_at_s {
        player_filters.push(format!("buy_time <= {max_bought_at_s}"));
    }
    if let Some(chains) = &query.item_order {
        player_filters.extend(chains.iter().filter_map(|c| item_order_predicate(c)));
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
    let having_clause = having_clause(&having_filters);

    /* ---------- enemy-team filter (optional) ---------- */
    let enemy_hero_ids = query
        .enemy_hero_ids
        .as_deref()
        .filter(|ids| !ids.is_empty());
    let (enemy_cte, enemy_prewhere) = if let Some(ids) = enemy_hero_ids {
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
        WHERE {match_mode_filter} AND {game_mode_filter} {info_filters}
            AND team IN ('Team0', 'Team1')
            AND hero_id IN ({})
        GROUP BY match_id, team{enemy_having_clause}
    )",
            id_list(&unique_ids)
        );
        // A semi-join on (match, opposing team[, lane]) instead of `INNER JOIN t_enemy_teams`:
        // the join hashed every row of the window before discarding the buyer's own team,
        // while the IN set is evaluated in PREWHERE, so the item arrays are only read for
        // rows on the enemy side (measured -25% CPU, -21% memory, identical rows).
        let semi_join = if same_lane {
            "(match_id, if(team = 'Team0', 'Team1', 'Team0'), assigned_lane) IN (SELECT match_id, enemy_team, arrayJoin(enemy_lanes) FROM t_enemy_teams)"
        } else {
            "(match_id, if(team = 'Team0', 'Team1', 'Team0')) IN (SELECT match_id, enemy_team FROM t_enemy_teams)"
        };
        (cte, format!("\n        AND {semi_join}"))
    } else {
        (String::new(), String::new())
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
     * The hero-led `item_stats_by_hero_mode_badge_v2` projection is sorted hero_id-first
     * and has no `start_time` index, so a query WITHOUT a buyer hero filter cannot prune
     * it. It reads the whole projection of every partition that survives partition pruning,
     * whatever the time window. Measured: 42.4M rows for a 1-day window while v2 covered
     * partitions 95..108, and ~350M once it covers the table. The base table serves the same
     * no-hero shapes far more cheaply through its skip indexes (idx_start_time minmax
     * for the time window, account_id bloom for account filters): benchmarked at ~5-8x
     * less I/O and wall time for item-, badge-, and account-filtered no-hero queries.
     *
     * Hero-filtered queries keep the projection: hero_id is its most selective prefix
     * (~2.3% per hero), so we disable projections only when there is no buyer hero
     * filter. The single near-neutral case is an all-time query (no start_time bound),
     * where the base table cannot prune by time. It still reads less I/O there, and such
     * queries are rare.
     *
     * (Originally this carve-out covered only account-only shapes; it was generalized to
     * all no-hero shapes after benchmarking the projection vs base-table access paths.)
     *
     * An enemy hero filter counts too, even though the buyer side has no hero
     * predicate: the enemy-team CTE selects on `hero_id`, which is exactly the
     * projection's leading key, so it prunes to ~1.1k marks instead of ~38k. The
     * main ARRAY JOIN scan reads `upgrades.*`, which the projection does not
     * store, so it falls back to the base table on its own. With `corrupted_items`
     * `include`/`only`, the main scan reads `items.*` instead. The projection does store
     * those arrays, so ClickHouse could pick it without a hero predicate (a full projection
     * scan). Projections therefore stay off for those opt-in cases.
     */
    if !has_buyer_hero_filter && (enemy_hero_ids.is_none() || query.reads_corrupted()) {
        settings.push("optimize_use_projections = 0");
    }
    let settings_clause = settings.join(", ");
    // `corrupted_items=only`: skip players without any corrupted purchase before the item
    // arrays are read. The predicate only needs `items.upgrade_info`, a small, low-entropy
    // column, and ClickHouse moves it to PREWHERE on its own. In the enemy case, which has
    // its own PREWHERE, it goes there explicitly. Measured on partition 108: 153 MiB read
    // instead of 545 MiB.
    let has_corrupted_filter = if only_corrupted {
        format!(
            " AND arrayExists(u -> {}, items.upgrade_info)",
            corrupted_sql("u")
        )
    } else {
        String::new()
    };
    let match_filters =
        format!("{match_mode_filter} AND {game_mode_filter} {info_filters}{has_corrupted_filter}");
    // With an enemy filter the match filters move to PREWHERE alongside the semi-join, so
    // the array-joined `WHERE` only keeps the predicates that need the joined aliases.
    let (prewhere_clause, where_match_filters) = if enemy_prewhere.is_empty() {
        (String::new(), match_filters.as_str())
    } else {
        (
            format!("PREWHERE {match_filters}{enemy_prewhere}\n"),
            "true",
        )
    };
    /*
     * The no-hero path reads the materialized `upgrades.*` columns (migrations 30
     * and 42): upgrade-only elements with buy_time > 0 that are not corrupted, baked
     * in at insert time, so the `item_id IN t_upgrades AND buy_time > 0` filter and
     * ~47% of the array bytes disappear. The hero-filtered path must keep `items.*`
     * + the query-time filter: it is served by the item_stats_by_hero_mode_badge_v2
     * projection, which does not contain the upgrades.* columns, so referencing them
     * would silently disable the projection. Its corrupted-item filter reads
     * `items.upgrade_info`, which the _v2 projection (migration 42) carries.
     *
     * `corrupted_items` `include`/`only` also need `items.*`, because `upgrades.*` has no
     * corrupted purchases.
     */
    let use_items_arrays = has_buyer_hero_filter || query.reads_corrupted();
    let (items_array_join, upgrade_filter, nw_col) = if use_items_arrays {
        let (upgrade_info_join, corrupted_filter) = match corrupted_items {
            CorruptedItemsFilter::Include => (String::new(), String::new()),
            CorruptedItemsFilter::Exclude => (
                ",\n    items.upgrade_info AS upgrade_info".to_owned(),
                format!(" AND {}", not_corrupted_sql("upgrade_info")),
            ),
            CorruptedItemsFilter::Only => (
                ",\n    items.upgrade_info AS upgrade_info".to_owned(),
                format!(" AND {}", corrupted_sql("upgrade_info")),
            ),
        };
        (
            format!(
                "items.item_id      AS item_id,\n    items.game_time_s  AS buy_time,\n    items.sold_time_s  AS sold_time{upgrade_info_join}"
            ),
            format!("\n    AND item_id IN t_upgrades AND buy_time > 0{corrupted_filter}"),
            ",\n    `items.net_worth_at_buy` AS net_worth_at_buy",
        )
    } else {
        (
            "`upgrades.item_id`      AS item_id,\n    `upgrades.game_time_s`  AS buy_time,\n    `upgrades.sold_time_s`  AS sold_time".to_owned(),
            String::new(),
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
    if use_items_arrays {
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
    // `avgIf` over zero rows is NaN, not NULL, so `coalesce` did not catch it. Groups with no
    // sale (common for `corrupted_items=only`) then came out as JSON `null`. `ifNotFinite`
    // returns 0 like the rollup queries do (`if(sum(n_sold) = 0, 0, ...)`).
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
    ifNotFinite(avgIf(sold_time, sold_time > 0), 0) AS avg_sell_time_s,
    avg((buy_time / duration_s) * 100) AS avg_buy_time_relative,
    ifNotFinite(avgIf((sold_time / duration_s) * 100, sold_time > 0), 0) AS avg_sell_time_relative
FROM match_player
ARRAY JOIN
    {items_array_join}{nw_array_join}
{prewhere_clause}WHERE {where_match_filters}{upgrade_filter}
    {player_filters}
GROUP BY item_id, bucket
{having_clause}
ORDER BY item_id, bucket
SETTINGS {settings_clause}
        "
    )
}

cached_ch_query! {
    fn run_query(5_000, 21600) -> Vec<ItemStats>;
}

cached_ch_query! {
    /// Separate cache for per-account base-table queries: ~100k a day, cheap (~30ms) and
    /// almost never repeated, they evicted the shared cache every ~15 minutes and made
    /// the expensive global queries (10s+) rerun several times per TTL.
    fn run_account_query(1_000, 21600) -> Vec<ItemStats>;
}

cached_ch_query! {
    /// Separate cache for the pre-aggregated rollup queries (`item_stats_agg`, cohort and
    /// enemy rollups): the long tail of per-account base-table queries would otherwise
    /// evict these few, heavily repeated entries from the shared cache long before
    /// their TTL.
    fn run_rollup_query(5_000, 21600) -> Vec<ItemStats>;
}

async fn get_item_stats(
    ch_client: &clickhouse::Client,
    mut query: ItemStatsQuery,
) -> APIResult<Arc<Vec<ItemStats>>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    if query.corrupted_only_range_is_empty() {
        return Ok(Arc::default());
    }
    // Prefer the pre-aggregated item_stats_agg view for the global-meta subset of
    // parameters; fall back to the base table for everything else, and on any MV
    // error so a missing or rebuilding view never breaks the endpoint.
    if let Some(mv_query) = build_mv_query(&query) {
        debug!(?mv_query);
        match run_rollup_query(ch_client, &mv_query).await {
            Ok(rows) => return Ok(rows),
            Err(e) => warn!("item_stats MV query failed, falling back to base table: {e}"),
        }
    }
    if let Some(cohort_mv_query) = build_cohort_mv_query(&query) {
        debug!(?cohort_mv_query);
        match run_rollup_query(ch_client, &cohort_mv_query).await {
            Ok(rows) => return Ok(rows),
            Err(e) => warn!("item_stats cohort MV query failed, falling back to base table: {e}"),
        }
    } else if matches!(query.include_item_ids.as_deref(), Some([_])) {
        // Single-item cohort shape that the rollup declined: this is the base-table
        // full-scan path responsible for the item_stats timeouts. Record why it missed.
        warn!(
            reason = cohort_mv_skip_reason(&query),
            bucket = ?query.bucket,
            "single-item item_stats cohort query not routed to rollup, using base table"
        );
    }
    if let Some(enemy_mv_query) = build_enemy_mv_query(&query) {
        debug!(?enemy_mv_query);
        match run_rollup_query(ch_client, &enemy_mv_query).await {
            Ok(rows) => return Ok(rows),
            Err(e) => warn!("item_stats enemy MV query failed, falling back to base table: {e}"),
        }
    }
    let base_query = build_query(&query);
    debug!(?base_query);
    #[expect(deprecated)]
    let per_account =
        query.account_id.is_some() || query.account_ids.as_ref().is_some_and(|v| !v.is_empty());
    if per_account {
        Ok(run_account_query(ch_client, &base_query).await?)
    } else {
        Ok(run_query(ch_client, &base_query).await?)
    }
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

Results are cached for **6 hours** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

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
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    validate_item_order(query.item_order.as_deref())?;
    #[expect(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    get_item_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn item_stats_build_query_is_valid_sql(query: ItemStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }

        #[test]
        fn item_stats_build_enemy_mv_query_is_valid_sql(query: ItemStatsQuery) {
            if let Some(sql) = build_enemy_mv_query(&query) {
                assert_valid_sql(&sql);
            }
        }

        #[test]
        fn item_stats_build_mv_query_is_valid_sql(query: ItemStatsQuery) {
            if let Some(sql) = build_mv_query(&query) {
                assert_valid_sql(&sql);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enemy_hero_filter_is_a_prewhere_semi_join_not_a_join() {
        let sql = build_query(&ItemStatsQuery {
            enemy_hero_ids: Some(vec![66]),
            ..Default::default()
        });
        assert!(!sql.contains("INNER JOIN"));
        assert!(sql.contains("PREWHERE match_mode IN ('Ranked', 'Unranked') AND 1=1 "));
        assert!(sql.contains(
            "AND (match_id, if(team = 'Team0', 'Team1', 'Team0')) IN (SELECT match_id, enemy_team FROM t_enemy_teams)\nWHERE true"
        ));

        let same_lane = build_query(&ItemStatsQuery {
            enemy_hero_ids: Some(vec![66]),
            same_lane_filter: Some(true),
            ..Default::default()
        });
        assert!(same_lane.contains(
            "(match_id, if(team = 'Team0', 'Team1', 'Team0'), assigned_lane) IN (SELECT match_id, enemy_team, arrayJoin(enemy_lanes) FROM t_enemy_teams)"
        ));

        let plain = build_query(&ItemStatsQuery::default());
        assert!(!plain.contains("PREWHERE"));
        assert!(plain.contains("\nWHERE match_mode IN ('Ranked', 'Unranked') AND 1=1 "));
    }

    #[test]
    fn ability_order_filter_declines_every_rollup() {
        let recent = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .cast_signed()
            - 86_400;
        let query = ItemStatsQuery {
            min_unix_timestamp: Some(recent),
            ability_order_prefix: Some(vec![1_999_680_326]),
            ..Default::default()
        };
        assert!(build_mv_query(&query).is_none());
        assert!(
            build_enemy_mv_query(&ItemStatsQuery {
                enemy_hero_ids: Some(vec![66]),
                ..query.clone()
            })
            .is_none()
        );
        let cohort = ItemStatsQuery {
            include_item_ids: Some(vec![1]),
            ..query.clone()
        };
        assert!(build_cohort_mv_query(&cohort).is_none());
        assert_eq!(cohort_mv_skip_reason(&cohort), "ability_order");
        assert!(build_query(&query).contains("arraySlice(abilities, 1, 1) = [1999680326]"));

        let unlock = ItemStatsQuery {
            ability_order_prefix: None,
            ability_unlock_order_prefix: Some(vec![1_999_680_326]),
            ..query
        };
        assert!(build_mv_query(&unlock).is_none());
        assert!(
            build_cohort_mv_query(&ItemStatsQuery {
                include_item_ids: Some(vec![1]),
                ..unlock.clone()
            })
            .is_none()
        );
        assert!(
            build_query(&unlock)
                .contains("arraySlice(arrayDistinct(abilities), 1, 1) = [1999680326]")
        );
    }
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn enemy_mv_serves_only_the_single_enemy_hero_shape() {
        let recent = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .cast_signed()
            - 30 * 86_400;
        let servable = ItemStatsQuery {
            enemy_hero_ids: Some(vec![6]),
            min_unix_timestamp: Some(recent),
            min_average_badge: Some(91),
            ..Default::default()
        };
        let sql = build_enemy_mv_query(&servable).unwrap();
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM item_enemy_stats_agg"));
        assert!(sql.contains("enemy_hero_id = 6"));
        assert!(sql.contains("least_badge >= 91"));

        let declined = [
            ItemStatsQuery {
                enemy_hero_ids: Some(vec![6, 7]),
                ..servable.clone()
            },
            ItemStatsQuery {
                hero_ids: Some(vec![1]),
                ..servable.clone()
            },
            ItemStatsQuery {
                same_lane_filter: Some(true),
                ..servable.clone()
            },
            ItemStatsQuery {
                min_enemy_networth: Some(1),
                ..servable.clone()
            },
            ItemStatsQuery {
                bucket: BucketQuery::Hero,
                ..servable.clone()
            },
            ItemStatsQuery {
                min_unix_timestamp: Some(recent - 60 * 86_400),
                ..servable.clone()
            },
            ItemStatsQuery {
                enemy_hero_ids: None,
                ..servable
            },
        ];
        for query in &declined {
            assert!(build_enemy_mv_query(query).is_none(), "{query:?}");
        }
    }

    #[test]
    fn corrupted_items_are_excluded_by_default() {
        // No hero: the materialized upgrades.* arrays already drop corrupted purchases.
        let plain = build_query(&ItemStatsQuery::default());
        assert!(plain.contains("`upgrades.item_id`      AS item_id"));
        assert!(!plain.contains("upgrade_info"));
        assert!(!plain.contains("t_upgrades"));
        assert!(plain.contains("optimize_use_projections = 0"));

        // Hero: items.* (projection-served) plus the upgrade_info bit filter.
        let hero = build_query(&ItemStatsQuery {
            hero_ids: Some(vec![7]),
            ..Default::default()
        });
        assert_valid_sql(&hero);
        assert!(hero.contains("items.item_id      AS item_id"));
        assert!(hero.contains(",\n    items.upgrade_info AS upgrade_info"));
        assert!(hero.contains(
            "AND item_id IN t_upgrades AND buy_time > 0 AND bitAnd(upgrade_info, 8388608) = 0"
        ));
        assert!(!hero.contains("optimize_use_projections"));
    }

    #[test]
    #[expect(deprecated)]
    fn include_corrupted_items_reads_raw_items_without_the_bit_filter() {
        for hero_ids in [None, Some(vec![7])] {
            let has_hero = hero_ids.is_some();
            let sql = build_query(&ItemStatsQuery {
                hero_ids,
                include_corrupted_items: Some(true),
                bucket: BucketQuery::NetWorthBy1000,
                ..Default::default()
            });
            assert_valid_sql(&sql);
            assert!(
                sql.contains("WITH t_upgrades AS (SELECT id FROM items WHERE type = 'upgrade')")
            );
            assert!(sql.contains("items.item_id      AS item_id"));
            assert!(sql.contains("`items.net_worth_at_buy` AS net_worth_at_buy"));
            assert!(sql.contains("AND item_id IN t_upgrades AND buy_time > 0\n"));
            assert!(!sql.contains("upgrades.item_id"));
            assert!(!sql.contains("upgrade_info"));
            assert_eq!(sql.contains("optimize_use_projections = 0"), !has_hero);
        }
        // Enemy filter without a buyer hero: the default main scan reads upgrades.*
        // (projection-ineligible), the opt-in one reads items.*, so projections go off.
        let enemy = ItemStatsQuery {
            enemy_hero_ids: Some(vec![6]),
            ..Default::default()
        };
        assert!(!build_query(&enemy).contains("optimize_use_projections"));
        assert!(
            build_query(&ItemStatsQuery {
                include_corrupted_items: Some(true),
                ..enemy
            })
            .contains("optimize_use_projections = 0")
        );
        // `false` is the same as unset.
        assert_eq!(
            build_query(&ItemStatsQuery {
                include_corrupted_items: Some(false),
                ..Default::default()
            }),
            build_query(&ItemStatsQuery::default())
        );
    }

    #[test]
    #[expect(deprecated)]
    fn include_corrupted_items_declines_every_rollup() {
        let recent = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .cast_signed()
            - 86_400;
        let query = ItemStatsQuery {
            min_unix_timestamp: Some(recent),
            ..Default::default()
        };
        let enemy = ItemStatsQuery {
            enemy_hero_ids: Some(vec![6]),
            ..query.clone()
        };
        let cohort = ItemStatsQuery {
            include_item_ids: Some(vec![1]),
            ..query.clone()
        };
        assert!(build_mv_query(&query).is_some());
        assert!(build_enemy_mv_query(&enemy).is_some());
        assert!(build_cohort_mv_query(&cohort).is_some());

        let with_corrupted = |q: &ItemStatsQuery| ItemStatsQuery {
            include_corrupted_items: Some(true),
            ..q.clone()
        };
        assert!(build_mv_query(&with_corrupted(&query)).is_none());
        assert!(build_enemy_mv_query(&with_corrupted(&enemy)).is_none());
        assert!(build_cohort_mv_query(&with_corrupted(&cohort)).is_none());
        assert_eq!(
            cohort_mv_skip_reason(&with_corrupted(&cohort)),
            "include_corrupted"
        );
    }

    #[test]
    #[expect(deprecated)]
    fn corrupted_items_param_aliases_the_legacy_flag() {
        let with = |corrupted_items, include_corrupted_items| {
            build_query(&ItemStatsQuery {
                corrupted_items,
                include_corrupted_items,
                ..Default::default()
            })
        };
        let default = build_query(&ItemStatsQuery::default());
        assert_eq!(with(Some(CorruptedItemsFilter::Exclude), None), default);
        assert_eq!(with(None, Some(false)), default);
        assert_eq!(
            with(Some(CorruptedItemsFilter::Include), None),
            with(None, Some(true))
        );
        // The explicit param wins over the deprecated flag.
        assert_eq!(
            with(Some(CorruptedItemsFilter::Exclude), Some(true)),
            default
        );
        assert_eq!(
            with(Some(CorruptedItemsFilter::Only), Some(true)),
            with(Some(CorruptedItemsFilter::Only), None)
        );
    }

    #[test]
    fn only_corrupted_items_filters_on_the_corruption_bit() {
        for hero_ids in [None, Some(vec![7])] {
            let has_hero = hero_ids.is_some();
            let sql = build_query(&ItemStatsQuery {
                hero_ids,
                corrupted_items: Some(CorruptedItemsFilter::Only),
                bucket: BucketQuery::NetWorthBy1000,
                ..Default::default()
            });
            assert_valid_sql(&sql);
            assert!(sql.contains("items.item_id      AS item_id"));
            assert!(sql.contains(",\n    items.upgrade_info AS upgrade_info"));
            assert!(sql.contains("`items.net_worth_at_buy` AS net_worth_at_buy"));
            assert!(sql.contains(
                "AND item_id IN t_upgrades AND buy_time > 0 AND bitAnd(upgrade_info, 8388608) != 0\n"
            ));
            assert!(
                sql.contains(" AND arrayExists(u -> bitAnd(u, 8388608) != 0, items.upgrade_info)")
            );
            assert!(!sql.contains("upgrades.item_id"));
            assert!(
                !sql.contains("8388608) = 0"),
                "no not-corrupted filter: {sql}"
            );
            // Hero-filtered: the v2 projection (partition-pruned by the match_id floor).
            assert_eq!(sql.contains("optimize_use_projections = 0"), !has_hero);
        }
        // Enemy shape: the row prefilter goes into the explicit PREWHERE.
        let enemy = build_query(&ItemStatsQuery {
            enemy_hero_ids: Some(vec![6]),
            corrupted_items: Some(CorruptedItemsFilter::Only),
            ..Default::default()
        });
        assert_valid_sql(&enemy);
        let prewhere = enemy.split("PREWHERE").nth(1).unwrap();
        let prewhere = prewhere.split("\nWHERE").next().unwrap();
        assert!(prewhere.contains("arrayExists(u -> bitAnd(u, 8388608) != 0, items.upgrade_info)"));
        assert!(enemy.contains("optimize_use_projections = 0"));
    }

    #[test]
    fn only_corrupted_items_clamps_the_window_to_the_patch() {
        let floor = format!(
            "start_time >= {CORRUPTED_ITEMS_MIN_UNIX_TIMESTAMP} AND match_id >= {CORRUPTED_ITEMS_MIN_MATCH_ID}"
        );
        let only = |min_unix_timestamp, min_match_id| {
            build_query(&ItemStatsQuery {
                corrupted_items: Some(CorruptedItemsFilter::Only),
                min_unix_timestamp,
                min_match_id,
                ..Default::default()
            })
        };
        // Old or missing lower bounds are raised to the patch, so they share one SQL string
        // (and one cache entry).
        let unbounded = only(None, None);
        assert!(unbounded.contains(&floor), "{unbounded}");
        assert_eq!(only(Some(1_700_000_000), Some(1)), unbounded);
        // Tighter bounds are kept.
        let later = only(Some(1_790_800_000), Some(108_600_000));
        assert!(later.contains("start_time >= 1790800000 AND match_id >= 108600000"));
        // The enemy CTE is bounded too.
        let enemy = build_query(&ItemStatsQuery {
            corrupted_items: Some(CorruptedItemsFilter::Only),
            enemy_hero_ids: Some(vec![6]),
            min_unix_timestamp: Some(1_700_000_000),
            ..Default::default()
        });
        assert_eq!(enemy.matches(&floor).count(), 2, "{enemy}");
        // Other modes keep the requested window.
        let exclude = build_query(&ItemStatsQuery {
            min_unix_timestamp: Some(1_700_000_000),
            ..Default::default()
        });
        assert!(exclude.contains("start_time >= 1700000000"));
        assert!(!exclude.contains("match_id >="));
    }

    #[test]
    fn only_corrupted_items_before_the_patch_is_empty() {
        let only = |max_unix_timestamp, max_match_id| ItemStatsQuery {
            corrupted_items: Some(CorruptedItemsFilter::Only),
            max_unix_timestamp,
            max_match_id,
            ..Default::default()
        };
        assert!(
            only(Some(CORRUPTED_ITEMS_MIN_UNIX_TIMESTAMP - 1), None)
                .corrupted_only_range_is_empty()
        );
        assert!(only(None, Some(CORRUPTED_ITEMS_MIN_MATCH_ID - 1)).corrupted_only_range_is_empty());
        assert!(!only(None, None).corrupted_only_range_is_empty());
        assert!(
            !only(Some(CORRUPTED_ITEMS_MIN_UNIX_TIMESTAMP), None).corrupted_only_range_is_empty()
        );
        // Only `only` short-circuits.
        assert!(
            !ItemStatsQuery {
                corrupted_items: Some(CorruptedItemsFilter::Include),
                ..only(Some(1), None)
            }
            .corrupted_only_range_is_empty()
        );
    }

    #[test]
    fn only_corrupted_items_declines_every_rollup() {
        let recent = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .cast_signed()
            - 86_400;
        let only = ItemStatsQuery {
            min_unix_timestamp: Some(recent),
            corrupted_items: Some(CorruptedItemsFilter::Only),
            ..Default::default()
        };
        assert!(build_mv_query(&only).is_none());
        assert!(
            build_enemy_mv_query(&ItemStatsQuery {
                enemy_hero_ids: Some(vec![6]),
                ..only.clone()
            })
            .is_none()
        );
        let cohort = ItemStatsQuery {
            include_item_ids: Some(vec![1]),
            ..only
        };
        assert!(build_cohort_mv_query(&cohort).is_none());
        assert_eq!(cohort_mv_skip_reason(&cohort), "only_corrupted");
    }

    #[test]
    fn corrupted_items_param_deserializes() {
        let try_parse = |qs: &str| {
            let uri: axum::http::Uri = format!("/item-stats?{qs}").parse().unwrap();
            Query::<ItemStatsQuery>::try_from_uri(&uri).map(|Query(q)| q)
        };
        let parse = |qs: &str| try_parse(qs).unwrap();
        for (qs, expected) in [
            ("", CorruptedItemsFilter::Exclude),
            ("corrupted_items=exclude", CorruptedItemsFilter::Exclude),
            ("corrupted_items=include", CorruptedItemsFilter::Include),
            ("corrupted_items=only", CorruptedItemsFilter::Only),
            (
                "include_corrupted_items=true",
                CorruptedItemsFilter::Include,
            ),
            (
                "include_corrupted_items=false",
                CorruptedItemsFilter::Exclude,
            ),
            (
                "include_corrupted_items=true&corrupted_items=only",
                CorruptedItemsFilter::Only,
            ),
        ] {
            assert_eq!(parse(qs).corrupted_items(), expected, "{qs}");
        }
        assert!(try_parse("corrupted_items=maybe").is_err());
    }

    #[test]
    fn item_order_predicate_is_noop_for_short_chains() {
        assert!(item_order_predicate(&[]).is_none());
        assert!(item_order_predicate(&[5]).is_none());
    }

    #[test]
    fn item_order_predicate_pair_is_conditional() {
        // A build missing either item must pass, so the clause is OR-guarded on
        // presence — never a bare `has(a) AND has(b) AND ...` presence requirement.
        let pred = item_order_predicate(&[1, 2]).unwrap();
        assert_eq!(
            pred,
            "(NOT has(items.item_id, 1) OR NOT has(items.item_id, 2) OR \
             arrayElement(items.game_time_s, indexOf(items.item_id, 1)) <= \
             arrayElement(items.game_time_s, indexOf(items.item_id, 2)))"
        );
        assert!(!pred.contains(" AND "));
    }

    #[test]
    fn item_order_predicate_chain_and_adjacent_pairs() {
        let pred = item_order_predicate(&[1, 2, 3]).unwrap();
        // Two adjacent pairs (1,2) and (2,3), AND-joined into one clause.
        assert_eq!(pred.matches(" AND ").count(), 1);
        for id in [1, 2, 3] {
            assert!(pred.contains(&format!("indexOf(items.item_id, {id})")));
        }
    }

    #[test]
    fn item_order_predicate_emits_valid_sql() {
        let pred = item_order_predicate(&[1, 2, 3]).unwrap();
        assert_valid_sql(&format!("SELECT * FROM match_player WHERE {pred}"));
    }

    #[test]
    fn validate_item_order_accepts_valid() {
        assert!(validate_item_order(None).is_ok());
        assert!(validate_item_order(Some(&[vec![1, 2]])).is_ok());
        assert!(validate_item_order(Some(&[vec![1, 2, 3], vec![4, 5]])).is_ok());
    }

    #[test]
    fn validate_item_order_rejects_degenerate() {
        assert!(validate_item_order(Some(&[vec![1]])).is_err()); // too short
        assert!(validate_item_order(Some(&[vec![]])).is_err()); // empty
        assert!(validate_item_order(Some(&[vec![7, 7]])).is_err()); // all identical
    }

    #[test]
    fn validate_item_order_rejects_oversized() {
        let too_long: Vec<u32> = (0..=u32::try_from(MAX_ITEM_ORDER_LEN).unwrap() + 1).collect();
        assert!(validate_item_order(Some(&[too_long])).is_err());
        let too_many: Vec<Vec<u32>> = (0..=MAX_ITEM_ORDER_CHAINS).map(|_| vec![1, 2]).collect();
        assert!(validate_item_order(Some(&too_many)).is_err());
    }
}
