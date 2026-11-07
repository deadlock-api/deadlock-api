use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};
use strum::{Display, VariantArray};
use tracing::debug;
use utoipa::openapi::schema::{KnownFormat, ObjectBuilder, Schema, SchemaFormat, Type};
use utoipa::openapi::{Ref, RefOr};
use utoipa::{IntoParams, PartialSchema as _, ToSchema};

use super::common_filters::{
    MatchScope, PlayerFilters, account_match_prefilter, filter_protected_accounts, join_filters,
    round_timestamps,
};
use crate::context::AppState;
use crate::error::APIResult;
use crate::services::ch_cost::TrackedQuery as _;
use crate::utils::match_modes::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};
use crate::utils::sql::{cached_ch_query, impl_match_info};

/// How to split the metrics.
#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub(crate) enum BucketQuery {
    /// No Bucketing: the response is one metrics object.
    #[default]
    NoBucket,
    /// Bucket By Hero: the response is a list with one metrics object per hero, each with the
    /// hero id in `bucket`. Combine with `hero_ids` to get only those heroes.
    Hero,
}

impl BucketQuery {
    /// The bucket expression against `match_player`, `None` without bucketing.
    const fn expr(self) -> Option<&'static str> {
        match self {
            Self::NoBucket => None,
            Self::Hero => Some("toUInt32(hero_id)"),
        }
    }
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct PlayerStatsMetricsQuery {
    /// Bucket allows you to group the stats by a specific field.
    #[serde(default)]
    #[param(inline)]
    bucket: BucketQuery,
    /// Filter matches based on the hero IDs. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
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
    /// The maximum number of matches to analyze.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
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
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "steam_id::de::account_ids_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
    /// Also return the permanent buff (power-up) pickup metrics `permanent_buffs`,
    /// `permanent_buffs_per_min` and `first_permanent_buff_time_s`. Off by default because
    /// the buff columns are not in the per-hero projection, which roughly doubles the cost of
    /// hero-filtered requests.
    /// `first_permanent_buff_time_s` only covers matches since build 6712 (2026-09-29), which
    /// record pickup times; its values are `null` when the filter matches none of them.
    #[serde(default)]
    #[param(default = false)]
    include_buff_metrics: bool,
}

impl_match_info!(PlayerStatsMetricsQuery);

/// One metric's distribution over single matches. Every value is `null` (NaN) when no matching
/// match has the metric, e.g. `first_permanent_buff_time_s` for matches before build 6712.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub(super) struct MetricValues {
    #[schema(value_type = Option<f64>, required = true)]
    avg: f64,
    #[schema(value_type = Option<f64>, required = true)]
    std: f64,
    #[schema(value_type = Option<f64>, required = true)]
    percentile1: f64,
    #[schema(value_type = Option<f64>, required = true)]
    percentile5: f64,
    #[schema(value_type = Option<f64>, required = true)]
    percentile10: f64,
    #[schema(value_type = Option<f64>, required = true)]
    percentile25: f64,
    #[schema(value_type = Option<f64>, required = true)]
    percentile50: f64,
    #[schema(value_type = Option<f64>, required = true)]
    percentile75: f64,
    #[schema(value_type = Option<f64>, required = true)]
    percentile90: f64,
    #[schema(value_type = Option<f64>, required = true)]
    percentile95: f64,
    #[schema(value_type = Option<f64>, required = true)]
    percentile99: f64,
}

impl MetricValues {
    /// `quantiles` holds the nine `QUANTILES` levels in order. A short (e.g. empty) array yields
    /// `nan` (serialized as `null`) for the missing percentiles instead of panicking.
    fn from_stats(avg: f64, std: f64, quantiles: &[f64]) -> Self {
        let q = |i: usize| quantiles.get(i).copied().unwrap_or(f64::NAN);
        Self {
            avg,
            std,
            percentile1: q(0),
            percentile5: q(1),
            percentile10: q(2),
            percentile25: q(3),
            percentile50: q(4),
            percentile75: q(5),
            percentile90: q(6),
            percentile95: q(7),
            percentile99: q(8),
        }
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, VariantArray, ToSchema, Display,
)]
#[strum(serialize_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub(super) enum Metric {
    Kills,
    Deaths,
    Assists,
    NetWorth,
    NetWorthPerMin,
    Denies,
    LastHits,
    CritShotRate,
    Accuracy,
    Kd,
    Kda,
    KillsPlusAssists,
    PlayerDamage,
    PlayerDamagePerHealth,
    PlayerDamagePerMin,
    PlayerDamageTakenPerMin,
    NeutralDamage,
    NeutralDamagePerMin,
    BossDamage,
    BossDamagePerMin,
    SelfHealing,
    /// All healing the player did, self healing included (Valve's `player_healing` is
    /// `self_healing + teammate_healing`).
    PlayerHealing,
    /// Deprecated: the same values as `player_healing`. It used to add `self_healing` to
    /// `player_healing`, which counted self healing twice.
    Healing,
    SelfHealingPerMin,
    PlayerHealingPerMin,
    /// Deprecated: the same values as `player_healing_per_min` (see `healing`).
    HealingPerMin,
    TeammateHealing,
    TeammateBarriering,
    HealPrevented,
    // The buff metrics below are only computed with `include_buff_metrics=true`
    // (see `Metric::is_buff`).
    PermanentBuffs,
    PermanentBuffsPerMin,
    // Only rows with pickup timings (matches since build 6712) contribute.
    FirstPermanentBuffTimeS,
}

impl Metric {
    pub(super) const fn get_select_clause(self) -> &'static str {
        match self {
            Self::Kills => "kills",
            Self::Deaths => "deaths",
            Self::Assists => "assists",
            Self::NetWorth => "net_worth",
            Self::NetWorthPerMin => "net_worth / duration_m",
            Self::Denies => "denies",
            Self::LastHits => "last_hits",
            // `hero_bullets_hit` already counts the crits.
            Self::CritShotRate => "max_hero_bullets_hit_crit / greatest(1, max_hero_bullets_hit)",
            Self::Accuracy => "max_shots_hit / greatest(1, max_shots_hit + max_shots_missed)",
            Self::Kd => "kills / greatest(1, deaths)",
            Self::Kda => "(kills + assists) / greatest(1, deaths)",
            Self::KillsPlusAssists => "kills + assists",
            Self::PlayerDamage => "max_player_damage",
            Self::PlayerDamagePerHealth => "max_player_damage / greatest(1, max_max_health)",
            Self::PlayerDamagePerMin => "max_player_damage / duration_m",
            Self::PlayerDamageTakenPerMin => "max_player_damage_taken / duration_m",
            Self::NeutralDamage => "max_neutral_damage",
            Self::NeutralDamagePerMin => "max_neutral_damage / duration_m",
            Self::BossDamage => "max_boss_damage",
            Self::BossDamagePerMin => "max_boss_damage / duration_m",
            Self::SelfHealing => "max_self_healing",
            Self::PlayerHealing | Self::Healing => "max_player_healing",
            Self::SelfHealingPerMin => "max_self_healing / duration_m",
            Self::PlayerHealingPerMin | Self::HealingPerMin => "max_player_healing / duration_m",
            Self::TeammateHealing => "max_teammate_healing",
            Self::TeammateBarriering => "max_teammate_barriering",
            Self::HealPrevented => "max_heal_prevented",
            Self::PermanentBuffs => "permanent_buffs",
            Self::PermanentBuffsPerMin => "permanent_buffs / duration_m",
            Self::FirstPermanentBuffTimeS => "first_permanent_buff_time_s",
        }
    }

    /// The metric whose columns a deprecated alias reads, `None` for a metric with its own.
    /// Aliases are not computed, only answered from their target.
    pub(super) const fn alias_of(self) -> Option<Self> {
        match self {
            Self::Healing => Some(Self::PlayerHealing),
            Self::HealingPerMin => Some(Self::PlayerHealingPerMin),
            _ => None,
        }
    }

    /// Buff metrics read the buff pickup columns, which no `match_player` projection carries,
    /// so they are only computed on request (`include_buff_metrics`).
    pub(super) const fn is_buff(self) -> bool {
        matches!(
            self,
            Self::PermanentBuffs | Self::PermanentBuffsPerMin | Self::FirstPermanentBuffTimeS
        )
    }
}

/// The metrics object: per metric, its distribution over single matches. The buff metrics
/// (`permanent_buffs`, `permanent_buffs_per_min`, `first_permanent_buff_time_s`) are only present
/// with `include_buff_metrics=true`.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(transparent)]
pub(super) struct PlayerStatsMetrics(HashMap<Metric, MetricValues>);

/// One bucket's metrics: the metrics object of an unbucketed response, plus the bucket.
#[derive(Debug, Clone, Serialize)]
pub(super) struct PlayerStatsMetricsBucket {
    /// The bucket's value: the hero id for `bucket=hero`.
    bucket: u32,
    #[serde(flatten)]
    metrics: PlayerStatsMetrics,
}

/// Written by hand: the derived schema is `allOf` the metrics map and `{bucket}`, which no
/// object satisfies, because the map's key enum and value schema both reject `bucket`.
impl utoipa::PartialSchema for PlayerStatsMetricsBucket {
    fn schema() -> RefOr<Schema> {
        let bucket = ObjectBuilder::new()
            .schema_type(Type::Integer)
            .format(Some(SchemaFormat::KnownFormat(KnownFormat::Int32)))
            .minimum(Some(0))
            .description(Some("The bucket's value: the hero id for `bucket=hero`."));
        ObjectBuilder::new()
            .description(Some(
                "One bucket's metrics: `bucket`, and per metric the same values as an unbucketed \
                 response.",
            ))
            .property("bucket", bucket)
            .required("bucket")
            .additional_properties(Some(Ref::from_schema_name(MetricValues::name())))
            .into()
    }
}

impl ToSchema for PlayerStatsMetricsBucket {
    fn schemas(schemas: &mut Vec<(String, RefOr<Schema>)>) {
        schemas.push((MetricValues::name().into(), MetricValues::schema()));
        <MetricValues as ToSchema>::schemas(schemas);
    }
}

/// One metrics object without `bucket`, one per bucket with it.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(untagged)]
pub(super) enum PlayerStatsMetricsResponse {
    Metrics(PlayerStatsMetrics),
    Buckets(Vec<PlayerStatsMetricsBucket>),
}

/// Declares [`AnalyticsPlayerStatsMetricsRow`], with an `avg_*`, `std_*` and `quantiles_*` column
/// per metric in [`Metric::VARIANTS`] order (the order [`build_query`] selects them in), and
/// [`Metric::extract_values`], which reads one metric's three columns, or for an alias
/// ([`Metric::alias_of`]) its target's.
macro_rules! metrics_row {
    (
        aliases { $($alias:ident => $target:ident;)* }
        $($metric:ident => $avg:ident, $std:ident, $quantiles:ident;)*
    ) => {
        #[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
        pub(super) struct AnalyticsPlayerStatsMetricsRow {
            $($avg: f64, $std: f64, $quantiles: Vec<f64>,)*
        }

        /// An [`AnalyticsPlayerStatsMetricsRow`] with its bucket, from a bucketed [`build_query`].
        #[derive(Debug, Clone, Row, Serialize, Deserialize)]
        pub(super) struct AnalyticsPlayerStatsMetricsBucketRow {
            bucket: u32,
            $($avg: f64, $std: f64, $quantiles: Vec<f64>,)*
        }

        impl AnalyticsPlayerStatsMetricsBucketRow {
            fn to_parts(&self) -> (u32, AnalyticsPlayerStatsMetricsRow) {
                (
                    self.bucket,
                    AnalyticsPlayerStatsMetricsRow {
                        $($avg: self.$avg, $std: self.$std, $quantiles: self.$quantiles.clone(),)*
                    },
                )
            }
        }

        impl Metric {
            pub(super) fn extract_values(self, row: &AnalyticsPlayerStatsMetricsRow) -> MetricValues {
                match self {
                    $(Self::$metric => MetricValues::from_stats(row.$avg, row.$std, &row.$quantiles),)*
                    $(Self::$alias => Self::$target.extract_values(row),)*
                }
            }
        }
    };
}

metrics_row! {
    aliases {
        Healing => PlayerHealing;
        HealingPerMin => PlayerHealingPerMin;
    }
    Kills => avg_kills, std_kills, quantiles_kills;
    Deaths => avg_deaths, std_deaths, quantiles_deaths;
    Assists => avg_assists, std_assists, quantiles_assists;
    NetWorth => avg_net_worth, std_net_worth, quantiles_net_worth;
    NetWorthPerMin => avg_net_worth_per_min, std_net_worth_per_min, quantiles_net_worth_per_min;
    Denies => avg_denies, std_denies, quantiles_denies;
    LastHits => avg_last_hits, std_last_hits, quantiles_last_hits;
    CritShotRate => avg_crit_shot_rate, std_crit_shot_rate, quantiles_crit_shot_rate;
    Accuracy => avg_accuracy, std_accuracy, quantiles_accuracy;
    Kd => avg_kd, std_kd, quantiles_kd;
    Kda => avg_kda, std_kda, quantiles_kda;
    KillsPlusAssists => avg_kills_plus_assists, std_kills_plus_assists, quantiles_kills_plus_assists;
    PlayerDamage => avg_player_damage, std_player_damage, quantiles_player_damage;
    PlayerDamagePerHealth => avg_player_damage_per_health, std_player_damage_per_health, quantiles_player_damage_per_health;
    PlayerDamagePerMin => avg_player_damage_per_min, std_player_damage_per_min, quantiles_player_damage_per_min;
    PlayerDamageTakenPerMin => avg_player_damage_taken_per_min, std_player_damage_taken_per_min, quantiles_player_damage_taken_per_min;
    NeutralDamage => avg_neutral_damage, std_neutral_damage, quantiles_neutral_damage;
    NeutralDamagePerMin => avg_neutral_damage_per_min, std_neutral_damage_per_min, quantiles_neutral_damage_per_min;
    BossDamage => avg_boss_damage, std_boss_damage, quantiles_boss_damage;
    BossDamagePerMin => avg_boss_damage_per_min, std_boss_damage_per_min, quantiles_boss_damage_per_min;
    SelfHealing => avg_self_healing, std_self_healing, quantiles_self_healing;
    PlayerHealing => avg_player_healing, std_player_healing, quantiles_player_healing;
    SelfHealingPerMin => avg_self_healing_per_min, std_self_healing_per_min, quantiles_self_healing_per_min;
    PlayerHealingPerMin => avg_player_healing_per_min, std_player_healing_per_min, quantiles_player_healing_per_min;
    TeammateHealing => avg_teammate_healing, std_teammate_healing, quantiles_teammate_healing;
    TeammateBarriering => avg_teammate_barriering, std_teammate_barriering, quantiles_teammate_barriering;
    HealPrevented => avg_heal_prevented, std_heal_prevented, quantiles_heal_prevented;
    PermanentBuffs => avg_permanent_buffs, std_permanent_buffs, quantiles_permanent_buffs;
    PermanentBuffsPerMin => avg_permanent_buffs_per_min, std_permanent_buffs_per_min, quantiles_permanent_buffs_per_min;
    FirstPermanentBuffTimeS => avg_first_permanent_buff_time_s, std_first_permanent_buff_time_s, quantiles_first_permanent_buff_time_s;
}

/// SELECT list entry for one metric. Buff metrics that were not requested get typed
/// placeholders (their columns must still exist for the row struct) and are dropped from the
/// response. `avg`/`std` of the nullable first-pickup time are `NULL` when no row has
/// timings, so they fall back to `nan` (serialized as `null`).
///
/// Quantiles use bfloat16 histograms rather than `quantilesDD`, which took over half of the CPU
/// (a `log` per value and metric). On production queries `quantilesBFloat16` cut CPU 22–39% and
/// was closer to the exact quantiles (≤ 0.7% vs ≤ 3% off on a day of matches).
fn metric_select(metric: Metric, include_buff_metrics: bool) -> String {
    const QUANTILES: &str = "quantilesBFloat16(0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99)";
    if metric.is_buff() && !include_buff_metrics {
        return format!(
            "toFloat64(0) AS avg_{metric}, toFloat64(0) AS std_{metric}, \
             emptyArrayFloat64() AS quantiles_{metric}"
        );
    }
    let expr = metric.get_select_clause();
    if metric == Metric::FirstPermanentBuffTimeS {
        return format!(
            "ifNull(avg({expr}), nan) AS avg_{metric}, ifNull(std({expr}), nan) AS std_{metric}, \
             {QUANTILES}({expr}) AS quantiles_{metric}"
        );
    }
    format!(
        "avg({expr}) AS avg_{metric}, std({expr}) AS std_{metric}, {QUANTILES}({expr}) AS \
         quantiles_{metric}"
    )
}

/// The player filters as ` AND ...`, and the settings they need as `, ...` (or empty).
fn player_filters(query: &PlayerStatsMetricsQuery) -> (String, &'static str) {
    let player_filter_inputs = PlayerFilters {
        hero_ids: query.hero_ids.as_deref(),
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
    // An account-scoped read without `max_matches` looks the account's matches up on
    // `player_match_stats` and reads them from `match_player` by primary key. Without it the
    // planner spent most of the CPU on index analysis: the account bloom filters and the
    // match/game mode sets over every granule of the window, and the projections, which it
    // analyzed and then rejected (the hero-sorted one needs 10x the marks). The skip indexes the
    // `match_id` set makes redundant are ignored, the narrow account bloom filter stays.
    // Measured on production shapes: identical results, -43% to -57% CPU.
    // With `max_matches` the settings would also hit the hero-agnostic latest-matches subquery,
    // which needs the `start_time` indexes, and the prefilter does not help it.
    let account_prefilter = if query.max_matches.is_none() {
        account_match_prefilter(
            player_filter_inputs,
            &MatchScope::new(
                query.match_mode.as_deref(),
                query.game_mode,
                query.match_info(),
            ),
        )
    } else {
        None
    };
    let account_settings = if account_prefilter.is_some() {
        ", optimize_use_projections = 0, ignore_data_skipping_indices = \
         'idx_account_id,idx_game_mode,idx_match_mode,idx_start_time,idx_start_time_coarse'"
    } else {
        ""
    };
    player_filters.extend(account_prefilter);
    (join_filters(&player_filters), account_settings)
}

fn build_query(query: &PlayerStatsMetricsQuery) -> String {
    let info_filters = query.match_info().build();
    let (player_filters, account_settings) = player_filters(query);
    let selects = Metric::VARIANTS
        .iter()
        .filter(|metric| metric.alias_of().is_none())
        .map(|metric| metric_select(*metric, query.include_buff_metrics))
        .join(",\n");
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    // `duration_s` is denormalized onto every player row and is constant within
    // a match, so the per-match duration can be read directly off each row.
    // This avoids the previous self-aggregation + JOIN, which forced a full,
    // unfilterable scan of every player row in the window just to attach the
    // match duration.
    let buff_columns = if query.include_buff_metrics {
        ",
                permanent_buffs, first_permanent_buff_time_s"
    } else {
        ""
    };
    // Without a bucket the SQL stays as it was before bucketing existed: the result cache keys on it.
    let bucket = query.bucket.expr();
    let bucket_column = bucket.map_or_else(String::new, |expr| format!("{expr} AS bucket, "));
    let bucket_select = if bucket.is_some() { "bucket,\n" } else { "" };
    let group_by = if bucket.is_some() {
        "\n    GROUP BY bucket\n    ORDER BY bucket"
    } else {
        ""
    };
    let data_columns = format!(
        "
                {bucket_column}kills, deaths, assists, net_worth, denies, last_hits,
                max_hero_bullets_hit_crit, max_hero_bullets_hit,
                max_shots_hit, max_shots_missed,
                max_player_damage, max_max_health, max_player_damage_taken,
                max_neutral_damage, max_boss_damage,
                max_self_healing, max_player_healing,
                max_teammate_healing, max_teammate_barriering,
                max_heal_prevented,
                greatest(1, duration_s) / 60 AS duration_m{buff_columns}"
    );
    // When `max_matches` is set we must restrict to the most recent N matches
    // first. That selection is hero-agnostic (it mirrors the old `t_matches`
    // CTE), and is cheap because `ORDER BY match_id DESC LIMIT n` rides the
    // table's `match_id` sort key. The player-level filters are then applied
    // to the rows of those matches.
    let t_data = query.max_matches.map_or_else(
        || {
            format!(
                "(
                SELECT {data_columns}
                FROM match_player
                WHERE {match_mode_filter}
                    AND {game_mode_filter}
                    {info_filters}
                    {player_filters}
            )"
            )
        },
        |n| {
            format!(
                "(
                SELECT {data_columns}
                FROM match_player
                WHERE match_id IN (
                    SELECT match_id
                    FROM match_player
                    WHERE {match_mode_filter}
                        AND {game_mode_filter}
                        {info_filters}
                    GROUP BY match_id
                    ORDER BY match_id DESC
                    LIMIT {n}
                )
                {player_filters}
            )"
            )
        },
    );
    // No `optimize_use_projections = 0` without an account filter: with skip indexes evaluated
    // at planning time (`use_skip_indexes_on_data_read = 0` on the clients) the hero-led
    // projection is pruned by start_time, so the planner may pick it even without a hero
    // filter. Measured on production shapes: identical results, 20% of the bytes and 32% of
    // the CPU.
    format!(
        "
    SELECT {bucket_select}{selects}
    FROM {t_data}{group_by}
    SETTINGS log_comment = 'player_stats_metrics', apply_patch_parts = 0, max_threads = 32{account_settings}
    "
    )
}

cached_ch_query! {
    fn run_query(3600) -> AnalyticsPlayerStatsMetricsRow = fetch_one;
}

cached_ch_query! {
    fn run_bucket_query(3600) -> Vec<AnalyticsPlayerStatsMetricsBucketRow>;
}

async fn fetch_one(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<AnalyticsPlayerStatsMetricsRow> {
    ch_client.query(query_str).fetch_one_tracked().await
}

async fn get_player_stats_metrics(
    ch_client: &clickhouse::Client,
    mut query: PlayerStatsMetricsQuery,
) -> APIResult<PlayerStatsMetricsResponse> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    let metrics = |row: &AnalyticsPlayerStatsMetricsRow| {
        PlayerStatsMetrics(
            Metric::VARIANTS
                .iter()
                .filter(|m| query.include_buff_metrics || !m.is_buff())
                .map(|m| (*m, m.extract_values(row)))
                .collect(),
        )
    };
    if query.bucket == BucketQuery::NoBucket {
        let row = run_query(ch_client, &query_str).await?;
        return Ok(PlayerStatsMetricsResponse::Metrics(metrics(&row)));
    }
    let rows = run_bucket_query(ch_client, &query_str).await?;
    Ok(PlayerStatsMetricsResponse::Buckets(
        rows.iter()
            .map(|row| {
                let (bucket, row) = row.to_parts();
                PlayerStatsMetricsBucket {
                    bucket,
                    metrics: metrics(&row),
                }
            })
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/player-stats/metrics",
    params(PlayerStatsMetricsQuery),
    responses(
        (status = OK, description = "Player Stats Metrics", body = PlayerStatsMetricsResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch player stats metrics")
    ),
    tags = ["Analytics"],
    summary = "Player Stats Metrics",
    description = super::describe("
Returns comprehensive statistical analysis of player performance.

`avg`, `std` and the percentiles describe the distribution over single matches: each player's
row in each matching match is one value, so players with more matches weigh more. With
`account_ids` it is the distribution of those players' matches. The percentiles rank a single
match, not a player: a player's average over many matches spreads much narrower than single
matches do, so read against these percentiles it looks less extreme than it is among players.

With `bucket=hero` the response is instead a list with one such object per hero, each with an
extra `bucket` field holding the hero id: `[{\"bucket\": 15, \"kills\": {...}, ...}, ...]`.
Combined with `hero_ids` it returns every listed hero's metrics from one request.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

> Note: Quantiles are estimated from a [bfloat16](https://clickhouse.com/docs/sql-reference/aggregate-functions/reference/quantilebfloat16) histogram, which rounds each value down to 8 significant bits, so they are not exact but have a relative error below 0.01.

    ")
)]
pub(crate) async fn player_stats_metrics(
    Query(mut query): Query<PlayerStatsMetricsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_player_stats_metrics(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn short_quantiles_do_not_panic() {
        let empty = MetricValues::from_stats(f64::NAN, f64::NAN, &[]);
        assert!(empty.percentile1.is_nan() && empty.percentile99.is_nan());
        let short = MetricValues::from_stats(1.0, 0.5, &[1.0, 2.0]);
        assert!((short.percentile5 - 2.0).abs() < f64::EPSILON);
        assert!(short.percentile10.is_nan());
        let json = serde_json::to_value(&empty).unwrap();
        assert!(json["percentile50"].is_null());
    }

    #[test]
    fn row_columns_follow_the_metric_order() {
        let expected = Metric::VARIANTS
            .iter()
            .filter(|m| m.alias_of().is_none())
            .flat_map(|m| {
                [
                    format!("avg_{m}"),
                    format!("std_{m}"),
                    format!("quantiles_{m}"),
                ]
            })
            .collect_vec();
        assert_eq!(
            <AnalyticsPlayerStatsMetricsRow as Row>::COLUMN_NAMES,
            expected.as_slice()
        );
    }

    #[test]
    fn healing_aliases_read_player_healing_without_computing_it_twice() {
        let sql = build_query(&PlayerStatsMetricsQuery::default());
        assert_valid_sql(&sql);
        assert!(!sql.contains("max_self_healing + max_player_healing"));
        assert!(!sql.contains("AS avg_healing"));
        assert!(!sql.contains("AS avg_healing_per_min"));
        assert_eq!(sql.matches("avg(max_player_healing) AS").count(), 1);

        let row = AnalyticsPlayerStatsMetricsRow::deserialize(serde_json::Value::Object(
            <AnalyticsPlayerStatsMetricsRow as Row>::COLUMN_NAMES
                .iter()
                .map(|column| {
                    let value = match *column {
                        "avg_player_healing" => serde_json::json!(434.0),
                        "avg_player_healing_per_min" => serde_json::json!(12.5),
                        c if c.starts_with("quantiles_") => serde_json::json!([]),
                        _ => serde_json::json!(0.0),
                    };
                    ((*column).to_owned(), value)
                })
                .collect(),
        ))
        .unwrap();
        assert!((Metric::Healing.extract_values(&row).avg - 434.0).abs() < f64::EPSILON);
        assert!((Metric::HealingPerMin.extract_values(&row).avg - 12.5).abs() < f64::EPSILON);
    }

    #[test]
    fn buff_metrics_are_opt_in() {
        let sql = build_query(&PlayerStatsMetricsQuery {
            hero_ids: Some(vec![15]),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        // Without the buff metrics the hero-filtered read can stay on the per-hero projection.
        assert!(!sql.contains("permanent_buffs, first_permanent_buff_time_s"));
        assert!(!sql.contains("avg(permanent_buffs"));
        assert!(!sql.contains("(first_permanent_buff_time_s)"));
        assert!(sql.contains("emptyArrayFloat64() AS quantiles_permanent_buffs"));

        let sql = build_query(&PlayerStatsMetricsQuery {
            hero_ids: Some(vec![15]),
            include_buff_metrics: true,
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("permanent_buffs, first_permanent_buff_time_s"));
        assert!(sql.contains("avg(permanent_buffs / duration_m) AS avg_permanent_buffs_per_min"));
        assert!(sql.contains("ifNull(avg(first_permanent_buff_time_s), nan)"));
        assert!(sql.contains("AS quantiles_permanent_buffs_per_min"));
    }

    #[test]
    fn hero_bucket_groups_by_hero() {
        for max_matches in [None, Some(100)] {
            let sql = build_query(&PlayerStatsMetricsQuery {
                bucket: BucketQuery::Hero,
                hero_ids: Some(vec![1, 15]),
                max_matches,
                ..Default::default()
            });
            assert_valid_sql(&sql);
            assert!(sql.contains("toUInt32(hero_id) AS bucket, kills"));
            assert!(sql.contains("SELECT bucket,\navg(kills) AS avg_kills"));
            assert!(sql.contains("GROUP BY bucket\n    ORDER BY bucket"));
        }
        assert!(!build_query(&PlayerStatsMetricsQuery::default()).contains("bucket"));
    }

    #[test]
    fn hero_buckets_are_metrics_objects_with_a_bucket() {
        let metrics = PlayerStatsMetrics(HashMap::from([(
            Metric::Kills,
            MetricValues::from_stats(5.0, 1.0, &[1.0; 9]),
        )]));
        let single =
            serde_json::to_value(PlayerStatsMetricsResponse::Metrics(metrics.clone())).unwrap();
        assert!(single["kills"]["avg"].is_number());
        assert!(single.get("bucket").is_none());

        let buckets = serde_json::to_value(PlayerStatsMetricsResponse::Buckets(vec![
            PlayerStatsMetricsBucket {
                bucket: 15,
                metrics,
            },
        ]))
        .unwrap();
        assert_eq!(buckets[0]["bucket"], 15);
        assert_eq!(buckets[0]["kills"], single["kills"]);
    }

    #[test]
    fn projections_are_allowed_with_and_without_a_hero_filter() {
        let unscoped = build_query(&PlayerStatsMetricsQuery::default());
        assert!(!unscoped.contains("optimize_use_projections"));
        let hero_scoped = build_query(&PlayerStatsMetricsQuery {
            hero_ids: Some(vec![15]),
            ..Default::default()
        });
        assert!(!hero_scoped.contains("optimize_use_projections"));
    }

    #[test]
    fn account_reads_go_through_the_player_match_stats_prefilter() {
        let sql = build_query(&PlayerStatsMetricsQuery {
            hero_ids: Some(vec![15]),
            account_ids: Some(vec![42]),
            game_mode: Some(GameMode::Normal),
            min_unix_timestamp: Some(1_700_000_000),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains(
            "AND match_id IN (SELECT match_id FROM player_match_stats WHERE match_mode IN \
             ('Ranked', 'Unranked') AND game_mode = 1 AND start_time >= 1700000000 AND \
             hero_id IN (15) AND account_id IN (42))"
        ));
        assert!(sql.contains("optimize_use_projections = 0, ignore_data_skipping_indices"));

        // The latest-matches subquery of `max_matches` needs the projections and skip indexes.
        let limited = build_query(&PlayerStatsMetricsQuery {
            account_ids: Some(vec![42]),
            max_matches: Some(100),
            ..Default::default()
        });
        assert_valid_sql(&limited);
        assert!(!limited.contains("player_match_stats"));
        assert!(!limited.contains("optimize_use_projections"));
        assert!(!limited.contains("ignore_data_skipping_indices"));
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
        fn player_stats_metrics_build_query_is_valid_sql(query: PlayerStatsMetricsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
