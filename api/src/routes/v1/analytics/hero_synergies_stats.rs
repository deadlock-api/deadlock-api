use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::{
    default_last_month_timestamp, default_true_option, parse_steam_id_option,
};
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

fn default_min_matches() -> Option<u64> {
    20.into()
}

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(super) struct HeroSynergyStatsQuery {
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    min_unix_timestamp: Option<u64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<u64>,
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
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: https://assets.deadlock-api.com/v2/ranks
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: https://assets.deadlock-api.com/v2/ranks
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// When `true`, only considers matchups where both `hero_id1` and `hero_id2` were assigned to the same lane (e.g., both Mid Lane). When `false`, considers all matchups regardless of assigned lane.
    #[serde(default = "default_true_option")]
    #[param(default = true)]
    same_lane_filter: Option<bool>,
    /// When `true`, only considers matchups where both `hero_id` and `hero_id2` were on the same party. When `false`, considers all matchups regardless of party affiliation.
    #[serde(default = "default_true_option")]
    #[param(default = true)]
    same_party_filter: Option<bool>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    account_id: Option<u32>,
    /// The minimum number of matches played for a hero combination to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u64>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroSynergyStats {
    /// The ID of the first hero in the pair.
    pub hero_id1: u32,
    /// The ID of the second hero in the pair.
    pub hero_id2: u32,
    /// The number of times the team won when both `hero_id1` and `hero_id2` were on the same team.
    pub wins: u64,
    /// The total number of matches played where `hero_id1` and `hero_id2` were on the same team, meeting the filter criteria.
    pub matches_played: u64,
    /// The number of kills by `hero_id1` when playing with `hero_id2`.
    pub kills1: u64,
    /// The number of kills by `hero_id2` when playing with `hero_id1`.
    pub kills2: u64,
    /// The number of deaths by `hero_id1` when playing with `hero_id2`.
    pub deaths1: u64,
    /// The number of deaths by `hero_id2` when playing with `hero_id1`.
    pub deaths2: u64,
    /// The number of assists by `hero_id1` when playing with `hero_id2`.
    pub assists1: u64,
    /// The number of assists by `hero_id2` when playing with `hero_id1`.
    pub assists2: u64,
    /// The number of denies by `hero_id1` when playing with `hero_id2`.
    pub denies1: u64,
    /// The number of denies by `hero_id2` when playing with `hero_id1`.
    pub denies2: u64,
    /// The number of last hits by `hero_id1` when playing with `hero_id2`.
    pub last_hits1: u64,
    /// The number of last hits by `hero_id2` when playing with `hero_id1`.
    pub last_hits2: u64,
    /// The net worth of `hero_id1` when playing with `hero_id2`.
    pub networth1: u64,
    /// The net worth of `hero_id2` when playing with `hero_id1`.
    pub networth2: u64,
    /// The amount of objective damage dealt by `hero_id1` when playing with `hero_id2`.
    pub obj_damage1: u64,
    /// The amount of objective damage dealt by `hero_id2` when playing with `hero_id1`.
    pub obj_damage2: u64,
    /// The number of creeps killed by `hero_id1` when playing with `hero_id2`.
    pub creeps1: u64,
    /// The number of creeps killed by `hero_id2` when playing with `hero_id1`.
    pub creeps2: u64,
}

fn build_query(query: &HeroSynergyStatsQuery) -> String {
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
    if let Some(min_badge_level) = query.min_average_badge {
        info_filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
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
        player_filters.push("p1.assigned_lane = p2.assigned_lane".to_string());
    }
    if query.same_party_filter.unwrap_or(true) {
        player_filters.push("p1.party = p2.party AND p1.party > 0".to_string());
    }
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("p1.account_id = {account_id}"));
    }
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("p1.net_worth >= {min_networth}"));
        player_filters.push(format!("p2.net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("p1.net_worth <= {max_networth}"));
        player_filters.push(format!("p2.net_worth <= {max_networth}"));
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
        r#"
    WITH matches AS (SELECT match_id
                 FROM match_info
                 WHERE match_mode IN ('Ranked', 'Unranked') {info_filters})
    SELECT p1.hero_id  AS hero_id1,
           p2.hero_id  AS hero_id2,
           SUM(p1.won) AS wins,
           COUNT()     AS matches_played,
           SUM(p1.kills) AS kills1,
           SUM(p2.kills) AS kills2,
           SUM(p1.deaths) AS deaths1,
           SUM(p2.deaths) AS deaths2,
           SUM(p1.assists) AS assists1,
           SUM(p2.assists) AS assists2,
           SUM(p1.denies) AS denies1,
           SUM(p2.denies) AS denies2,
           SUM(p1.last_hits) AS last_hits1,
           SUM(p2.last_hits) AS last_hits2,
           SUM(p1.net_worth) AS networth1,
           SUM(p2.net_worth) AS networth2,
           SUM(p1.max_neutral_damage) AS obj_damage1,
           SUM(p2.max_neutral_damage) AS obj_damage2,
           SUM(p1.max_creep_kills) AS creeps1,
           SUM(p2.max_creep_kills) AS creeps2
    FROM match_player p1
             INNER JOIN match_player p2 USING (match_id)
    WHERE match_id IN matches
      AND p1.team = p2.team
      AND p1.hero_id < p2.hero_id
      {player_filters}
    GROUP BY p1.hero_id, p2.hero_id
    {having_clause}
    ORDER BY p1.hero_id, p2.hero_id
    "#
    )
}

#[cached(
    ty = "TimedCache<HeroSynergyStatsQuery, Vec<HeroSynergyStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ query }",
    sync_writes = "by_key",
    key = "HeroSynergyStatsQuery"
)]
async fn get_hero_synergy_stats(
    ch_client: &clickhouse::Client,
    query: HeroSynergyStatsQuery,
) -> APIResult<Vec<HeroSynergyStats>> {
    let query = build_query(&query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/hero-synergy-stats",
    params(HeroSynergyStatsQuery),
    responses(
        // Update the response body description
        (status = OK, description = "Hero Synergy Stats", body = [HeroSynergyStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero synergy stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Synergy Stats",
    description = r#"
Retrieves hero pair synergy statistics based on historical match data.

This endpoint analyzes completed matches to calculate how often a specific pair of heroes (`hero_id1` and `hero_id2`) won when playing *together on the same team*, and the total number of times they have played together under the specified filter conditions.

Results are cached for **1 hour** based on the combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "#
)]
pub(super) async fn hero_synergies_stats(
    Query(query): Query<HeroSynergyStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_synergy_stats(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_query_min_max_unix_timestamp() {
        let query = HeroSynergyStatsQuery {
            min_unix_timestamp: Some(1672531200),
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time >= 1672531200"));
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_min_max_duration() {
        let query = HeroSynergyStatsQuery {
            min_duration_s: Some(600),
            max_duration_s: Some(1800),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("duration_s >= 600"));
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_query_min_networth() {
        let query = HeroSynergyStatsQuery {
            min_networth: Some(1000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("p1.net_worth >= 1000"));
        assert!(sql.contains("p2.net_worth >= 1000"));
    }

    #[test]
    fn test_build_query_max_networth() {
        let query = HeroSynergyStatsQuery {
            max_networth: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("p1.net_worth <= 10000"));
        assert!(sql.contains("p2.net_worth <= 10000"));
    }

    #[test]
    fn test_build_query_min_max_average_badge() {
        let query = HeroSynergyStatsQuery {
            min_average_badge: Some(1),
            max_average_badge: Some(116),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 >= 1 AND average_badge_team1 >= 1"));
        assert!(sql.contains("average_badge_team0 <= 116 AND average_badge_team1 <= 116"));
    }

    #[test]
    fn test_build_query_min_max_match_id() {
        let query = HeroSynergyStatsQuery {
            min_match_id: Some(10000),
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id >= 10000"));
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_query_same_lane_filter() {
        let mut query = HeroSynergyStatsQuery {
            same_lane_filter: Some(true),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("p1.assigned_lane = p2.assigned_lane"));

        query.same_lane_filter = Some(false);
        let sql = build_query(&query);
        assert!(!sql.contains("p1.assigned_lane = p2.assigned_lane"));
    }

    #[test]
    fn test_build_query_same_party_filter() {
        let mut query = HeroSynergyStatsQuery {
            same_party_filter: Some(true),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("p1.party = p2.party AND p1.party > 0"));

        query.same_party_filter = Some(false);
        let sql = build_query(&query);
        assert!(!sql.contains("p1.party = p2.party"));
    }

    #[test]
    fn test_build_query_min_matches() {
        let query = HeroSynergyStatsQuery {
            min_matches: Some(10),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("matches_played >= 10"));
    }

    #[test]
    fn test_build_query_max_matches() {
        let query = HeroSynergyStatsQuery {
            max_matches: Some(100),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("matches_played <= 100"));
    }

    #[test]
    fn test_build_query_account_id() {
        let query = HeroSynergyStatsQuery {
            account_id: Some(18373975),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("account_id = 18373975"));
    }
}
