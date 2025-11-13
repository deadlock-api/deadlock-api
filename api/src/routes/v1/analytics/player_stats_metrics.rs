use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use strum::{Display, VariantArray};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct PlayerStatsMetricsQuery {
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    hero_ids: Option<Vec<u32>>,
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
    /// Filter players based on their net worth.
    min_networth: Option<u64>,
    /// Filter players based on their net worth.
    max_networth: Option<u64>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
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
    /// Comma separated list of item ids to include (only heroes who have purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only heroes who have not purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    exclude_item_ids: Option<Vec<u32>>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    account_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub(super) struct MetricValues {
    avg: f64,
    std: f64,
    percentile1: f64,
    percentile5: f64,
    percentile10: f64,
    percentile25: f64,
    percentile50: f64,
    percentile75: f64,
    percentile90: f64,
    percentile95: f64,
    percentile99: f64,
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
    PlayerHealing,
    Healing,
    SelfHealingPerMin,
    PlayerHealingPerMin,
    HealingPerMin,
}

impl Metric {
    pub(super) fn get_select_clause(self) -> &'static str {
        match self {
            Self::Kills => "kills",
            Self::Deaths => "deaths",
            Self::Assists => "assists",
            Self::NetWorth => "net_worth",
            Self::NetWorthPerMin => "net_worth / duration_m",
            Self::Denies => "denies",
            Self::LastHits => "last_hits",
            Self::CritShotRate => {
                "max_hero_bullets_hit_crit / greatest(1, max_hero_bullets_hit_crit + max_hero_bullets_hit)"
            }
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
            Self::PlayerHealing => "max_player_healing",
            Self::Healing => "max_self_healing + max_player_healing",
            Self::SelfHealingPerMin => "max_self_healing / duration_m",
            Self::PlayerHealingPerMin => "max_player_healing / duration_m",
            Self::HealingPerMin => "(max_self_healing + max_player_healing) / duration_m",
        }
    }

    #[allow(clippy::too_many_lines)]
    pub(super) fn extract_values(self, row: &AnalyticsPlayerStatsMetricsRow) -> MetricValues {
        match self {
            Self::Healing => MetricValues {
                avg: row.avg_healing,
                std: row.std_healing,
                percentile1: row.quantiles_healing[0],
                percentile5: row.quantiles_healing[1],
                percentile10: row.quantiles_healing[2],
                percentile25: row.quantiles_healing[3],
                percentile50: row.quantiles_healing[4],
                percentile75: row.quantiles_healing[5],
                percentile90: row.quantiles_healing[6],
                percentile95: row.quantiles_healing[7],
                percentile99: row.quantiles_healing[8],
            },
            Self::HealingPerMin => MetricValues {
                avg: row.avg_healing_per_min,
                std: row.std_healing_per_min,
                percentile1: row.quantiles_healing_per_min[0],
                percentile5: row.quantiles_healing_per_min[1],
                percentile10: row.quantiles_healing_per_min[2],
                percentile25: row.quantiles_healing_per_min[3],
                percentile50: row.quantiles_healing_per_min[4],
                percentile75: row.quantiles_healing_per_min[5],
                percentile90: row.quantiles_healing_per_min[6],
                percentile95: row.quantiles_healing_per_min[7],
                percentile99: row.quantiles_healing_per_min[8],
            },
            Self::PlayerHealing => MetricValues {
                avg: row.avg_player_healing,
                std: row.std_player_healing,
                percentile1: row.quantiles_player_healing[0],
                percentile5: row.quantiles_player_healing[1],
                percentile10: row.quantiles_player_healing[2],
                percentile25: row.quantiles_player_healing[3],
                percentile50: row.quantiles_player_healing[4],
                percentile75: row.quantiles_player_healing[5],
                percentile90: row.quantiles_player_healing[6],
                percentile95: row.quantiles_player_healing[7],
                percentile99: row.quantiles_player_healing[8],
            },
            Self::PlayerHealingPerMin => MetricValues {
                avg: row.avg_player_healing_per_min,
                std: row.std_player_healing_per_min,
                percentile1: row.quantiles_player_healing_per_min[0],
                percentile5: row.quantiles_player_healing_per_min[1],
                percentile10: row.quantiles_player_healing_per_min[2],
                percentile25: row.quantiles_player_healing_per_min[3],
                percentile50: row.quantiles_player_healing_per_min[4],
                percentile75: row.quantiles_player_healing_per_min[5],
                percentile90: row.quantiles_player_healing_per_min[6],
                percentile95: row.quantiles_player_healing_per_min[7],
                percentile99: row.quantiles_player_healing_per_min[8],
            },
            Self::SelfHealing => MetricValues {
                avg: row.avg_self_healing,
                std: row.std_self_healing,
                percentile1: row.quantiles_self_healing[0],
                percentile5: row.quantiles_self_healing[1],
                percentile10: row.quantiles_self_healing[2],
                percentile25: row.quantiles_self_healing[3],
                percentile50: row.quantiles_self_healing[4],
                percentile75: row.quantiles_self_healing[5],
                percentile90: row.quantiles_self_healing[6],
                percentile95: row.quantiles_self_healing[7],
                percentile99: row.quantiles_self_healing[8],
            },
            Self::SelfHealingPerMin => MetricValues {
                avg: row.avg_self_healing_per_min,
                std: row.std_self_healing_per_min,
                percentile1: row.quantiles_self_healing_per_min[0],
                percentile5: row.quantiles_self_healing_per_min[1],
                percentile10: row.quantiles_self_healing_per_min[2],
                percentile25: row.quantiles_self_healing_per_min[3],
                percentile50: row.quantiles_self_healing_per_min[4],
                percentile75: row.quantiles_self_healing_per_min[5],
                percentile90: row.quantiles_self_healing_per_min[6],
                percentile95: row.quantiles_self_healing_per_min[7],
                percentile99: row.quantiles_self_healing_per_min[8],
            },
            Self::Kills => MetricValues {
                avg: row.avg_kills,
                std: row.std_kills,
                percentile1: row.quantiles_kills[0],
                percentile5: row.quantiles_kills[1],
                percentile10: row.quantiles_kills[2],
                percentile25: row.quantiles_kills[3],
                percentile50: row.quantiles_kills[4],
                percentile75: row.quantiles_kills[5],
                percentile90: row.quantiles_kills[6],
                percentile95: row.quantiles_kills[7],
                percentile99: row.quantiles_kills[8],
            },
            Self::Deaths => MetricValues {
                avg: row.avg_deaths,
                std: row.std_deaths,
                percentile1: row.quantiles_deaths[0],
                percentile5: row.quantiles_deaths[1],
                percentile10: row.quantiles_deaths[2],
                percentile25: row.quantiles_deaths[3],
                percentile50: row.quantiles_deaths[4],
                percentile75: row.quantiles_deaths[5],
                percentile90: row.quantiles_deaths[6],
                percentile95: row.quantiles_deaths[7],
                percentile99: row.quantiles_deaths[8],
            },
            Self::Assists => MetricValues {
                avg: row.avg_assists,
                std: row.std_assists,
                percentile1: row.quantiles_assists[0],
                percentile5: row.quantiles_assists[1],
                percentile10: row.quantiles_assists[2],
                percentile25: row.quantiles_assists[3],
                percentile50: row.quantiles_assists[4],
                percentile75: row.quantiles_assists[5],
                percentile90: row.quantiles_assists[6],
                percentile95: row.quantiles_assists[7],
                percentile99: row.quantiles_assists[8],
            },
            Self::NetWorth => MetricValues {
                avg: row.avg_net_worth,
                std: row.std_net_worth,
                percentile1: row.quantiles_net_worth[0],
                percentile5: row.quantiles_net_worth[1],
                percentile10: row.quantiles_net_worth[2],
                percentile25: row.quantiles_net_worth[3],
                percentile50: row.quantiles_net_worth[4],
                percentile75: row.quantiles_net_worth[5],
                percentile90: row.quantiles_net_worth[6],
                percentile95: row.quantiles_net_worth[7],
                percentile99: row.quantiles_net_worth[8],
            },
            Self::NetWorthPerMin => MetricValues {
                avg: row.avg_net_worth_per_min,
                std: row.std_net_worth_per_min,
                percentile1: row.quantiles_net_worth_per_min[0],
                percentile5: row.quantiles_net_worth_per_min[1],
                percentile10: row.quantiles_net_worth_per_min[2],
                percentile25: row.quantiles_net_worth_per_min[3],
                percentile50: row.quantiles_net_worth_per_min[4],
                percentile75: row.quantiles_net_worth_per_min[5],
                percentile90: row.quantiles_net_worth_per_min[6],
                percentile95: row.quantiles_net_worth_per_min[7],
                percentile99: row.quantiles_net_worth_per_min[8],
            },
            Self::Denies => MetricValues {
                avg: row.avg_denies,
                std: row.std_denies,
                percentile1: row.quantiles_denies[0],
                percentile5: row.quantiles_denies[1],
                percentile10: row.quantiles_denies[2],
                percentile25: row.quantiles_denies[3],
                percentile50: row.quantiles_denies[4],
                percentile75: row.quantiles_denies[5],
                percentile90: row.quantiles_denies[6],
                percentile95: row.quantiles_denies[7],
                percentile99: row.quantiles_denies[8],
            },
            Self::LastHits => MetricValues {
                avg: row.avg_last_hits,
                std: row.std_last_hits,
                percentile1: row.quantiles_last_hits[0],
                percentile5: row.quantiles_last_hits[1],
                percentile10: row.quantiles_last_hits[2],
                percentile25: row.quantiles_last_hits[3],
                percentile50: row.quantiles_last_hits[4],
                percentile75: row.quantiles_last_hits[5],
                percentile90: row.quantiles_last_hits[6],
                percentile95: row.quantiles_last_hits[7],
                percentile99: row.quantiles_last_hits[8],
            },
            Self::CritShotRate => MetricValues {
                avg: row.avg_crit_shot_rate,
                std: row.std_crit_shot_rate,
                percentile1: row.quantiles_crit_shot_rate[0],
                percentile5: row.quantiles_crit_shot_rate[1],
                percentile10: row.quantiles_crit_shot_rate[2],
                percentile25: row.quantiles_crit_shot_rate[3],
                percentile50: row.quantiles_crit_shot_rate[4],
                percentile75: row.quantiles_crit_shot_rate[5],
                percentile90: row.quantiles_crit_shot_rate[6],
                percentile95: row.quantiles_crit_shot_rate[7],
                percentile99: row.quantiles_crit_shot_rate[8],
            },
            Self::Accuracy => MetricValues {
                avg: row.avg_accuracy,
                std: row.std_accuracy,
                percentile1: row.quantiles_accuracy[0],
                percentile5: row.quantiles_accuracy[1],
                percentile10: row.quantiles_accuracy[2],
                percentile25: row.quantiles_accuracy[3],
                percentile50: row.quantiles_accuracy[4],
                percentile75: row.quantiles_accuracy[5],
                percentile90: row.quantiles_accuracy[6],
                percentile95: row.quantiles_accuracy[7],
                percentile99: row.quantiles_accuracy[8],
            },
            Self::Kd => MetricValues {
                avg: row.avg_kd,
                std: row.std_kd,
                percentile1: row.quantiles_kd[0],
                percentile5: row.quantiles_kd[1],
                percentile10: row.quantiles_kd[2],
                percentile25: row.quantiles_kd[3],
                percentile50: row.quantiles_kd[4],
                percentile75: row.quantiles_kd[5],
                percentile90: row.quantiles_kd[6],
                percentile95: row.quantiles_kd[7],
                percentile99: row.quantiles_kd[8],
            },
            Self::Kda => MetricValues {
                avg: row.avg_kda,
                std: row.std_kda,
                percentile1: row.quantiles_kda[0],
                percentile5: row.quantiles_kda[1],
                percentile10: row.quantiles_kda[2],
                percentile25: row.quantiles_kda[3],
                percentile50: row.quantiles_kda[4],
                percentile75: row.quantiles_kda[5],
                percentile90: row.quantiles_kda[6],
                percentile95: row.quantiles_kda[7],
                percentile99: row.quantiles_kda[8],
            },
            Self::KillsPlusAssists => MetricValues {
                avg: row.avg_kills_plus_assists,
                std: row.std_kills_plus_assists,
                percentile1: row.quantiles_kills_plus_assists[0],
                percentile5: row.quantiles_kills_plus_assists[1],
                percentile10: row.quantiles_kills_plus_assists[2],
                percentile25: row.quantiles_kills_plus_assists[3],
                percentile50: row.quantiles_kills_plus_assists[4],
                percentile75: row.quantiles_kills_plus_assists[5],
                percentile90: row.quantiles_kills_plus_assists[6],
                percentile95: row.quantiles_kills_plus_assists[7],
                percentile99: row.quantiles_kills_plus_assists[8],
            },
            Self::PlayerDamage => MetricValues {
                avg: row.avg_player_damage,
                std: row.std_player_damage,
                percentile1: row.quantiles_player_damage[0],
                percentile5: row.quantiles_player_damage[1],
                percentile10: row.quantiles_player_damage[2],
                percentile25: row.quantiles_player_damage[3],
                percentile50: row.quantiles_player_damage[4],
                percentile75: row.quantiles_player_damage[5],
                percentile90: row.quantiles_player_damage[6],
                percentile95: row.quantiles_player_damage[7],
                percentile99: row.quantiles_player_damage[8],
            },
            Self::PlayerDamagePerHealth => MetricValues {
                avg: row.avg_player_damage_per_health,
                std: row.std_player_damage_per_health,
                percentile1: row.quantiles_player_damage_per_health[0],
                percentile5: row.quantiles_player_damage_per_health[1],
                percentile10: row.quantiles_player_damage_per_health[2],
                percentile25: row.quantiles_player_damage_per_health[3],
                percentile50: row.quantiles_player_damage_per_health[4],
                percentile75: row.quantiles_player_damage_per_health[5],
                percentile90: row.quantiles_player_damage_per_health[6],
                percentile95: row.quantiles_player_damage_per_health[7],
                percentile99: row.quantiles_player_damage_per_health[8],
            },
            Self::PlayerDamagePerMin => MetricValues {
                avg: row.avg_player_damage_per_min,
                std: row.std_player_damage_per_min,
                percentile1: row.quantiles_player_damage_per_min[0],
                percentile5: row.quantiles_player_damage_per_min[1],
                percentile10: row.quantiles_player_damage_per_min[2],
                percentile25: row.quantiles_player_damage_per_min[3],
                percentile50: row.quantiles_player_damage_per_min[4],
                percentile75: row.quantiles_player_damage_per_min[5],
                percentile90: row.quantiles_player_damage_per_min[6],
                percentile95: row.quantiles_player_damage_per_min[7],
                percentile99: row.quantiles_player_damage_per_min[8],
            },
            Self::PlayerDamageTakenPerMin => MetricValues {
                avg: row.avg_player_damage_taken_per_min,
                std: row.std_player_damage_taken_per_min,
                percentile1: row.quantiles_player_damage_taken_per_min[0],
                percentile5: row.quantiles_player_damage_taken_per_min[1],
                percentile10: row.quantiles_player_damage_taken_per_min[2],
                percentile25: row.quantiles_player_damage_taken_per_min[3],
                percentile50: row.quantiles_player_damage_taken_per_min[4],
                percentile75: row.quantiles_player_damage_taken_per_min[5],
                percentile90: row.quantiles_player_damage_taken_per_min[6],
                percentile95: row.quantiles_player_damage_taken_per_min[7],
                percentile99: row.quantiles_player_damage_taken_per_min[8],
            },
            Self::NeutralDamage => MetricValues {
                avg: row.avg_neutral_damage,
                std: row.std_neutral_damage,
                percentile1: row.quantiles_neutral_damage[0],
                percentile5: row.quantiles_neutral_damage[1],
                percentile10: row.quantiles_neutral_damage[2],
                percentile25: row.quantiles_neutral_damage[3],
                percentile50: row.quantiles_neutral_damage[4],
                percentile75: row.quantiles_neutral_damage[5],
                percentile90: row.quantiles_neutral_damage[6],
                percentile95: row.quantiles_neutral_damage[7],
                percentile99: row.quantiles_neutral_damage[8],
            },
            Self::NeutralDamagePerMin => MetricValues {
                avg: row.avg_neutral_damage_per_min,
                std: row.std_neutral_damage_per_min,
                percentile1: row.quantiles_neutral_damage_per_min[0],
                percentile5: row.quantiles_neutral_damage_per_min[1],
                percentile10: row.quantiles_neutral_damage_per_min[2],
                percentile25: row.quantiles_neutral_damage_per_min[3],
                percentile50: row.quantiles_neutral_damage_per_min[4],
                percentile75: row.quantiles_neutral_damage_per_min[5],
                percentile90: row.quantiles_neutral_damage_per_min[6],
                percentile95: row.quantiles_neutral_damage_per_min[7],
                percentile99: row.quantiles_neutral_damage_per_min[8],
            },
            Self::BossDamage => MetricValues {
                avg: row.avg_boss_damage,
                std: row.std_boss_damage,
                percentile1: row.quantiles_boss_damage[0],
                percentile5: row.quantiles_boss_damage[1],
                percentile10: row.quantiles_boss_damage[2],
                percentile25: row.quantiles_boss_damage[3],
                percentile50: row.quantiles_boss_damage[4],
                percentile75: row.quantiles_boss_damage[5],
                percentile90: row.quantiles_boss_damage[6],
                percentile95: row.quantiles_boss_damage[7],
                percentile99: row.quantiles_boss_damage[8],
            },
            Self::BossDamagePerMin => MetricValues {
                avg: row.avg_boss_damage_per_min,
                std: row.std_boss_damage_per_min,
                percentile1: row.quantiles_boss_damage_per_min[0],
                percentile5: row.quantiles_boss_damage_per_min[1],
                percentile10: row.quantiles_boss_damage_per_min[2],
                percentile25: row.quantiles_boss_damage_per_min[3],
                percentile50: row.quantiles_boss_damage_per_min[4],
                percentile75: row.quantiles_boss_damage_per_min[5],
                percentile90: row.quantiles_boss_damage_per_min[6],
                percentile95: row.quantiles_boss_damage_per_min[7],
                percentile99: row.quantiles_boss_damage_per_min[8],
            },
        }
    }
}

pub(super) type AnalyticsPlayerStatsMetrics = HashMap<Metric, MetricValues>;

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub(super) struct AnalyticsPlayerStatsMetricsRow {
    avg_kills: f64,
    std_kills: f64,
    quantiles_kills: Vec<f64>,
    avg_deaths: f64,
    std_deaths: f64,
    quantiles_deaths: Vec<f64>,
    avg_assists: f64,
    std_assists: f64,
    quantiles_assists: Vec<f64>,
    avg_net_worth: f64,
    std_net_worth: f64,
    quantiles_net_worth: Vec<f64>,
    avg_net_worth_per_min: f64,
    std_net_worth_per_min: f64,
    quantiles_net_worth_per_min: Vec<f64>,
    avg_denies: f64,
    std_denies: f64,
    quantiles_denies: Vec<f64>,
    avg_last_hits: f64,
    std_last_hits: f64,
    quantiles_last_hits: Vec<f64>,
    avg_crit_shot_rate: f64,
    std_crit_shot_rate: f64,
    quantiles_crit_shot_rate: Vec<f64>,
    avg_accuracy: f64,
    std_accuracy: f64,
    quantiles_accuracy: Vec<f64>,
    avg_kd: f64,
    std_kd: f64,
    quantiles_kd: Vec<f64>,
    avg_kda: f64,
    std_kda: f64,
    quantiles_kda: Vec<f64>,
    avg_kills_plus_assists: f64,
    std_kills_plus_assists: f64,
    quantiles_kills_plus_assists: Vec<f64>,
    avg_player_damage: f64,
    std_player_damage: f64,
    quantiles_player_damage: Vec<f64>,
    avg_player_damage_per_health: f64,
    std_player_damage_per_health: f64,
    quantiles_player_damage_per_health: Vec<f64>,
    avg_player_damage_per_min: f64,
    std_player_damage_per_min: f64,
    quantiles_player_damage_per_min: Vec<f64>,
    avg_player_damage_taken_per_min: f64,
    std_player_damage_taken_per_min: f64,
    quantiles_player_damage_taken_per_min: Vec<f64>,
    avg_neutral_damage: f64,
    std_neutral_damage: f64,
    quantiles_neutral_damage: Vec<f64>,
    avg_neutral_damage_per_min: f64,
    std_neutral_damage_per_min: f64,
    quantiles_neutral_damage_per_min: Vec<f64>,
    avg_boss_damage: f64,
    std_boss_damage: f64,
    quantiles_boss_damage: Vec<f64>,
    avg_boss_damage_per_min: f64,
    std_boss_damage_per_min: f64,
    quantiles_boss_damage_per_min: Vec<f64>,
    avg_self_healing: f64,
    std_self_healing: f64,
    quantiles_self_healing: Vec<f64>,
    avg_player_healing: f64,
    std_player_healing: f64,
    quantiles_player_healing: Vec<f64>,
    avg_healing: f64,
    std_healing: f64,
    quantiles_healing: Vec<f64>,
    avg_self_healing_per_min: f64,
    std_self_healing_per_min: f64,
    quantiles_self_healing_per_min: Vec<f64>,
    avg_player_healing_per_min: f64,
    std_player_healing_per_min: f64,
    quantiles_player_healing_per_min: Vec<f64>,
    avg_healing_per_min: f64,
    std_healing_per_min: f64,
    quantiles_healing_per_min: Vec<f64>,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &PlayerStatsMetricsQuery) -> String {
    let mut info_filters = vec![];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        info_filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        info_filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {max_match_id}"));
    }
    if let Some(min_badge_level) = query.min_average_badge
        && min_badge_level > 11
    {
        info_filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge
        && max_badge_level < 116
    {
        info_filters.push(format!(
            "average_badge_team0 <= {max_badge_level} AND average_badge_team1 <= {max_badge_level}"
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        info_filters.push(format!("duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {max_duration_s}"));
    }
    let info_filters = if info_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", info_filters.join(" AND "))
    };
    let mut player_filters = vec![];
    if let Some(hero_ids) = query.hero_ids.as_ref() {
        player_filters.push(format!(
            "hero_id IN ({})",
            hero_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(account_ids) = query.account_ids.as_ref() {
        player_filters.push(format!(
            "account_id IN ({})",
            account_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("net_worth <= {max_networth}"));
    }
    if let Some(include_item_ids) = &query.include_item_ids {
        player_filters.push(format!(
            "hasAll(items.item_id, [{}])",
            include_item_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    if let Some(exclude_item_ids) = &query.exclude_item_ids {
        player_filters.push(format!(
            "not hasAny(items.item_id, [{}])",
            exclude_item_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    let player_filters = if player_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    let quantiles = "quantilesDD(0.01, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99)";
    let selects = Metric::VARIANTS.iter()
        .map(|metric| (metric, metric.get_select_clause()))
        .map(|(name, expr)| {
        format!(
            "avg({expr}) AS avg_{name}, std({expr}) AS std_{name}, {quantiles}({expr}) AS quantiles_{name}"
        )
    }).join(",\n");
    let match_limit = query.max_matches.unwrap_or(1000000);
    format!(
        "
    WITH t_matches AS (
            SELECT match_id, greatest(1, duration_s) / 60 as duration_m
            FROM match_info
            WHERE match_mode IN ('Ranked', 'Unranked')
                {info_filters}
        ),
        t_data AS (
            SELECT mp.*, duration_m
            FROM match_player mp
                INNER JOIN t_matches USING (match_id)
            WHERE TRUE {player_filters}
            ORDER BY match_id DESC
            LIMIT {match_limit}
            SETTINGS asterisk_include_materialized_columns = 1
        )
    SELECT {selects}
    FROM t_data
    "
    )
}

#[cached(
    ty = "TimedCache<String, AnalyticsPlayerStatsMetricsRow>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<AnalyticsPlayerStatsMetricsRow> {
    ch_client.query(query_str).fetch_one().await
}

async fn get_player_stats_metrics(
    ch_client: &clickhouse::Client,
    mut query: PlayerStatsMetricsQuery,
) -> APIResult<AnalyticsPlayerStatsMetricsRow> {
    query.min_unix_timestamp = query.min_unix_timestamp.map(|v| v - v % 3600);
    query.max_unix_timestamp = query.max_unix_timestamp.map(|v| v + 3600 - v % 3600);
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
}

#[utoipa::path(
    get,
    path = "/player-stats/metrics",
    params(PlayerStatsMetricsQuery),
    responses(
        (status = OK, description = "Hero Stats", body = AnalyticsPlayerStatsMetrics),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch player stats metrics")
    ),
    tags = ["Analytics"],
    summary = "Player Stats Metrics",
    description = "
Returns comprehensive statistical analysis of player performance.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

> Note: Quantiles are calculated using the [DDSketch](https://www.vldb.org/pvldb/vol12/p2195-masson.pdf) algorithm, so they are not exact but have a maximum relative error of 0.01.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn player_stats_metrics(
    Query(mut query): Query<PlayerStatsMetricsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if let Some(account_ids) = query.account_ids {
        let protected_users = state
            .steam_client
            .get_protected_users(&state.pg_client)
            .await?;
        let filtered_account_ids = account_ids
            .into_iter()
            .filter(|id| !protected_users.contains(id))
            .collect::<Vec<_>>();
        if filtered_account_ids.is_empty() {
            return Err(APIError::protected_user());
        }
        query.account_ids = Some(filtered_account_ids);
    }
    get_player_stats_metrics(&state.ch_client_ro, query)
        .await
        .map(|rows| {
            Metric::VARIANTS
                .iter()
                .map(|m| (*m, m.extract_values(&rows)))
                .collect::<AnalyticsPlayerStatsMetrics>()
        })
        .map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_query_min_unix_timestamp() {
        let query = PlayerStatsMetricsQuery {
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_query_max_unix_timestamp() {
        let query = PlayerStatsMetricsQuery {
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_min_duration_s() {
        let query = PlayerStatsMetricsQuery {
            min_duration_s: Some(600),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("duration_s >= 600"));
    }

    #[test]
    fn test_build_query_max_duration_s() {
        let query = PlayerStatsMetricsQuery {
            max_duration_s: Some(1800),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_query_min_networth() {
        let query = PlayerStatsMetricsQuery {
            min_networth: Some(1000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("net_worth >= 1000"));
    }

    #[test]
    fn test_build_query_max_networth() {
        let query = PlayerStatsMetricsQuery {
            max_networth: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("net_worth <= 10000"));
    }

    #[test]
    fn test_build_query_min_average_badge() {
        let query = PlayerStatsMetricsQuery {
            min_average_badge: Some(61),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
    }

    #[test]
    fn test_build_query_max_average_badge() {
        let query = PlayerStatsMetricsQuery {
            max_average_badge: Some(112),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
    }

    #[test]
    fn test_build_query_min_match_id() {
        let query = PlayerStatsMetricsQuery {
            min_match_id: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_query_max_match_id() {
        let query = PlayerStatsMetricsQuery {
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_query_account_id() {
        let query = PlayerStatsMetricsQuery {
            account_ids: Some(vec![18373975]),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("account_id IN (18373975)"));
    }

    #[test]
    fn test_build_query_include_item_ids() {
        let query = PlayerStatsMetricsQuery {
            include_item_ids: Some(vec![1, 2, 3]),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("hasAll(items.item_id, [1, 2, 3])"));
    }

    #[test]
    fn test_build_query_exclude_item_ids() {
        let query = PlayerStatsMetricsQuery {
            exclude_item_ids: Some(vec![4, 5, 6]),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("not hasAny(items.item_id, [4, 5, 6])"));
    }

    #[test]
    fn test_build_query_include_and_exclude_item_ids() {
        let query = PlayerStatsMetricsQuery {
            include_item_ids: Some(vec![1, 2, 3]),
            exclude_item_ids: Some(vec![4, 5, 6]),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("hasAll(items.item_id, [1, 2, 3])"));
        assert!(sql.contains("not hasAny(items.item_id, [4, 5, 6])"));
    }

    #[test]
    fn test_build_query_selects() {
        let query = PlayerStatsMetricsQuery::default();
        let sql = build_query(&query);
        for metric in Metric::VARIANTS {
            assert!(sql.contains(&format!(
                "avg({}) AS avg_{}",
                metric.get_select_clause(),
                metric
            )));
            assert!(sql.contains(&format!(
                "std({}) AS std_{}",
                metric.get_select_clause(),
                metric
            )));
            assert!(sql.contains(&format!("quantilesDD(0.01, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99)({}) AS quantiles_{}", metric.get_select_clause(), metric)));
        }
    }
}
