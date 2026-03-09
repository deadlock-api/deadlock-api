use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use strum::Display;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::default_last_month_timestamp;

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum BucketQuery {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket Game Stats By Max Average Badge Level (tier = first digits, subtier = last digit) of both teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    AvgBadge,
    /// Bucket Game Stats By Start Time (Hour)
    StartTimeHour,
    /// Bucket Game Stats By Start Time (Day)
    StartTimeDay,
    /// Bucket Game Stats By Start Time (Week)
    StartTimeWeek,
    /// Bucket Game Stats By Start Time (Month)
    StartTimeMonth,
}

impl BucketQuery {
    fn get_select_clause(self) -> &'static str {
        match self {
            Self::NoBucket => "toUInt32(0)",
            Self::AvgBadge => "toUInt32(max_avg_badge)",
            Self::StartTimeHour => "toStartOfHour(start_time)",
            Self::StartTimeDay => "toStartOfDay(start_time)",
            Self::StartTimeWeek => "toDateTime(toStartOfWeek(start_time))",
            Self::StartTimeMonth => "toDateTime(toStartOfMonth(start_time))",
        }
    }

    fn get_info_select_clause(self) -> &'static str {
        match self {
            Self::StartTimeHour
            | Self::StartTimeDay
            | Self::StartTimeWeek
            | Self::StartTimeMonth => ", start_time",
            Self::AvgBadge => {
                ", assumeNotNull(coalesce(greatest(average_badge_team0, average_badge_team1), 0)) as max_avg_badge"
            }
            Self::NoBucket => "",
        }
    }
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct GameStatsQuery {
    /// Bucket allows you to group the stats by a specific field.
    #[serde(default)]
    #[param(inline)]
    bucket: BucketQuery,
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
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct AnalyticsGameStats {
    pub bucket: u32,
    pub total_matches: u64,
    pub avg_duration_s: f64,
    pub avg_kills: f64,
    pub avg_deaths: f64,
    pub avg_assists: f64,
    pub avg_kd_ratio: f64,
    pub avg_net_worth: f64,
    pub avg_last_hits: f64,
    pub avg_denies: f64,
    pub avg_player_damage: f64,
    pub avg_player_damage_taken: f64,
    pub avg_boss_damage: f64,
    pub avg_player_healing: f64,
    pub avg_accuracy: f64,
    pub avg_crit_rate: f64,
    pub avg_ending_level: f64,
    pub avg_gold_player: f64,
    pub avg_gold_lane_creep: f64,
    pub avg_gold_neutral_creep: f64,
    pub avg_gold_boss: f64,
    pub avg_gold_treasure: f64,
    pub avg_gold_denied: f64,
    pub avg_gold_death_loss: f64,
    pub avg_creep_damage: f64,
    pub avg_neutral_damage: f64,
    pub avg_self_healing: f64,
    pub avg_damage_mitigated: f64,
    pub avg_damage_absorbed: f64,
    pub avg_heal_prevented: f64,
    pub avg_creep_kills: f64,
    pub avg_neutral_kills: f64,
    pub avg_gold_boss_orb: f64,
    pub avg_possible_creeps: f64,
    pub avg_max_health: f64,
    pub avg_weapon_power: f64,
    pub avg_tech_power: f64,
    pub avg_first_mid_boss_time_s: f64,
    pub avg_objectives_destroyed_time_s: f64,
    pub mid_boss_kill_rate: f64,
    pub abandon_rate: f64,
}

fn build_query(query: &GameStatsQuery) -> String {
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
    let bucket = query.bucket.get_select_clause();
    let info_select = query.bucket.get_info_select_clause();
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    format!(
        "
    WITH t_matches AS (
        SELECT match_id, duration_s
            {info_select}
            , arrayMin(arrayFilter(x -> x > 0, `mid_boss.destroyed_time_s`)) AS first_mid_boss_time_s
            , length(`mid_boss.destroyed_time_s`) > 0 AS has_mid_boss
            , arrayAvg(arrayFilter(x -> x > 0, `objectives.destroyed_time_s`)) AS avg_obj_destroyed_time_s
            , length(arrayFilter(x -> x > 0, `objectives.destroyed_time_s`)) > 0 AS has_objectives
        FROM match_info
        WHERE match_mode IN ('Ranked', 'Unranked')
            AND {game_mode_filter}
            {info_filters}
    )
    SELECT
        {bucket} AS bucket,
        uniq(mp.match_id) AS total_matches,
        avg(tm.duration_s) AS avg_duration_s,
        avg(kills) AS avg_kills,
        avg(deaths) AS avg_deaths,
        avg(assists) AS avg_assists,
        avg(kills / greatest(1, deaths)) AS avg_kd_ratio,
        avg(net_worth) AS avg_net_worth,
        avg(last_hits) AS avg_last_hits,
        avg(denies) AS avg_denies,
        assumeNotNull(coalesce(avg(max_player_damage), 0)) AS avg_player_damage,
        assumeNotNull(coalesce(avg(max_player_damage_taken), 0)) AS avg_player_damage_taken,
        assumeNotNull(coalesce(avg(max_boss_damage), 0)) AS avg_boss_damage,
        assumeNotNull(coalesce(avg(max_player_healing), 0)) AS avg_player_healing,
        assumeNotNull(coalesce(avg(max_shots_hit / greatest(1, max_shots_hit + max_shots_missed)), 0)) AS avg_accuracy,
        assumeNotNull(coalesce(avg(max_hero_bullets_hit_crit / greatest(1, max_hero_bullets_hit_crit + max_hero_bullets_hit)), 0)) AS avg_crit_rate,
        assumeNotNull(coalesce(avg(max_level), 0)) AS avg_ending_level,
        assumeNotNull(coalesce(avg(max_gold_player), 0)) AS avg_gold_player,
        assumeNotNull(coalesce(avg(max_gold_lane_creep), 0)) AS avg_gold_lane_creep,
        assumeNotNull(coalesce(avg(max_gold_neutral_creep), 0)) AS avg_gold_neutral_creep,
        assumeNotNull(coalesce(avg(max_gold_boss), 0)) AS avg_gold_boss,
        assumeNotNull(coalesce(avg(max_gold_treasure), 0)) AS avg_gold_treasure,
        assumeNotNull(coalesce(avg(max_gold_denied), 0)) AS avg_gold_denied,
        assumeNotNull(coalesce(avg(max_gold_death_loss), 0)) AS avg_gold_death_loss,
        assumeNotNull(coalesce(avg(max_creep_damage), 0)) AS avg_creep_damage,
        assumeNotNull(coalesce(avg(max_neutral_damage), 0)) AS avg_neutral_damage,
        assumeNotNull(coalesce(avg(arrayMax(mp.stats.self_healing)), 0)) AS avg_self_healing,
        assumeNotNull(coalesce(avg(arrayMax(mp.stats.damage_mitigated)), 0)) AS avg_damage_mitigated,
        assumeNotNull(coalesce(avg(arrayMax(mp.stats.absorption_provided)), 0)) AS avg_damage_absorbed,
        assumeNotNull(coalesce(avg(arrayMax(mp.stats.heal_prevented)), 0)) AS avg_heal_prevented,
        assumeNotNull(coalesce(avg(max_creep_kills), 0)) AS avg_creep_kills,
        assumeNotNull(coalesce(avg(max_neutral_kills), 0)) AS avg_neutral_kills,
        assumeNotNull(coalesce(avg(arrayMax(mp.stats.gold_boss_orb)), 0)) AS avg_gold_boss_orb,
        assumeNotNull(coalesce(avg(arrayMax(mp.stats.possible_creeps)), 0)) AS avg_possible_creeps,
        assumeNotNull(coalesce(avg(max_max_health), 0)) AS avg_max_health,
        assumeNotNull(coalesce(avg(arrayMax(mp.stats.weapon_power)), 0)) AS avg_weapon_power,
        assumeNotNull(coalesce(avg(arrayMax(mp.stats.tech_power)), 0)) AS avg_tech_power,
        if(isNaN(avgIf(tm.first_mid_boss_time_s, tm.has_mid_boss)), 0, avgIf(tm.first_mid_boss_time_s, tm.has_mid_boss)) AS avg_first_mid_boss_time_s,
        if(isNaN(avgIf(tm.avg_obj_destroyed_time_s, tm.has_objectives)), 0, avgIf(tm.avg_obj_destroyed_time_s, tm.has_objectives)) AS avg_objectives_destroyed_time_s,
        uniqIf(mp.match_id, tm.has_mid_boss) / greatest(1, uniq(mp.match_id)) AS mid_boss_kill_rate,
        avg(abandon_match_time_s > 0) AS abandon_rate
    FROM match_player mp
    INNER JOIN t_matches tm ON mp.match_id = tm.match_id
    WHERE mp.match_id IN (SELECT match_id FROM t_matches)
    GROUP BY bucket
    ORDER BY bucket
    "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<AnalyticsGameStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<AnalyticsGameStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_game_stats(
    ch_client: &clickhouse::Client,
    mut query: GameStatsQuery,
) -> APIResult<Vec<AnalyticsGameStats>> {
    query.min_unix_timestamp = query.min_unix_timestamp.map(|v| v - v % 3600);
    query.max_unix_timestamp = query.max_unix_timestamp.map(|v| v + 3600 - v % 3600);
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
}

#[utoipa::path(
    get,
    path = "/game-stats",
    params(GameStatsQuery),
    responses(
        (status = OK, description = "Game Stats", body = [AnalyticsGameStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch game stats")
    ),
    tags = ["Analytics"],
    summary = "Game Stats",
    description = "
Retrieves aggregate game-level statistics.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn game_stats(
    Query(query): Query<GameStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_game_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod test {
    use tracing::warn;

    use super::*;

    #[test]
    fn test_build_query_no_bucket() {
        let query = GameStatsQuery::default();
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("toUInt32(0) AS bucket"));
    }

    #[test]
    fn test_build_query_avg_badge_bucket() {
        let query = GameStatsQuery {
            bucket: BucketQuery::AvgBadge,
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("toUInt32(max_avg_badge) AS bucket"));
    }

    #[test]
    fn test_build_query_min_unix_timestamp() {
        let query = GameStatsQuery {
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_query_max_unix_timestamp() {
        let query = GameStatsQuery {
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_duration_filters() {
        let query = GameStatsQuery {
            min_duration_s: Some(600),
            max_duration_s: Some(1800),
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("duration_s >= 600"));
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_query_badge_filters() {
        let query = GameStatsQuery {
            min_average_badge: Some(61),
            max_average_badge: Some(112),
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
        assert!(sql.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
    }

    #[test]
    fn test_build_query_match_id_filters() {
        let query = GameStatsQuery {
            min_match_id: Some(10000),
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("match_id >= 10000"));
        assert!(sql.contains("match_id <= 1000000"));
    }
}
