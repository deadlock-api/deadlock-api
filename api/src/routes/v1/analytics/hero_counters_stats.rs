use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, default_true_option,
    parse_steam_id_option,
};

fn default_min_matches() -> Option<u64> {
    20.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(super) struct HeroCounterStatsQuery {
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
    /// Filter enemy players based on their net worth.
    min_enemy_networth: Option<u64>,
    /// Filter enemy players based on their net worth.
    max_enemy_networth: Option<u64>,
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
    /// When `true`, only considers matchups where both `hero_id` and `enemy_hero_id` were assigned to the same lane (e.g., both Mid Lane). When `false`, considers all matchups regardless of assigned lane.
    #[serde(default = "default_true_option")]
    #[param(default = true)]
    same_lane_filter: Option<bool>,
    /// The minimum number of matches played for a hero combination to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u64>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    account_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroCounterStats {
    /// The ID of the hero. See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_id: u32,
    /// The ID of the opposing hero. See more: <https://assets.deadlock-api.com/v2/heroes>
    pub enemy_hero_id: u32,
    /// The number of times `hero_id` won the match when facing `enemy_hero_id`.
    pub wins: u64,
    /// The total number of matches played between `hero_id` and `enemy_hero_id` that meet the filter criteria.
    pub matches_played: u64,
    /// The number of kills by `hero_id` when facing `enemy_hero_id`.
    kills: u64,
    /// The number of kills by `enemy_hero_id` when facing `hero_id`.
    enemy_kills: u64,
    /// The number of deaths by `hero_id` when facing `enemy_hero_id`.
    deaths: u64,
    /// The number of deaths by `enemy_hero_id` when facing `hero_id`.
    enemy_deaths: u64,
    /// The number of assists by `hero_id` when facing `enemy_hero_id`.
    assists: u64,
    /// The number of assists by `enemy_hero_id` when facing `hero_id`.
    enemy_assists: u64,
    /// The number of denies by `hero_id` when facing `enemy_hero_id`.
    denies: u64,
    /// The number of denies by `enemy_hero_id` when facing `hero_id`.
    enemy_denies: u64,
    /// The number of last hits by `hero_id` when facing `enemy_hero_id`.
    last_hits: u64,
    /// The number of last hits by `enemy_hero_id` when facing `hero_id`.
    enemy_last_hits: u64,
    /// The net worth of `hero_id` when facing `enemy_hero_id`.
    networth: u64,
    /// The net worth of `enemy_hero_id` when facing `hero_id`.
    enemy_networth: u64,
    /// The amount of objective damage dealt by `hero_id` when facing `enemy_hero_id`.
    obj_damage: u64,
    /// The amount of objective damage dealt by `enemy_hero_id` when facing `hero_id`.
    enemy_obj_damage: u64,
    /// The number of creeps killed by `hero_id` when facing `enemy_hero_id`.
    creeps: u64,
    /// The number of creeps killed by `enemy_hero_id` when facing `hero_id`.
    enemy_creeps: u64,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &HeroCounterStatsQuery) -> String {
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
    if query.same_lane_filter.unwrap_or(true) {
        player_filters.push("p1.assigned_lane = p2.assigned_lane".to_owned());
    }
    #[allow(deprecated)]
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("p1.account_id = {account_id}"));
    }
    if let Some(account_ids) = &query.account_ids {
        player_filters.push(format!(
            "p1.account_id IN ({})",
            account_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("p1.net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("p1.net_worth <= {max_networth}"));
    }
    if let Some(min_enemy_networth) = query.min_enemy_networth {
        player_filters.push(format!("p2.net_worth >= {min_enemy_networth}"));
    }
    if let Some(max_enemy_networth) = query.max_enemy_networth {
        player_filters.push(format!("p2.net_worth <= {max_enemy_networth}"));
    }
    let player_filters = if player_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("matches_played >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches_played <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };
    format!(
        "
    WITH matches AS (SELECT match_id
                 FROM match_info
                 WHERE match_mode IN ('Ranked', 'Unranked') {info_filters})
    SELECT p1.hero_id  AS hero_id,
           p2.hero_id  AS enemy_hero_id,
           SUM(p1.won) AS wins,
           COUNT()     AS matches_played,
           SUM(p1.kills) AS kills,
           SUM(p2.kills) AS enemy_kills,
           SUM(p1.deaths) AS deaths,
           SUM(p2.deaths) AS enemy_deaths,
           SUM(p1.assists) AS assists,
           SUM(p2.assists) AS enemy_assists,
           SUM(p1.denies) AS denies,
           SUM(p2.denies) AS enemy_denies,
           SUM(p1.last_hits) AS last_hits,
           SUM(p2.last_hits) AS enemy_last_hits,
           SUM(p1.net_worth) AS networth,
           SUM(p2.net_worth) AS enemy_networth,
           SUM(p1.max_boss_damage) AS obj_damage,
           SUM(p2.max_boss_damage) AS enemy_obj_damage,
           SUM(p1.max_creep_kills) AS creeps,
           SUM(p2.max_creep_kills) AS enemy_creeps
    FROM match_player p1
             INNER JOIN match_player p2 USING (match_id)
    WHERE match_id IN matches
      AND p1.team != p2.team
      {player_filters}
    GROUP BY p1.hero_id, p2.hero_id
    {having_clause}
    ORDER BY p1.hero_id, p2.hero_id
    "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<HeroCounterStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<HeroCounterStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_hero_counter_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroCounterStatsQuery,
) -> APIResult<Vec<HeroCounterStats>> {
    query.min_unix_timestamp = query.min_unix_timestamp.map(|v| v - v % 3600);
    query.max_unix_timestamp = query.max_unix_timestamp.map(|v| v + 3600 - v % 3600);
    let query = build_query(&query);
    debug!(?query);
    Ok(run_query(ch_client, &query).await?)
}

#[utoipa::path(
    get,
    path = "/hero-counter-stats",
    params(HeroCounterStatsQuery),
    responses(
        (status = OK, description = "Hero Counter Stats", body = [HeroCounterStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero counter stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Counter Stats",
    description = "
Retrieves hero-versus-hero matchup statistics based on historical match data.

This endpoint analyzes completed matches to calculate how often a specific hero (`hero_id`) wins against an enemy hero (`enemy_hero_id`) and the total number of times they have faced each other under the specified filter conditions.

Results are cached for **1 hour** based on the combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn hero_counters_stats(
    Query(mut query): Query<HeroCounterStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if let Some(account_ids) = query.account_ids {
        let protected_users = state
            .steam_client
            .get_protected_users(&state.pg_client)
            .await?;
        query.account_ids = Some(
            account_ids
                .into_iter()
                .filter(|id| !protected_users.contains(id))
                .collect::<Vec<_>>(),
        );
    }
    #[allow(deprecated)]
    if let Some(account_id) = query.account_id
        && state
            .steam_client
            .is_user_protected(&state.pg_client, account_id)
            .await?
    {
        return Err(APIError::protected_user());
    }
    get_hero_counter_stats(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_hero_counters_stats_query_min_unix_timestamp() {
        let query = HeroCounterStatsQuery {
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_max_unix_timestamp() {
        let query = HeroCounterStatsQuery {
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_min_duration_s() {
        let query = HeroCounterStatsQuery {
            min_duration_s: Some(600),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("duration_s >= 600"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_max_duration_s() {
        let query = HeroCounterStatsQuery {
            max_duration_s: Some(1800),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_min_networth() {
        let query = HeroCounterStatsQuery {
            min_networth: Some(1000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("p1.net_worth >= 1000"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_max_networth() {
        let query = HeroCounterStatsQuery {
            max_networth: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("p1.net_worth <= 10000"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_min_enemy_networth() {
        let query = HeroCounterStatsQuery {
            min_enemy_networth: Some(1000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("p2.net_worth >= 1000"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_max_enemy_networth() {
        let query = HeroCounterStatsQuery {
            max_enemy_networth: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("p2.net_worth <= 10000"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_min_average_badge() {
        let query = HeroCounterStatsQuery {
            min_average_badge: Some(61),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_max_average_badge() {
        let query = HeroCounterStatsQuery {
            max_average_badge: Some(112),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_min_match_id() {
        let query = HeroCounterStatsQuery {
            min_match_id: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_max_match_id() {
        let query = HeroCounterStatsQuery {
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_same_lane_filter_true() {
        let query = HeroCounterStatsQuery {
            same_lane_filter: Some(true),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("p1.assigned_lane = p2.assigned_lane"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_same_lane_filter_false() {
        let query = HeroCounterStatsQuery {
            same_lane_filter: Some(false),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(!sql.contains("p1.assigned_lane = p2.assigned_lane"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_account_id() {
        let query = HeroCounterStatsQuery {
            account_ids: Some(vec![18373975]),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("account_id IN (18373975)"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_min_matches() {
        let query = HeroCounterStatsQuery {
            min_matches: Some(10),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("matches_played >= 10"));
    }

    #[test]
    fn test_build_hero_counters_stats_query_max_matches() {
        let query = HeroCounterStatsQuery {
            max_matches: Some(100),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("matches_played <= 100"));
    }
}
