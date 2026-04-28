use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
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

use super::common_filters::{
    MatchInfoFilters, PlayerFilters, filter_protected_accounts, join_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct PlayerStatsMetricsQuery {
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
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
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
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
    /// Comma separated list of item ids to include (only players who have purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only players who have not purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    exclude_item_ids: Option<Vec<u32>>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
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

impl MetricValues {
    fn from_stats(avg: f64, std: f64, quantiles: &[f64]) -> Self {
        Self {
            avg,
            std,
            percentile1: quantiles[0],
            percentile5: quantiles[1],
            percentile10: quantiles[2],
            percentile25: quantiles[3],
            percentile50: quantiles[4],
            percentile75: quantiles[5],
            percentile90: quantiles[6],
            percentile95: quantiles[7],
            percentile99: quantiles[8],
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
    PlayerHealing,
    Healing,
    SelfHealingPerMin,
    PlayerHealingPerMin,
    HealingPerMin,
    TeammateHealing,
    TeammateBarriering,
    HealPrevented,
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
            Self::TeammateHealing => "max_teammate_healing",
            Self::TeammateBarriering => "max_teammate_barriering",
            Self::HealPrevented => "max_heal_prevented",
        }
    }

    #[allow(clippy::too_many_lines)]
    pub(super) fn extract_values(self, row: &AnalyticsPlayerStatsMetricsRow) -> MetricValues {
        match self {
            Self::Kills => {
                MetricValues::from_stats(row.avg_kills, row.std_kills, &row.quantiles_kills)
            }
            Self::Deaths => {
                MetricValues::from_stats(row.avg_deaths, row.std_deaths, &row.quantiles_deaths)
            }
            Self::Assists => {
                MetricValues::from_stats(row.avg_assists, row.std_assists, &row.quantiles_assists)
            }
            Self::NetWorth => MetricValues::from_stats(
                row.avg_net_worth,
                row.std_net_worth,
                &row.quantiles_net_worth,
            ),
            Self::NetWorthPerMin => MetricValues::from_stats(
                row.avg_net_worth_per_min,
                row.std_net_worth_per_min,
                &row.quantiles_net_worth_per_min,
            ),
            Self::Denies => {
                MetricValues::from_stats(row.avg_denies, row.std_denies, &row.quantiles_denies)
            }
            Self::LastHits => MetricValues::from_stats(
                row.avg_last_hits,
                row.std_last_hits,
                &row.quantiles_last_hits,
            ),
            Self::CritShotRate => MetricValues::from_stats(
                row.avg_crit_shot_rate,
                row.std_crit_shot_rate,
                &row.quantiles_crit_shot_rate,
            ),
            Self::Accuracy => MetricValues::from_stats(
                row.avg_accuracy,
                row.std_accuracy,
                &row.quantiles_accuracy,
            ),
            Self::Kd => MetricValues::from_stats(row.avg_kd, row.std_kd, &row.quantiles_kd),
            Self::Kda => MetricValues::from_stats(row.avg_kda, row.std_kda, &row.quantiles_kda),
            Self::KillsPlusAssists => MetricValues::from_stats(
                row.avg_kills_plus_assists,
                row.std_kills_plus_assists,
                &row.quantiles_kills_plus_assists,
            ),
            Self::PlayerDamage => MetricValues::from_stats(
                row.avg_player_damage,
                row.std_player_damage,
                &row.quantiles_player_damage,
            ),
            Self::PlayerDamagePerHealth => MetricValues::from_stats(
                row.avg_player_damage_per_health,
                row.std_player_damage_per_health,
                &row.quantiles_player_damage_per_health,
            ),
            Self::PlayerDamagePerMin => MetricValues::from_stats(
                row.avg_player_damage_per_min,
                row.std_player_damage_per_min,
                &row.quantiles_player_damage_per_min,
            ),
            Self::PlayerDamageTakenPerMin => MetricValues::from_stats(
                row.avg_player_damage_taken_per_min,
                row.std_player_damage_taken_per_min,
                &row.quantiles_player_damage_taken_per_min,
            ),
            Self::NeutralDamage => MetricValues::from_stats(
                row.avg_neutral_damage,
                row.std_neutral_damage,
                &row.quantiles_neutral_damage,
            ),
            Self::NeutralDamagePerMin => MetricValues::from_stats(
                row.avg_neutral_damage_per_min,
                row.std_neutral_damage_per_min,
                &row.quantiles_neutral_damage_per_min,
            ),
            Self::BossDamage => MetricValues::from_stats(
                row.avg_boss_damage,
                row.std_boss_damage,
                &row.quantiles_boss_damage,
            ),
            Self::BossDamagePerMin => MetricValues::from_stats(
                row.avg_boss_damage_per_min,
                row.std_boss_damage_per_min,
                &row.quantiles_boss_damage_per_min,
            ),
            Self::SelfHealing => MetricValues::from_stats(
                row.avg_self_healing,
                row.std_self_healing,
                &row.quantiles_self_healing,
            ),
            Self::PlayerHealing => MetricValues::from_stats(
                row.avg_player_healing,
                row.std_player_healing,
                &row.quantiles_player_healing,
            ),
            Self::Healing => {
                MetricValues::from_stats(row.avg_healing, row.std_healing, &row.quantiles_healing)
            }
            Self::SelfHealingPerMin => MetricValues::from_stats(
                row.avg_self_healing_per_min,
                row.std_self_healing_per_min,
                &row.quantiles_self_healing_per_min,
            ),
            Self::PlayerHealingPerMin => MetricValues::from_stats(
                row.avg_player_healing_per_min,
                row.std_player_healing_per_min,
                &row.quantiles_player_healing_per_min,
            ),
            Self::HealingPerMin => MetricValues::from_stats(
                row.avg_healing_per_min,
                row.std_healing_per_min,
                &row.quantiles_healing_per_min,
            ),
            Self::TeammateHealing => MetricValues::from_stats(
                row.avg_teammate_healing,
                row.std_teammate_healing,
                &row.quantiles_teammate_healing,
            ),
            Self::TeammateBarriering => MetricValues::from_stats(
                row.avg_teammate_barriering,
                row.std_teammate_barriering,
                &row.quantiles_teammate_barriering,
            ),
            Self::HealPrevented => MetricValues::from_stats(
                row.avg_heal_prevented,
                row.std_heal_prevented,
                &row.quantiles_heal_prevented,
            ),
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
    avg_teammate_healing: f64,
    std_teammate_healing: f64,
    quantiles_teammate_healing: Vec<f64>,
    avg_teammate_barriering: f64,
    std_teammate_barriering: f64,
    quantiles_teammate_barriering: Vec<f64>,
    avg_heal_prevented: f64,
    std_heal_prevented: f64,
    quantiles_heal_prevented: Vec<f64>,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &PlayerStatsMetricsQuery) -> String {
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
            ..Default::default()
        }
        .build(),
    );
    let quantiles = "quantilesDD(0.01, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99)";
    let selects = Metric::VARIANTS.iter()
        .map(|metric| (metric, metric.get_select_clause()))
        .map(|(name, expr)| {
        format!(
            "avg({expr}) AS avg_{name}, std({expr}) AS std_{name}, {quantiles}({expr}) AS quantiles_{name}"
        )
    }).join(",\n");
    let match_limit_clause = query
        .max_matches
        .map(|n| format!("ORDER BY match_id DESC LIMIT {n}"))
        .unwrap_or_default();
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    format!(
        "
    WITH t_matches AS (
            SELECT match_id, greatest(1, any(duration_s)) / 60 as duration_m
            FROM match_player
            WHERE match_mode IN ('Ranked', 'Unranked')
                AND {game_mode_filter}
                {info_filters}
            GROUP BY match_id
            {match_limit_clause}
        ),
        t_data AS (
            SELECT
                kills, deaths, assists, net_worth, denies, last_hits,
                max_hero_bullets_hit_crit, max_hero_bullets_hit,
                max_shots_hit, max_shots_missed,
                max_player_damage, max_max_health, max_player_damage_taken,
                max_neutral_damage, max_boss_damage,
                max_self_healing, max_player_healing,
                max_teammate_healing, max_teammate_barriering,
                max_heal_prevented,
                duration_m
            FROM match_player
                INNER JOIN t_matches USING (match_id)
            WHERE 1=1 {player_filters}
        )
    SELECT {selects}
    FROM t_data
    SETTINGS log_comment = 'player_stats_metrics'
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
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
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
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(crate) async fn player_stats_metrics(
    Query(mut query): Query<PlayerStatsMetricsQuery>,
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
