use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use game_assets::versions::items::types::ItemType;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use strum::Display;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    BucketQuery, MatchScope, PlayerFilters, filter_protected_accounts, is_non_empty, join_filters,
    range_filters, rollup_oldest_servable, round_timestamps,
};
use super::rollup_window::{Coverage, DaySplit, EdgeRows, Reach, Rollup, RollupFilters};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::match_modes::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};
use crate::utils::sql::{MatchInfoFilters, cached_ch_query, impl_match_info};

/// How hero stats group their rows: [`BucketQuery`]'s match-level buckets, or the player's final
/// net worth.
#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub(crate) enum HeroStatsBucket {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket By Max Average Badge Level (tier = first digits, subtier = last digit) of both teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    AvgBadge,
    /// Bucket By Start Time (Hour)
    StartTimeHour,
    /// Bucket By Start Time (Day)
    StartTimeDay,
    /// Bucket By Start Time (Week)
    StartTimeWeek,
    /// Bucket By Start Time (Month)
    StartTimeMonth,
    /// Bucket By the player's final net worth (grouped by 1000). The bucket is the lower bound.
    #[serde(rename = "net_worth_by_1000")]
    #[strum(to_string = "net_worth_by_1000")]
    NetWorthBy1000,
    /// Bucket By the player's final net worth (grouped by 2000). The bucket is the lower bound.
    #[serde(rename = "net_worth_by_2000")]
    #[strum(to_string = "net_worth_by_2000")]
    NetWorthBy2000,
    /// Bucket By the player's final net worth (grouped by 3000). The bucket is the lower bound.
    #[serde(rename = "net_worth_by_3000")]
    #[strum(to_string = "net_worth_by_3000")]
    NetWorthBy3000,
    /// Bucket By the player's final net worth (grouped by 5000). The bucket is the lower bound.
    #[serde(rename = "net_worth_by_5000")]
    #[strum(to_string = "net_worth_by_5000")]
    NetWorthBy5000,
    /// Bucket By the player's final net worth (grouped by 10000). The bucket is the lower bound.
    #[serde(rename = "net_worth_by_10000")]
    #[strum(to_string = "net_worth_by_10000")]
    NetWorthBy10000,
}

impl HeroStatsBucket {
    /// The match-level bucket, or `None` for the net worth buckets.
    const fn match_bucket(self) -> Option<BucketQuery> {
        match self {
            Self::NoBucket => Some(BucketQuery::NoBucket),
            Self::AvgBadge => Some(BucketQuery::AvgBadge),
            Self::StartTimeHour => Some(BucketQuery::StartTimeHour),
            Self::StartTimeDay => Some(BucketQuery::StartTimeDay),
            Self::StartTimeWeek => Some(BucketQuery::StartTimeWeek),
            Self::StartTimeMonth => Some(BucketQuery::StartTimeMonth),
            Self::NetWorthBy1000
            | Self::NetWorthBy2000
            | Self::NetWorthBy3000
            | Self::NetWorthBy5000
            | Self::NetWorthBy10000 => None,
        }
    }

    /// The width of a net worth bucket, `None` for the match-level buckets.
    const fn net_worth_step(self) -> Option<u32> {
        match self {
            Self::NetWorthBy1000 => Some(1_000),
            Self::NetWorthBy2000 => Some(2_000),
            Self::NetWorthBy3000 => Some(3_000),
            Self::NetWorthBy5000 => Some(5_000),
            Self::NetWorthBy10000 => Some(10_000),
            Self::NoBucket
            | Self::AvgBadge
            | Self::StartTimeHour
            | Self::StartTimeDay
            | Self::StartTimeWeek
            | Self::StartTimeMonth => None,
        }
    }

    /// The bucket expression against `match_player` (or a table with its column names).
    fn base_expr(self) -> String {
        match (self.match_bucket(), self.net_worth_step()) {
            (Some(bucket), _) => bucket.base_expr().to_owned(),
            (None, Some(step)) => format!("toUInt32(intDiv(net_worth, {step}) * {step})"),
            (None, None) => "toUInt32(0)".to_owned(),
        }
    }

    /// The bucket expression against the day-grained rollups (see
    /// [`BucketQuery::mv_bucket_expr`]), or `None` when they can't express it: the rollups have no
    /// per-player net worth, so those buckets read `match_player`.
    const fn mv_bucket_expr(self) -> Option<&'static str> {
        match self.match_bucket() {
            Some(bucket) => bucket.mv_bucket_expr(),
            None => None,
        }
    }
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct HeroStatsQuery {
    /// Bucket allows you to group the stats by a specific field.
    #[serde(default)]
    #[param(inline)]
    bucket: HeroStatsBucket,
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
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<crate::utils::match_modes::MatchMode>(), 0..=4))"
        )
    )]
    match_mode: Option<Vec<MatchMode>>,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    min_unix_timestamp: Option<i64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<i64>,
    /// Filter matches based on their duration in seconds (up to 7000s). With a single `include_item_ids` or `exclude_item_ids` item, rounded to the nearest minute.
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s). With a single `include_item_ids` or `exclude_item_ids` item, rounded to the nearest minute (a value ending in 59 seconds, e.g. `1799`, is kept).
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
    /// Filter players based on the number of matches they have played with a specific hero in their entire history, counting only matches of the selected `game_mode`. The counts are refreshed every 30 minutes.
    min_hero_matches_total: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero in their entire history, counting only matches of the selected `game_mode`. The counts are refreshed every 30 minutes.
    max_hero_matches_total: Option<u64>,
    /// Comma separated list of entire-history hero match counts, each the lower bound of a bucket that ends where the next one starts (the last one is open-ended), e.g. `1,25,100` for 1-24, 25-99 and 100+ matches. Groups each player's matches by their entire-history match count on the hero (counted like `min_hero_matches_total`), and the `bucket` of each row is the lower bound of its bucket. Players below the first bound are left out. Only with `bucket=no_bucket`, at most 10 bounds.
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_matches_total_buckets: Option<Vec<u32>>,
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
    #[serde(default, deserialize_with = "steam_id::de::account_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "steam_id::de::account_ids_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
}

impl_match_info!(HeroStatsQuery);

impl HeroStatsQuery {
    /// Whether the request filters on anything [`ITEM_AGG_TABLE`] can't serve besides its one item:
    /// per-player filters, a badge (the rollup has none) or a match mode it doesn't hold.
    fn has_filter_beyond_item_rollup(&self) -> bool {
        #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
        let account = self.account_id.is_some();
        account
            || is_non_empty(self.account_ids.as_deref())
            || self.min_networth.is_some()
            || self.max_networth.is_some()
            || self.min_match_id.is_some()
            || self.max_match_id.is_some()
            || self.hero_matches_bounds() != (None, None)
            || self.hero_matches_total_bounds() != (None, None)
            || is_non_empty(self.hero_matches_total_buckets.as_deref())
            || self.has_ability_order_filter()
            || self.match_info().has_badge_filter()
            || !MatchMode::is_agg_servable(self.match_mode.as_deref())
    }

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

    /// Same as [`Self::hero_matches_bounds`], for the entire-history counts. The lowest
    /// [`Self::hero_matches_total_bucket_bounds`] is a minimum too.
    fn hero_matches_total_bounds(&self) -> (Option<u64>, Option<u64>) {
        let lowest_bucket = self
            .hero_matches_total_bucket_bounds()
            .first()
            .map(|&v| u64::from(v));
        (
            self.min_hero_matches_total
                .max(lowest_bucket)
                .filter(|&v| v > 1),
            self.max_hero_matches_total,
        )
    }

    /// The `hero_matches_total_buckets` lower bounds, sorted and distinct; empty without them.
    fn hero_matches_total_bucket_bounds(&self) -> Vec<u32> {
        let mut bounds = self.hero_matches_total_buckets.clone().unwrap_or_default();
        bounds.sort_unstable();
        bounds.dedup();
        bounds
    }

    /// The bucket expression of the base-table query: the lower bound of the player's
    /// entire-history bucket (`n_total`, from `t_players2`) when bucketing by it, else
    /// [`HeroStatsBucket::base_expr`].
    fn bucket_expr(&self) -> String {
        let bounds = self.hero_matches_total_bucket_bounds();
        let Some((&lowest, higher)) = bounds.split_first() else {
            return self.bucket.base_expr();
        };
        if higher.is_empty() {
            return format!("toUInt32({lowest})");
        }
        let branches = higher
            .iter()
            .rev()
            .map(|b| format!("n_total >= {b}, {b}"))
            .collect::<Vec<_>>()
            .join(", ");
        format!("toUInt32(multiIf({branches}, {lowest}))")
    }
}

/// Most `hero_matches_total_buckets` bounds a request may send.
const MAX_HERO_MATCHES_TOTAL_BUCKETS: usize = 10;

fn validate_hero_matches_total_buckets(query: &HeroStatsQuery) -> APIResult<()> {
    let Some(bounds) = query.hero_matches_total_buckets.as_deref() else {
        return Ok(());
    };
    if bounds.len() > MAX_HERO_MATCHES_TOTAL_BUCKETS {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "hero_matches_total_buckets takes at most {MAX_HERO_MATCHES_TOTAL_BUCKETS} bounds"
            ),
        ));
    }
    if !bounds.is_empty() && query.bucket != HeroStatsBucket::NoBucket {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "hero_matches_total_buckets only works with bucket=no_bucket".to_owned(),
        ));
    }
    Ok(())
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
/// few thousand groups (heroes × days) to the aggregation. `extra_settings` is appended to the
/// `SETTINGS` clause (empty or starting with a comma).
fn group_hero_days(columns: &str, days: &str, log_comment: &str, extra_settings: &str) -> String {
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
    SETTINGS log_comment = '{log_comment}', apply_patch_parts = 0{extra_settings}
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

/// The hero-stats rollup by match duration, rebuilt per day by `services/cohort_agg_refresh.rs`
/// from [`duration_agg_select_body`]: [`MV_GRAIN`] plus a duration key, so duration-filtered
/// requests, a fifth of hero-stats requests and ~1.7 `ClickHouse` cores of 30-day `match_player
/// FINAL` scans in 2026-11, read ~211k rollup rows a day instead of ~2.5M player rows. Its
/// columns are [`DURATION_GRAIN`], then [`MV_MEASURES`], then `built_through`.
pub(crate) const DURATION_AGG_TABLE: &str = "default.hero_stats_duration_agg";
pub(crate) const DURATION_AGG_STAGING: &str = "default.hero_stats_duration_agg_staging";
/// Days the refresh job checks for new matches every run. It keeps every day since
/// [`DURATION_AGG_FIRST_DAY`], rebuilding the rest once their build is a week old.
pub(crate) const DURATION_AGG_HORIZON_DAYS: u32 = 120;
/// The first day the rollup keeps: the data has no matches from 2024-04-30 to 2024-05-17, and
/// reads prune their late-match scans only while the built days form one run.
pub(crate) const DURATION_AGG_FIRST_DAY: &str = "2024-05-18";

/// Width in seconds of the open duration intervals of [`DURATION_KEY`].
const DURATION_STEP_S: u64 = 15;

/// The duration key: `2k` for a duration of exactly `k` steps of [`DURATION_STEP_S`], `2k + 1`
/// for one strictly between `k` and `k + 1` steps. Requests send whole minutes, quarter
/// minutes and `x99` upper bounds, all inclusive: 99.9% of the duration bounds of 2026-11-22 are a
/// multiple of 15 s or one less, which this key turns into exact key ranges (see
/// [`duration_key_bounds`]), where plain 15 s buckets would split the matches lasting exactly a
/// bound. Capped at [`MAX_DURATION_KEY`], which no real match reaches.
const DURATION_KEY: &str = "toUInt16(least(if(duration_s % 15 = 0, 2 * intDiv(duration_s, 15), \
                            2 * intDiv(duration_s, 15) + 1), 65535))";
const MAX_DURATION_KEY: u64 = 65_535;

/// Grain columns of [`DURATION_AGG_TABLE`], in table order, with the `match_player` expressions
/// of [`duration_rows`].
const DURATION_GRAIN: &[(&str, &str)] = &[
    ("game_mode", "game_mode"),
    ("match_mode", "match_mode"),
    ("least_badge", "ifNull(average_badge, 0)"),
    ("greatest_badge", "ifNull(average_badge, 65535)"),
    ("day", "toDate(start_time)"),
    ("duration_key", DURATION_KEY),
    ("hero_id", "hero_id"),
];

/// The inclusive duration key bounds selecting exactly the matches with `min <= duration_s <=
/// max`, for a key over steps of `step` seconds like [`DURATION_KEY`] (15 s) or
/// [`ITEM_DURATION_KEY`] (60 s), or `None` when a bound falls inside an open interval of the key:
/// a minimum must be a multiple of `step`, a maximum a multiple or one less.
fn duration_key_bounds(
    step: u64,
    min: Option<u64>,
    max: Option<u64>,
) -> Option<(Option<u64>, Option<u64>)> {
    let low = match min {
        None => None,
        Some(min) if min.checked_rem(step)? == 0 => Some(min.checked_div(step)?.checked_mul(2)?),
        Some(_) => return None,
    };
    let high = match max {
        None => None,
        Some(max) if max.checked_rem(step)? == 0 => Some(max.checked_div(step)?.checked_mul(2)?),
        // `duration_s <= max` is `duration_s < max + 1`: every key below the next step's.
        Some(max) if max.checked_add(1)?.checked_rem(step)? == 0 => Some(
            max.checked_add(1)?
                .checked_div(step)?
                .checked_mul(2)?
                .checked_sub(1)?,
        ),
        Some(_) => return None,
    };
    // Past the cap a key no longer tells durations apart.
    if low.max(high).is_some_and(|key| key >= MAX_DURATION_KEY) {
        return None;
    }
    Some((low, high))
}

/// The [`DURATION_AGG_TABLE`] rows of the matches selected by `since_clause`, at the full grain
/// and in the table's column order. The refresh job builds the rollup's days with it.
pub(crate) fn duration_agg_select_body(since_clause: &str) -> String {
    duration_rows(&EdgeRows::full_grain(DURATION_GRAIN, since_clause))
}

/// The hero-stats rollup by owned upgrade and match duration, rebuilt per day by
/// `services/cohort_agg_refresh.rs` from [`item_agg_select_body`]: per hero, the matches of the
/// players who bought the item, so a request filtering on one item (deadlocklabs and dedolog sweep
/// every item, ~2 `ClickHouse` cores of 30-day `match_player FINAL` scans in 2026-11) reads ~2.7k
/// rows a day of that item instead. It has no badge columns, and its duration key steps by a
/// minute: ~0.9M rows (57 MiB) a day where 15 s steps took 2.8M (98 MiB). Its columns are
/// [`ITEM_GRAIN`], then [`MV_MEASURES`], then `built_through`.
pub(crate) const ITEM_AGG_TABLE: &str = "default.hero_item_stats_agg";
pub(crate) const ITEM_AGG_STAGING: &str = "default.hero_item_stats_agg_staging";
/// Days the rollup keeps (~7 GiB); requests starting earlier read `match_player`.
pub(crate) const ITEM_AGG_HORIZON_DAYS: u32 = 120;

/// Width in seconds of the open duration intervals of [`ITEM_DURATION_KEY`].
const ITEM_DURATION_STEP_S: u64 = 60;

/// [`DURATION_KEY`] by whole minutes.
const ITEM_DURATION_KEY: &str = "toUInt16(least(if(duration_s % 60 = 0, 2 * intDiv(duration_s, 60), \
                                 2 * intDiv(duration_s, 60) + 1), 65535))";

/// Grain columns of [`ITEM_AGG_TABLE`], in table order, with the expressions of
/// [`item_agg_select_body`]: `item_id` is each upgrade the player owned.
const ITEM_GRAIN: &[(&str, &str)] = &[
    ("game_mode", "game_mode"),
    ("match_mode", "match_mode"),
    ("item_id", "item_id"),
    ("day", "toDate(start_time)"),
    ("duration_key", ITEM_DURATION_KEY),
    ("hero_id", "hero_id"),
];

/// The [`ITEM_AGG_TABLE`] rows of the matches selected by `since_clause`, at the full grain and
/// in the table's column order: each player row counts once for every upgrade it owned, the
/// ownership of the base query's `has(upgrades.item_id, id)`. The refresh job builds the rollup's
/// days with it.
pub(crate) fn item_agg_select_body(since_clause: &str) -> String {
    hero_rows(
        &EdgeRows::full_grain(ITEM_GRAIN, since_clause),
        ", duration_s, `upgrades.item_id` AS upgrade_ids",
        " AND account_id != 0",
        "\nARRAY JOIN arrayDistinct(upgrade_ids) AS item_id",
    )
}

fn mv_rows(edge: &EdgeRows) -> String {
    hero_rows(edge, "", "", "")
}

/// The rows of [`DURATION_AGG_TABLE`]: [`mv_rows`] with the duration the key is computed from,
/// and without anonymous players, as every rollup build skips them.
fn duration_rows(edge: &EdgeRows) -> String {
    hero_rows(edge, ", duration_s", " AND account_id != 0", "")
}

/// The hero-stats rollup rows of the matches `where_clause` selects, grouped by the grain columns
/// of `grain_select`/`group_by`. `extra_columns` (empty or starting with a comma) are read for
/// grain expressions beyond [`MV_GRAIN`]'s, `extra_filter` (empty or starting with ` AND`) is
/// added to the scan's filter, and `array_join` (empty or an `ARRAY JOIN` clause on its own line)
/// expands the deduplicated rows before they are grouped.
fn hero_rows(
    EdgeRows {
        where_clause,
        grain_select,
        group_by,
    }: &EdgeRows,
    extra_columns: &str,
    extra_filter: &str,
    array_join: &str,
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
        max_shots_missed, account_id, permanent_buffs, first_permanent_buff_time_s{extra_columns}
    FROM default.match_player
    WHERE match_mode IN ('Ranked', 'Unranked'){extra_filter} AND {where_clause}
    LIMIT 1 BY match_id, account_id
){array_join}
GROUP BY {group_by}"
    )
}

/// Builds the base-table rows of a rollup's partial days (see [`Rollup::source`]).
type EdgeRowsFn = fn(&EdgeRows) -> String;

/// The rollup a [`build_mv_query`] request reads, the base-table rows of its partial days and its
/// log comment, adding its duration filters, if any, to `filters`. `None` when no rollup serves
/// the request.
fn pick_rollup(
    query: &HeroStatsQuery,
    filters: &mut RollupFilters,
) -> Option<(Rollup<'static>, EdgeRowsFn, &'static str)> {
    if query.min_duration_s.is_some() || query.max_duration_s.is_some() {
        // A duration filter needs the duration rollup, and bounds its keys can express.
        let (min_key, max_key) =
            duration_key_bounds(DURATION_STEP_S, query.min_duration_s, query.max_duration_s)?;
        filters
            .rollup
            .extend(range_filters("duration_key", min_key, max_key));
        filters.base.extend(range_filters(
            "duration_s",
            query.min_duration_s,
            query.max_duration_s,
        ));
        let rollup = Rollup {
            table: DURATION_AGG_TABLE,
            grain: DURATION_GRAIN,
            measures: MV_MEASURES,
            // The table keeps every day; the horizon only matters for `Reach::Days`.
            coverage: Coverage::Incremental {
                horizon_days: u32::MAX,
            },
        };
        return Some((rollup, duration_rows, "hero_stats_duration_mv"));
    }
    // Pick the rollup: the hourly 65-day `hero_stats_agg_v2` for windows that start
    // comfortably inside its horizon (freshest data), else the 6-hourly full-history
    // `hero_stats_agg_all_v2` (covers all-time / old windows the hot view can't).
    let oldest_servable = rollup_oldest_servable(MV_HORIZON_DAYS)?;
    let (mv_table, mv_log_comment) = if query
        .min_unix_timestamp
        .is_some_and(|min_ts| min_ts >= oldest_servable)
    {
        ("hero_stats_agg_v2", "hero_stats_mv")
    } else {
        ("hero_stats_agg_all_v2", "hero_stats_mv_all")
    };
    let rollup = Rollup {
        table: mv_table,
        grain: MV_GRAIN,
        measures: MV_MEASURES,
        coverage: Coverage::Complete,
    };
    Some((rollup, mv_rows, mv_log_comment))
}

/// Builds a query against a pre-aggregated hero-stats rollup when the request falls
/// within the "global meta" subset they materialize, else `None` (the caller then
/// uses the base-table query). Both rollups are grained on
/// `(game_mode, day, hero_id, least_badge, greatest_badge)`, so they serve
/// `game_mode` + time-range + badge-range filters and the non-hourly buckets, but
/// anything per-player or per-row (account, item set, net worth, match id, hero match counts)
/// or needing sub-day resolution must use the base table. Duration filters read
/// [`DURATION_AGG_TABLE`] instead, when [`duration_key_bounds`] can express their bounds.
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
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    let personalized = query.account_id.is_some()
        || is_non_empty(query.account_ids.as_deref())
        || is_non_empty(query.include_item_ids.as_deref())
        || is_non_empty(query.exclude_item_ids.as_deref());
    let unsupported_filter = query.min_networth.is_some()
        || query.max_networth.is_some()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some()
        || query.hero_matches_bounds() != (None, None)
        || query.hero_matches_total_bounds() != (None, None)
        || is_non_empty(query.hero_matches_total_buckets.as_deref())
        || query.has_ability_order_filter();
    // The rollups only ingest Ranked/Unranked, so any other mode would read zero rows.
    let unsupported_match_mode = !MatchMode::is_agg_servable(query.match_mode.as_deref());
    if personalized || unsupported_filter || unsupported_match_mode {
        return None;
    }
    let split = DaySplit::new(query.min_unix_timestamp, query.max_unix_timestamp)?;

    let mut filters = RollupFilters::new(
        query.game_mode,
        query.match_mode.as_deref(),
        query.min_average_badge,
        query.max_average_badge,
    );
    let (rollup, edge_rows, mv_log_comment) = pick_rollup(query, &mut filters)?;
    let source = rollup.source(
        &split,
        &filters,
        &format!("hero_id, {bucket_expr}, day"),
        edge_rows,
    );
    let day_sums = MV_MEASURES
        .split(',')
        .map(|measure| format!("sum({0}) AS {0}", measure.trim()))
        .collect::<Vec<_>>()
        .join(", ");
    Some(rollup_hero_days(
        query,
        &format!(
            "
        SELECT hero_id, {bucket_expr} AS bucket, day, {day_sums}
        FROM {source}
        GROUP BY hero_id, bucket, day"
        ),
        mv_log_comment,
    ))
}

/// The response of a rollup read from `day_rows`, rows of [`MV_MEASURES`] per `hero_id`, `bucket`
/// and `day` (see [`group_hero_days`]).
fn rollup_hero_days(query: &HeroStatsQuery, day_rows: &str, log_comment: &str) -> String {
    let matches_per_bucket = if query.bucket == HeroStatsBucket::NoBucket {
        "matches"
    } else {
        "sum(sum(n_matches)) OVER (PARTITION BY bucket)"
    };
    group_hero_days(
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
        day_rows,
        log_comment,
        "",
    )
}

/// The one item a request filters on, with `true` when it includes it and `false` when it
/// excludes it, or `None` without item filters or with several.
fn single_item_filter(query: &HeroStatsQuery) -> Option<(u32, bool)> {
    let include = query.include_item_ids.as_deref().unwrap_or_default();
    let exclude = query.exclude_item_ids.as_deref().unwrap_or_default();
    match (include, exclude) {
        ([id], []) => Some((*id, true)),
        ([], [id]) => Some((*id, false)),
        _ => None,
    }
}

/// Rounds a duration bound to whole minutes, the steps of [`ITEM_DURATION_KEY`]: to the nearest
/// minute, except that a maximum one second short of a minute (`x59`) stays, as the key already
/// expresses it exactly.
fn round_duration_bound(value: u64, is_max: bool) -> Option<u64> {
    let step = ITEM_DURATION_STEP_S;
    if is_max && value.checked_add(1)?.checked_rem(step)? == 0 {
        return Some(value);
    }
    value
        .checked_add(step.checked_div(2)?)?
        .checked_div(step)?
        .checked_mul(step)
}

/// Adds the duration bounds `min`/`max` to `filters`: as a key range for a rollup keyed by
/// `step` seconds, and on `duration_s` for its base-table rows. `None` when the key can't express
/// them (see [`duration_key_bounds`]).
fn push_duration_filters(
    filters: &mut RollupFilters,
    step: u64,
    min: Option<u64>,
    max: Option<u64>,
) -> Option<()> {
    let (min_key, max_key) = duration_key_bounds(step, min, max)?;
    filters
        .rollup
        .extend(range_filters("duration_key", min_key, max_key));
    filters.base.extend(range_filters("duration_s", min, max));
    Some(())
}

/// Day rows (see [`rollup_hero_days`]) of the sums of `all_source` minus those of
/// `subtracted_source`, two rollup sources of [`MV_MEASURES`] where the second counts a subset of
/// the first's player rows.
fn difference_day_rows(bucket_expr: &str, all_source: &str, subtracted_source: &str) -> String {
    let measures = MV_MEASURES.split(',').map(str::trim).collect::<Vec<_>>();
    let signed = |sign: &str| {
        measures
            .iter()
            .map(|m| format!("{sign}toInt64({m}) AS {m}"))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let (plus, minus) = (signed(""), signed("-"));
    let day_sums = measures
        .iter()
        .map(|m| format!("toUInt64(sum({m})) AS {m}"))
        .collect::<Vec<_>>()
        .join(", ");
    // A hero whose players all owned the item that day has no rows in the base query.
    format!(
        "
        SELECT hero_id, bucket, day, {day_sums}
        FROM (
            SELECT hero_id, {bucket_expr} AS bucket, day, {plus} FROM {all_source}
            UNION ALL
            SELECT hero_id, {bucket_expr} AS bucket, day, {minus} FROM {subtracted_source}
        )
        GROUP BY hero_id, bucket, day
        HAVING n_matches > 0"
    )
}

/// Builds a query against [`ITEM_AGG_TABLE`] for a request filtering on one item, which the
/// caller has checked is an upgrade (shop item): the rollup holds no other items. `None` when the
/// request needs `match_player`: other per-player filters, a badge filter or bucket (the rollup
/// has no badge), a window starting before the rollup's horizon or without a whole day.
///
/// Its duration bounds are rounded to whole minutes (see [`round_duration_bound`]). An included
/// item reads the item's rows. An excluded one reads every match from [`DURATION_AGG_TABLE`] minus
/// the item's rows, which counts exactly the players without the item: every measure is a sum.
fn build_item_query(query: &HeroStatsQuery) -> Option<String> {
    let (item_id, include) = single_item_filter(query)?;
    if query.bucket == HeroStatsBucket::AvgBadge {
        return None;
    }
    let bucket_expr = query.bucket.mv_bucket_expr()?;
    if query.has_filter_beyond_item_rollup() {
        return None;
    }
    let split = DaySplit::new(query.min_unix_timestamp, query.max_unix_timestamp)?;
    let item_rollup = Rollup {
        table: ITEM_AGG_TABLE,
        grain: ITEM_GRAIN,
        measures: MV_MEASURES,
        coverage: Coverage::Incremental {
            horizon_days: ITEM_AGG_HORIZON_DAYS,
        },
    };
    // Days before the horizon would be read from `match_player` without the FINAL the base
    // query streams them with.
    if !item_rollup.serves(query.min_unix_timestamp, Reach::Days(0)) {
        return None;
    }
    let min_duration = match query.min_duration_s {
        Some(min) => Some(round_duration_bound(min, false)?),
        None => None,
    };
    let max_duration = match query.max_duration_s {
        Some(max) => Some(round_duration_bound(max, true)?),
        None => None,
    };
    let outer = format!("hero_id, {bucket_expr}, day");
    let mut item_filters =
        RollupFilters::new(query.game_mode, query.match_mode.as_deref(), None, None);
    item_filters.rollup.push(format!("item_id = {item_id}"));
    item_filters
        .base
        .push(format!("has(upgrades.item_id, {item_id})"));
    push_duration_filters(
        &mut item_filters,
        ITEM_DURATION_STEP_S,
        min_duration,
        max_duration,
    )?;
    // The base-table rows are the item's owners only, so their `item_id` is the item.
    let item_expr = format!("toUInt32({item_id})");
    let grain = ITEM_GRAIN
        .iter()
        .map(|&(col, expr)| {
            (
                col,
                if col == "item_id" {
                    item_expr.as_str()
                } else {
                    expr
                },
            )
        })
        .collect::<Vec<_>>();
    let item_source = Rollup {
        grain: &grain,
        ..item_rollup
    }
    .source(&split, &item_filters, &outer, duration_rows);
    let measures = MV_MEASURES.split(',').map(str::trim).collect::<Vec<_>>();
    let day_rows = if include {
        let day_sums = measures
            .iter()
            .map(|m| format!("sum({m}) AS {m}"))
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            "
        SELECT hero_id, {bucket_expr} AS bucket, day, {day_sums}
        FROM {item_source}
        GROUP BY hero_id, bucket, day"
        )
    } else {
        let mut all_filters =
            RollupFilters::new(query.game_mode, query.match_mode.as_deref(), None, None);
        push_duration_filters(
            &mut all_filters,
            DURATION_STEP_S,
            min_duration,
            max_duration,
        )?;
        let all_source = Rollup {
            table: DURATION_AGG_TABLE,
            grain: DURATION_GRAIN,
            measures: MV_MEASURES,
            coverage: Coverage::Incremental {
                horizon_days: u32::MAX,
            },
        }
        .source(&split, &all_filters, &outer, duration_rows);
        difference_day_rows(bucket_expr, &all_source, &item_source)
    };
    Some(rollup_hero_days(query, &day_rows, "hero_stats_item_mv"))
}

/// A player and hero as one integer, the key of the entire-history count lookups: sets and hash
/// tables over one `UInt64` build about twice as fast as over `(account_id, hero_id)` tuples.
/// Hero ids fit in a byte (`player_hero_match_counts.hero_id` is `UInt8`).
const PLAYER_HERO_KEY: &str = "toUInt64(account_id) * 256 + hero_id";

/// How the window's rows meet `t_players2`, the looked-up entire-history counts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TotalLookup {
    /// Keep the pairs in it.
    In,
    /// Drop the pairs in it.
    NotIn,
    /// Join it for `n_total`, keeping only the pairs in it.
    Inner,
    /// Join it for `n_total`; a pair missing from it counts as 0, the lowest bucket.
    Left,
}

impl TotalLookup {
    /// Whether the window reads `n_total` from it, for the bucket expression.
    const fn reads_count(self) -> bool {
        matches!(self, Self::Inner | Self::Left)
    }
}

/// The entire-history hero match count bounds of a request: the filter
/// (`min/max_hero_matches_total`, the lowest `hero_matches_total_buckets` bound) and the
/// second-lowest bucket bound, the first one that needs a player's count.
#[derive(Debug, Clone, Copy)]
struct HeroTotalCounts {
    min: Option<u64>,
    max: Option<u64>,
    second_bucket: Option<u64>,
}

impl HeroTotalCounts {
    fn new(query: &HeroStatsQuery) -> Self {
        let (min, max) = query.hero_matches_total_bounds();
        let second_bucket = query
            .hero_matches_total_bucket_bounds()
            .get(1)
            .map(|&bound| u64::from(bound));
        Self {
            min,
            max,
            second_bucket,
        }
    }

    /// Which pairs to read from `player_hero_match_counts` (a `matches` predicate) and how the window
    /// meets them; `None` when no bound filters or buckets.
    ///
    /// Every player in the window has played the hero at least once, so without a minimum above 1
    /// a pair needs a lookup only from the second bucket bound or above the maximum: the rest is
    /// in the lowest bucket. That reads the few pairs with many matches (5.5M of 73M normal-mode
    /// pairs have 25+) instead of all of them. A pair that is missing because the player started on
    /// the hero after the last refresh counts as having fewer matches than any bound above 1.
    fn lookup(&self) -> Option<(String, TotalLookup)> {
        match (self.min, self.second_bucket) {
            (Some(min), second) => {
                let lookup = if second.is_some() {
                    TotalLookup::Inner
                } else {
                    TotalLookup::In
                };
                Some((
                    range_filters("matches", Some(min), self.max).join(" AND "),
                    lookup,
                ))
            }
            (None, Some(second)) => {
                let lowest = self
                    .max
                    .map_or(second, |max| second.min(max.saturating_add(1)));
                Some((format!("matches >= {lowest}"), TotalLookup::Left))
            }
            (None, None) => self
                .max
                .map(|max| (format!("matches > {max}"), TotalLookup::NotIn)),
        }
    }
}

#[expect(
    clippy::too_many_lines,
    reason = "one linear query builder reads clearer than split helpers"
)]
fn build_query(query: &HeroStatsQuery) -> String {
    let (min_hero_matches, max_hero_matches) = query.hero_matches_bounds();
    let total_counts = HeroTotalCounts::new(query);
    let total_lookup = total_counts.lookup();
    // Only used by the CTE below, which exists only when a bound is set.
    let player_hero_filters =
        range_filters("uniq(match_id)", min_hero_matches, max_hero_matches).join(" AND ");
    let bucket_by_total = !query.hero_matches_total_bucket_bounds().is_empty();
    let bucket = query.bucket_expr();
    let scope = MatchScope::new(
        query.match_mode.as_deref(),
        query.game_mode,
        query.match_info(),
    );
    let game_mode_filter = scope.game_mode_sql();
    let match_filters = format!("AND {}", scope.sql());
    // The in-window hero match count spans the whole window: a duration filter (one bucket of the
    // by-duration chart) must not narrow it to the player's matches of that duration.
    let window_scope = MatchScope {
        info: MatchInfoFilters {
            min_duration_s: None,
            max_duration_s: None,
            ..scope.info
        },
        ..scope
    };
    let window_match_filters = format!("AND {}", window_scope.sql());
    let has_player_hero_cte = min_hero_matches.is_some() || max_hero_matches.is_some();
    let has_player_hero_total_cte = total_lookup.is_some();
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
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
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    let player_filters = PlayerFilters {
        account_id: query.account_id,
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
        // FINAL keeps every read off the projections; the `LIMIT 1 BY` reads could pick the item
        // projection, which has `items.item_id` but no `upgrades.*`.
        items_from_upgrades: use_final,
        ability_order_prefix: query.ability_order_prefix.as_deref(),
        ability_unlock_order_prefix: query.ability_unlock_order_prefix.as_deref(),
        ..Default::default()
    }
    .build();
    let player_filters = join_filters(&player_filters);
    let (final_clause, dedup_clause) = if use_final {
        (" FINAL", "")
    } else {
        ("", "LIMIT 1 BY match_id, account_id")
    };
    // A badge filter under FINAL leaves the passing rows scattered over most granules, and every
    // gap makes the reader look up the columns cache again for the rest of the range (ClickHouse
    // 26.10), which costs more than the decompression the cache saves. Measured on 39
    // CPU-weighted production queries, identical results: with a badge filter, 24% less CPU and
    // 36% less wall time (91+ over 88 days: CPU 40 -> 20 s, wall -75%); without one
    // (duration-only, nearly every row passes), the cache saves 40% of CPU.
    let extra_settings = if use_final && query.match_info().has_badge_filter() {
        ", use_columns_cache = 0"
    } else {
        ""
    };
    // Under FINAL, ClickHouse only moves sorting-key conditions to PREWHERE, so the match-level
    // filters would otherwise be applied after reading every column of every row. Duplicate
    // (match_id, account_id) versions are re-ingests that never differ in these match-level
    // columns (checked on partitions >= 100: 1,540 duplicate pairs, none differing), so
    // filtering before FINAL keeps the same rows, the same semantics as the `LIMIT 1 BY` path.
    // The player filters (items, ability order, net worth) come from the same re-ingested
    // metadata and go there too. Measured on 12 production queries each, identical results:
    // an included item CPU -26%, memory -72%; an excluded one CPU -11%, memory -21%.
    let (prewhere_clause, where_match_filters, where_player_filters) = if use_final {
        (
            format!("PREWHERE TRUE {match_filters} {player_filters}"),
            "",
            "",
        )
    } else {
        (
            String::new(),
            match_filters.as_str(),
            player_filters.as_str(),
        )
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
    // The entire-history counts come from player_hero_match_counts, rebuilt every 30 minutes
    // from player_match_history. Counting the window's pairs there at request time took 26 s on a
    // season window (32M pairs probed against 550M rows) and timed out. Only the pairs that
    // `HeroTotalCounts::lookup` needs are read, keyed by one packed integer: the IN sets and hash
    // tables over them are built single-threaded, so the smaller the faster.
    if let Some((matches_filter, lookup)) = &total_lookup {
        let n_total = if lookup.reads_count() {
            ", matches AS n_total"
        } else {
            ""
        };
        // Experience counts in the selected game mode only, so Street Brawl or bot games don't
        // lift a player into a higher bucket of the normal-mode stats. Without a game mode
        // (`game_mode=`), the modes add up.
        let counts = if query.game_mode.is_some() {
            format!(
                "player_hero_match_counts\n            WHERE {game_mode_filter} AND {matches_filter}"
            )
        } else {
            format!(
                "(SELECT account_id, hero_id, toUInt32(sum(matches)) AS matches FROM player_hero_match_counts GROUP BY account_id, hero_id)\n            WHERE {matches_filter}"
            )
        };
        ctes.push(format!(
            "t_players2 AS (
            SELECT {PLAYER_HERO_KEY} AS player_hero{n_total}
            FROM {counts}
        )"
        ));
    }
    let hero_matches_join = if has_player_hero_cte {
        "AND (account_id, hero_id) IN t_players"
    } else {
        ""
    };
    // Bucketing by the history count needs it on every row, so it joins instead of filtering:
    // one read of the window serves every bucket, where a request per bucket re-read it each time.
    let (hero_total_join, n_total_join) = match total_lookup.as_ref().map(|(_, lookup)| lookup) {
        Some(TotalLookup::In) => ("AND player_hero IN t_players2", String::new()),
        Some(TotalLookup::NotIn) => ("AND player_hero NOT IN t_players2", String::new()),
        Some(TotalLookup::Inner) => ("", " INNER JOIN t_players2 USING (player_hero)".to_owned()),
        Some(TotalLookup::Left) => (
            "",
            format!(
                " LEFT JOIN t_players2 USING (player_hero){}",
                total_counts
                    .max
                    .map_or_default(|max| format!(" WHERE ifNull(n_total, 0) <= {max}"))
            ),
        ),
        None => ("", String::new()),
    };
    let player_hero_column = if has_player_hero_total_cte {
        format!(", {PLAYER_HERO_KEY} AS player_hero")
    } else {
        String::new()
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
            start_time, average_badge, permanent_buffs, first_permanent_buff_time_s{player_hero_column}
        FROM {source_table}{final_clause}
        {prewhere_clause}
        WHERE TRUE
            {where_player_filters}
            {where_match_filters}
            {hero_matches_join}
            {hero_total_join}
        {dedup_clause}
    )"
    ));
    let with_clause = ctes.join(",\n    ");
    // The distinct count only where a time or badge bucket reads it: it costs more than the rest
    // of the aggregation. Experience buckets count rows instead: a (hero, day) group holds a match
    // once per player on that hero, so the two differ only when two players had the same hero in a
    // match (7 of 174M season rows). On a season window the distinct count took 40-80 of 120-200
    // CPU-s and 4 of 6 GiB.
    let (matches_per_bucket, distinct_matches) = if bucket_by_total {
        ("sum(sum(n_matches)) OVER (PARTITION BY bucket)", "")
    } else if query.bucket == HeroStatsBucket::NoBucket {
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
        FROM mp{n_total_join}
        GROUP BY hero_id, bucket, day"
        ),
        "hero_stats",
        extra_settings,
    )
}

cached_ch_query! {
    fn run_query(3600) -> Vec<AnalyticsHeroStats>;
}

/// `item_is_upgrade`: the request's one item filter (see [`single_item_filter`]) is an upgrade, so
/// [`build_item_query`] may serve it.
async fn get_hero_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroStatsQuery,
    item_is_upgrade: bool,
) -> APIResult<Arc<Vec<AnalyticsHeroStats>>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = item_is_upgrade
        .then(|| build_item_query(&query))
        .flatten()
        .or_else(|| build_mv_query(&query))
        .unwrap_or_else(|| build_query(&query));
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
    description = super::describe("
Retrieves performance statistics for each hero based on historical match data.

    ")
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
    validate_hero_matches_total_buckets(&query)?;
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    // The item rollup holds upgrades only; without the item list the base query serves.
    let item_is_upgrade = match single_item_filter(&query) {
        Some((item_id, _)) => state.assets_client.items().await.is_ok_and(|items| {
            items
                .iter()
                .any(|item| item.id() == item_id && item.item_type() == ItemType::Upgrade)
        }),
        None => false,
    };
    get_hero_stats(&state.ch_client_ro, query, item_is_upgrade)
        .await
        .map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;
    use crate::utils::sql::{MAX_FILTERING_AVERAGE_BADGE, MIN_FILTERING_AVERAGE_BADGE};

    #[test]
    fn net_worth_buckets_read_match_player_by_final_net_worth() {
        let query = HeroStatsQuery {
            bucket: HeroStatsBucket::NetWorthBy10000,
            min_unix_timestamp: Some(1_786_147_200),
            ..Default::default()
        };
        // The rollups have no per-player net worth.
        assert!(build_mv_query(&query).is_none());
        let item = HeroStatsQuery {
            include_item_ids: Some(vec![1_009_965_641]),
            ..query.clone()
        };
        assert!(build_item_query(&item).is_none());
        let sql = build_query(&query);
        assert_valid_sql(&sql);
        assert!(sql.contains("toUInt32(intDiv(net_worth, 10000) * 10000) AS bucket"));
        // Each bucket counts its own matches.
        assert!(sql.contains("count(distinct match_id) AS n_distinct_matches"));
        assert_eq!(
            serde_json::from_str::<HeroStatsBucket>("\"net_worth_by_2000\"").unwrap(),
            HeroStatsBucket::NetWorthBy2000
        );
        assert_eq!(
            HeroStatsBucket::NetWorthBy5000.to_string(),
            "net_worth_by_5000"
        );
    }

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
    fn badge_filtered_final_read_skips_the_columns_cache() {
        let window = HeroStatsQuery {
            min_unix_timestamp: Some(1_786_147_200),
            min_duration_s: Some(1800),
            ..Default::default()
        };
        let badge = build_query(&HeroStatsQuery {
            min_average_badge: Some(91),
            ..window.clone()
        });
        assert_valid_sql(&badge);
        assert!(badge.contains("FINAL"));
        assert!(badge.contains("use_columns_cache = 0"));
        // Duration-only and all-badge bounds keep the cache.
        assert!(!build_query(&window).contains("use_columns_cache"));
        let all_badges = build_query(&HeroStatsQuery {
            min_average_badge: Some(MIN_FILTERING_AVERAGE_BADGE),
            max_average_badge: Some(MAX_FILTERING_AVERAGE_BADGE),
            ..window.clone()
        });
        assert!(!all_badges.contains("use_columns_cache"));
        // Account-scoped reads dedup with `LIMIT 1 BY` and keep the cache.
        #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
        let account = build_query(&HeroStatsQuery {
            min_average_badge: Some(91),
            account_id: Some(1),
            ..window
        });
        assert!(!account.contains("FINAL"));
        assert!(!account.contains("use_columns_cache"));
    }

    #[test]
    fn item_filters_read_upgrades_only_under_final() {
        let query = HeroStatsQuery {
            min_unix_timestamp: Some(1_786_147_200),
            include_item_ids: Some(vec![1]),
            exclude_item_ids: Some(vec![2]),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM match_player FINAL"));
        assert!(sql.contains("has(upgrades.item_id, 1)"));
        assert!(sql.contains("has(upgrades.item_id, 2)"));
        assert!(!sql.contains("hasAll(items.item_id"));
        // Under FINAL the item filters are PREWHERE, with the match-level filters.
        let (_, final_read) = sql
            .split_once("PREWHERE")
            .expect("FINAL read has a PREWHERE");
        let (prewhere, rest) = final_read.split_once("WHERE").expect("PREWHERE then WHERE");
        let (where_clause, _) = rest.split_once("SELECT").expect("the CTE, then its query");
        assert!(prewhere.contains("has(upgrades.item_id, 1)"));
        assert!(prewhere.contains("has(upgrades.item_id, 2)"));
        assert!(!where_clause.contains("item_id"));

        // `LIMIT 1 BY` reads may be served by a projection without `upgrades.*`.
        let sql = build_query(&HeroStatsQuery {
            min_hero_matches: Some(5),
            ..query
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("hasAll(items.item_id, [1])"));
        assert!(!sql.contains("upgrades.item_id"));
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
            bucket: HeroStatsBucket::StartTimeDay,
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
        assert!(sql.contains("IN t_players\n"));
        // Without a game mode the counts of every mode add up.
        assert!(sql.contains("GROUP BY account_id, hero_id)\n            WHERE matches > 24\n"));
        assert!(sql.contains("AND player_hero NOT IN t_players2\n"));
    }

    #[test]
    fn entire_history_filter_reads_window_players_with_final() {
        let sql = build_query(&HeroStatsQuery {
            min_unix_timestamp: Some(1_786_147_200),
            max_hero_matches_total: Some(24),
            game_mode: Some(GameMode::Normal),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        // A maximum alone drops the few players above it instead of keeping everyone below.
        assert!(sql.contains(
            "SELECT toUInt64(account_id) * 256 + hero_id AS player_hero\n            FROM player_hero_match_counts\n            WHERE game_mode = 1 AND matches > 24\n"
        ));
        assert!(sql.contains("AND player_hero NOT IN t_players2\n"));
        assert!(!sql.contains("player_match_history"));
        assert!(sql.contains("FROM match_player FINAL"));
        assert!(!sql.contains("LIMIT 1 BY"));
    }

    #[test]
    fn entire_history_buckets_join_one_window_read() {
        let query = HeroStatsQuery {
            min_unix_timestamp: Some(1_786_147_200),
            min_average_badge: Some(91),
            hero_matches_total_buckets: Some(vec![100, 25, 1, 25]),
            game_mode: Some(GameMode::Normal),
            ..Default::default()
        };
        assert!(build_mv_query(&query).is_none());
        let sql = build_query(&query);
        assert_valid_sql(&sql);
        assert!(sql.contains(
            "SELECT toUInt64(account_id) * 256 + hero_id AS player_hero, matches AS n_total\n"
        ));
        // A lowest bound of 1 filters nothing: every player in the window has a match, so only
        // the players from the second bound up are looked up and the rest are the lowest bucket.
        assert!(sql.contains("WHERE game_mode = 1 AND matches >= 25\n"));
        assert!(!sql.contains("player_hero IN t_players2"));
        assert!(sql.contains("FROM mp LEFT JOIN t_players2 USING (player_hero)\n"));
        assert!(
            sql.contains("sum(sum(n_matches)) OVER (PARTITION BY bucket) AS matches_per_bucket")
        );
        assert!(!sql.contains("count(distinct match_id)"));
        assert!(sql.contains(
            "first_permanent_buff_time_s, toUInt64(account_id) * 256 + hero_id AS player_hero\n"
        ));
        assert!(
            sql.contains("toUInt32(multiIf(n_total >= 100, 100, n_total >= 25, 25, 1)) AS bucket")
        );
        assert!(sql.contains("FROM match_player FINAL"));
        // The window is read once: the counts are looked up without a set of the window's players.
        assert_eq!(sql.matches("FROM match_player").count(), 1);

        // The lowest bound and the bounds parameters are both minimums.
        let sql = build_query(&HeroStatsQuery {
            hero_matches_total_buckets: Some(vec![10]),
            min_hero_matches_total: Some(5),
            max_hero_matches_total: Some(50),
            ..query.clone()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("WHERE game_mode = 1 AND matches >= 10 AND matches <= 50\n"));
        assert!(sql.contains("AND player_hero IN t_players2\n"));
        assert!(sql.contains("toUInt32(10) AS bucket"));

        // A lowest bound above 1 keeps only the players looked up.
        let sql = build_query(&HeroStatsQuery {
            hero_matches_total_buckets: Some(vec![10, 50]),
            ..query.clone()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("WHERE game_mode = 1 AND matches >= 10\n"));
        assert!(sql.contains("FROM mp INNER JOIN t_players2 USING (player_hero)\n"));
        assert!(sql.contains("toUInt32(multiIf(n_total >= 50, 50, 10)) AS bucket"));

        // A maximum below the second bound: the lookup starts above the maximum, which drops them.
        let sql = build_query(&HeroStatsQuery {
            max_hero_matches_total: Some(20),
            ..query.clone()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("WHERE game_mode = 1 AND matches >= 21\n"));
        assert!(sql.contains(
            "FROM mp LEFT JOIN t_players2 USING (player_hero) WHERE ifNull(n_total, 0) <= 20\n"
        ));

        // One bound of 1 neither filters nor needs a count.
        let sql = build_query(&HeroStatsQuery {
            hero_matches_total_buckets: Some(vec![1]),
            ..query
        });
        assert_valid_sql(&sql);
        assert!(!sql.contains("t_players2"));
        assert!(!sql.contains("player_hero"));
        assert!(sql.contains("toUInt32(1) AS bucket"));
    }

    #[test]
    fn entire_history_buckets_need_no_bucket() {
        let query = HeroStatsQuery {
            hero_matches_total_buckets: Some(vec![1, 25, 100]),
            ..Default::default()
        };
        validate_hero_matches_total_buckets(&query).unwrap();
        assert!(
            validate_hero_matches_total_buckets(&HeroStatsQuery {
                bucket: HeroStatsBucket::StartTimeDay,
                ..query.clone()
            })
            .is_err()
        );
        assert!(
            validate_hero_matches_total_buckets(&HeroStatsQuery {
                hero_matches_total_buckets: Some((1..=11).collect()),
                ..query
            })
            .is_err()
        );
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

    #[test]
    fn duration_keys_select_exactly_the_duration_bounds() {
        assert_eq!(
            duration_key_bounds(DURATION_STEP_S, None, None),
            Some((None, None))
        );
        // Quarter-minute bounds, both inclusive: matches lasting exactly a bound are their own key.
        assert_eq!(
            duration_key_bounds(DURATION_STEP_S, Some(1350), Some(2250)),
            Some((Some(180), Some(300)))
        );
        // `x99` maxima: every key below the next step's.
        assert_eq!(
            duration_key_bounds(DURATION_STEP_S, Some(0), Some(1199)),
            Some((Some(0), Some(159)))
        );
        assert_eq!(
            duration_key_bounds(DURATION_STEP_S, None, Some(14)),
            Some((None, Some(1)))
        );
        // Bounds inside an open interval of the key, and keys past the cap.
        assert_eq!(duration_key_bounds(DURATION_STEP_S, Some(1351), None), None);
        assert_eq!(duration_key_bounds(DURATION_STEP_S, None, Some(1201)), None);
        assert_eq!(
            duration_key_bounds(DURATION_STEP_S, Some(491_520), None),
            None
        );
        assert_eq!(
            duration_key_bounds(DURATION_STEP_S, None, Some(u64::MAX)),
            None
        );
        // The key's expression uses the same step.
        assert!(DURATION_KEY.contains(&format!("duration_s % {DURATION_STEP_S} = 0")));
    }

    #[test]
    fn duration_rollup_rows_have_the_table_column_order() {
        let body = duration_agg_select_body("TRUE");
        crate::utils::proptest_utils::assert_parses(&body);
        assert!(body.contains("first_permanent_buff_time_s, duration_s\n"));
        assert!(body.contains("AND account_id != 0 AND TRUE"));
        let outer = body.split("\nFROM (").next().expect("outer select");
        let columns = outer
            .split(",\n")
            .filter_map(|item| item.trim().rsplit_once(" AS "))
            .map(|(_, col)| col)
            .collect::<Vec<_>>();
        let expected = DURATION_GRAIN
            .iter()
            .map(|(col, _)| *col)
            .chain(MV_MEASURES.split(',').map(str::trim))
            .collect::<Vec<_>>();
        assert_eq!(columns, expected);
    }

    #[test]
    fn duration_filters_read_the_duration_rollup() {
        let query = HeroStatsQuery {
            // 2026-10-05 14:00 UTC, open-ended.
            min_unix_timestamp: Some(1_791_208_800),
            min_duration_s: Some(1350),
            max_duration_s: Some(2249),
            min_average_badge: Some(21),
            max_average_badge: Some(26),
            ..Default::default()
        };
        let sql = build_mv_query(&query).expect("routes to the duration rollup");
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM default.hero_stats_duration_agg WHERE "));
        assert!(sql.contains("duration_key >= 180 AND duration_key <= 299"));
        assert!(sql.contains("built_through > 0"));
        assert!(sql.contains("'hero_stats_duration_mv'"));
        // The partial first day and the late matches come from match_player, with the duration
        // pushed into the scan.
        assert!(sql.contains("duration_s >= 1350 AND duration_s <= 2249"));
        assert!(sql.contains("AND account_id != 0 AND"));
        assert!(!sql.contains("FINAL"));
        assert!(!sql.contains("hero_stats_agg_v2"));
        // Without a duration filter the request keeps the duration-less rollups and SQL.
        let plain = build_mv_query(&HeroStatsQuery {
            min_duration_s: None,
            max_duration_s: None,
            ..query.clone()
        })
        .expect("routes to a rollup");
        assert!(!plain.contains("duration"));
        assert!(!plain.contains("account_id != 0"));
        // A bound the key can't express: the base table.
        assert!(
            build_mv_query(&HeroStatsQuery {
                min_duration_s: Some(1351),
                ..query
            })
            .is_none()
        );
    }

    /// Midnight UTC `days` days ago: windows inside the item rollup's horizon.
    fn days_ago(days: i64) -> i64 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("after the epoch")
            .as_secs()
            .cast_signed();
        (now / 86_400 - days) * 86_400
    }

    #[test]
    fn item_duration_bounds_round_to_whole_minutes() {
        assert_eq!(round_duration_bound(1770, false), Some(1800));
        assert_eq!(round_duration_bound(1749, false), Some(1740));
        assert_eq!(round_duration_bound(2970, true), Some(3000));
        // A maximum one second short of a minute is already exact.
        assert_eq!(round_duration_bound(1799, true), Some(1799));
        assert_eq!(round_duration_bound(1799, false), Some(1800));
        assert!(ITEM_DURATION_KEY.contains(&format!("duration_s % {ITEM_DURATION_STEP_S} = 0")));
    }

    #[test]
    fn item_rollup_rows_have_the_table_column_order() {
        let body = item_agg_select_body("TRUE");
        crate::utils::proptest_utils::assert_parses(&body);
        assert!(body.contains("`upgrades.item_id` AS upgrade_ids\n"));
        assert!(body.contains(")\nARRAY JOIN arrayDistinct(upgrade_ids) AS item_id\nGROUP BY"));
        let outer = body.split("\nFROM (").next().expect("outer select");
        let columns = outer
            .split(",\n")
            .filter_map(|item| item.trim().rsplit_once(" AS "))
            .map(|(_, col)| col)
            .collect::<Vec<_>>();
        let expected = ITEM_GRAIN
            .iter()
            .map(|(col, _)| *col)
            .chain(MV_MEASURES.split(',').map(str::trim))
            .collect::<Vec<_>>();
        assert_eq!(columns, expected);
    }

    #[test]
    fn one_included_item_reads_the_item_rollup() {
        let query = HeroStatsQuery {
            min_unix_timestamp: Some(days_ago(30)),
            include_item_ids: Some(vec![1_219_329_868]),
            min_duration_s: Some(1770),
            ..Default::default()
        };
        let sql = build_item_query(&query).expect("routes to the item rollup");
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM default.hero_item_stats_agg WHERE "));
        assert!(sql.contains("item_id = 1219329868 AND duration_key >= 60"));
        // The late matches come from the item's owners in match_player, rounded like the key.
        assert!(sql.contains("has(upgrades.item_id, 1219329868) AND duration_s >= 1800"));
        assert!(sql.contains("toUInt32(1219329868) AS item_id"));
        assert!(sql.contains("'hero_stats_item_mv'"));
        assert!(!sql.contains("hero_stats_duration_agg"));
        assert!(!sql.contains("FINAL"));
    }

    #[test]
    fn one_excluded_item_subtracts_the_item_rollup_from_all_matches() {
        let query = HeroStatsQuery {
            min_unix_timestamp: Some(days_ago(30)),
            exclude_item_ids: Some(vec![2_417_568_017]),
            min_duration_s: Some(2100),
            bucket: HeroStatsBucket::StartTimeDay,
            ..Default::default()
        };
        let sql = build_item_query(&query).expect("routes to the item rollup");
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM default.hero_stats_duration_agg WHERE "));
        assert!(sql.contains("duration_key >= 280"));
        assert!(sql.contains("FROM default.hero_item_stats_agg WHERE "));
        assert!(sql.contains("item_id = 2417568017 AND duration_key >= 70"));
        assert!(sql.contains("-toInt64(n_matches) AS n_matches"));
        assert!(sql.contains("HAVING n_matches > 0"));
    }

    #[test]
    fn item_rollup_skips_what_it_cannot_serve() {
        let query = HeroStatsQuery {
            min_unix_timestamp: Some(days_ago(30)),
            include_item_ids: Some(vec![1]),
            ..Default::default()
        };
        assert!(build_item_query(&query).is_some());
        for unservable in [
            HeroStatsQuery {
                include_item_ids: Some(vec![1, 2]),
                ..query.clone()
            },
            HeroStatsQuery {
                exclude_item_ids: Some(vec![2]),
                ..query.clone()
            },
            HeroStatsQuery {
                min_average_badge: Some(91),
                ..query.clone()
            },
            HeroStatsQuery {
                bucket: HeroStatsBucket::AvgBadge,
                ..query.clone()
            },
            HeroStatsQuery {
                min_unix_timestamp: Some(days_ago(200)),
                ..query.clone()
            },
            HeroStatsQuery {
                min_networth: Some(1),
                ..query.clone()
            },
            HeroStatsQuery {
                include_item_ids: None,
                ..query.clone()
            },
        ] {
            assert!(build_item_query(&unservable).is_none(), "{unservable:?}");
        }
        // Not a request the duration-less rollups serve either.
        assert!(build_mv_query(&query).is_none());
    }
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::{assert_valid_sql, dump_sql};

    #[test]
    fn sql_dump() {
        dump_sql("hero_stats", |q: &HeroStatsQuery| {
            [Some(build_query(q)), build_mv_query(q)]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(
                    "
",
                )
        });
    }

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
            #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
            {
                query.account_id = None;
            }
            query.account_ids = None;
            query.include_item_ids = None;
            query.exclude_item_ids = None;
            query.min_networth = None;
            query.max_networth = None;
            query.min_match_id = None;
            query.max_match_id = None;
            query.min_hero_matches = None;
            query.max_hero_matches = None;
            query.min_hero_matches_total = None;
            query.max_hero_matches_total = None;
            query.hero_matches_total_buckets = None;
            query.ability_order_prefix = None;
            query.ability_unlock_order_prefix = None;
            query.min_unix_timestamp = Some(i64::MAX / 2);
            if let Some(mv) = build_mv_query(&query) {
                assert_valid_sql(&mv);
            }
        }
    }
}
