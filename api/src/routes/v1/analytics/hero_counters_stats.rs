use crate::error::{APIError, APIResult};
use crate::state::AppState;
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
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

fn default_min_matches() -> Option<u64> {
    50.into()
}

#[derive(Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct HeroCounterStatsQuery {
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    pub min_unix_timestamp: Option<u64>,
    /// Filter matches based on their start time (Unix timestamp).
    pub max_unix_timestamp: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    pub min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    pub max_duration_s: Option<u64>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    pub min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    pub max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    pub min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    pub max_match_id: Option<u64>,
    /// When `true`, only considers matchups where both `hero_id` and `enemy_hero_id` were assigned to the same lane (e.g., both Mid Lane). When `false`, considers all matchups regardless of assigned lane.
    #[serde(default = "default_true_option")]
    #[param(default = true)]
    pub same_lane_filter: Option<bool>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    pub account_id: Option<u32>,
    /// The minimum number of matches played for a hero combination to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 50)]
    pub min_matches: Option<u64>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroCounterStats {
    /// The ID of the hero.
    pub hero_id: u32,
    /// The ID of the opposing hero.
    pub enemy_hero_id: u32,
    /// The number of times `hero_id` won the match when facing `enemy_hero_id`.
    pub wins: u64,
    /// The total number of matches played between `hero_id` and `enemy_hero_id` that meet the filter criteria.
    pub matches_played: u64,
}

fn build_hero_counter_stats_query(query: &HeroCounterStatsQuery) -> String {
    let mut info_filters = vec![];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        info_filters.push(format!("start_time >= {}", min_unix_timestamp));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {}", max_unix_timestamp));
    }
    if let Some(min_match_id) = query.min_match_id {
        info_filters.push(format!("match_id >= {}", min_match_id));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {}", max_match_id));
    }
    if let Some(min_badge_level) = query.min_average_badge {
        info_filters.push(format!(
            "average_badge_team0 >= {} AND average_badge_team1 >= {}",
            min_badge_level, min_badge_level
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
        info_filters.push(format!(
            "average_badge_team0 <= {} AND average_badge_team1 <= {}",
            max_badge_level, max_badge_level
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        info_filters.push(format!("duration_s >= {}", min_duration_s));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {}", max_duration_s));
    }
    let info_filters = if info_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", info_filters.join(" AND "))
    };
    let mut player_filters = vec![];
    if query.same_lane_filter.unwrap_or(true) {
        player_filters.push("p1.assigned_lane = p2.assigned_lane".to_string());
    }
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("p1.account_id = {}", account_id));
    }
    let player_filters = if player_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    let query = format!(
        r#"
    WITH matches AS (SELECT match_id
                 FROM match_info
                 WHERE match_outcome = 'TeamWin'
                   AND match_mode IN ('Ranked', 'Unranked')
                   AND game_mode = 'Normal' {})
    SELECT p1.hero_id  AS hero_id,
           p2.hero_id  AS enemy_hero_id,
           SUM(p1.won) AS wins,
           COUNT()     AS matches_played
    FROM match_player p1
             INNER JOIN match_player p2 USING (match_id)
    WHERE match_id IN matches
      AND p1.team != p2.team
      {}
    GROUP BY p1.hero_id, p2.hero_id
    HAVING matches_played >= {}
    ORDER BY p1.hero_id, p2.hero_id
    "#,
        info_filters,
        player_filters,
        query
            .min_matches
            .or(default_min_matches())
            .unwrap_or_default()
    );
    query
}

#[cached(
    ty = "TimedCache<String, Vec<HeroCounterStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_hero_counter_stats(
    ch_client: &clickhouse::Client,
    query: &HeroCounterStatsQuery,
) -> APIResult<Vec<HeroCounterStats>> {
    let query = build_hero_counter_stats_query(query);
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch hero counter stats: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch hero counter stats: {}", e),
        }
    })
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
    description = r#"
Retrieves hero-versus-hero matchup statistics based on historical match data.

This endpoint analyzes completed matches to calculate how often a specific hero (`hero_id`) wins against an enemy hero (`enemy_hero_id`) and the total number of times they have faced each other under the specified filter conditions.

Results are cached for **1 hour** based on the combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.
    "#
)]
pub async fn hero_counters_stats(
    Query(query): Query<HeroCounterStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_counter_stats(&state.ch_client, &query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;
    use rstest::rstest;

    #[rstest]
    fn test_build_hero_counters_stats_query(
        #[values(None, Some(1672531200))] min_unix_timestamp: Option<u64>,
        #[values(None, Some(1675209599))] max_unix_timestamp: Option<u64>,
        #[values(None, Some(600))] min_duration_s: Option<u64>,
        #[values(None, Some(1800))] max_duration_s: Option<u64>,
        #[values(None, Some(1))] min_average_badge: Option<u8>,
        #[values(None, Some(116))] max_average_badge: Option<u8>,
        #[values(None, Some(10000))] min_match_id: Option<u64>,
        #[values(None, Some(1000000))] max_match_id: Option<u64>,
        #[values(None, Some(true), Some(false))] same_lane_filter: Option<bool>,
        #[values(None, Some(18373975))] account_id: Option<u32>,
        #[values(None, Some(10))] min_matches: Option<u64>,
    ) {
        let query = HeroCounterStatsQuery {
            min_unix_timestamp,
            max_unix_timestamp,
            min_duration_s,
            max_duration_s,
            min_average_badge,
            max_average_badge,
            min_match_id,
            max_match_id,
            same_lane_filter,
            account_id,
            min_matches,
        };
        let query = build_hero_counter_stats_query(&query);

        if let Some(min_unix_timestamp) = min_unix_timestamp {
            assert!(query.contains(&format!("start_time >= {}", min_unix_timestamp)));
        }
        if let Some(max_unix_timestamp) = max_unix_timestamp {
            assert!(query.contains(&format!("start_time <= {}", max_unix_timestamp)));
        }
        if let Some(min_duration_s) = min_duration_s {
            assert!(query.contains(&format!("duration_s >= {}", min_duration_s)));
        }
        if let Some(max_duration_s) = max_duration_s {
            assert!(query.contains(&format!("duration_s <= {}", max_duration_s)));
        }
        if let Some(min_average_badge) = min_average_badge {
            assert!(query.contains(&format!(
                "average_badge_team0 >= {} AND average_badge_team1 >= {}",
                min_average_badge, min_average_badge
            )));
        }
        if let Some(max_average_badge) = max_average_badge {
            assert!(query.contains(&format!(
                "average_badge_team0 <= {} AND average_badge_team1 <= {}",
                max_average_badge, max_average_badge
            )));
        }
        if let Some(min_match_id) = min_match_id {
            assert!(query.contains(&format!("match_id >= {}", min_match_id)));
        }
        if let Some(max_match_id) = max_match_id {
            assert!(query.contains(&format!("match_id <= {}", max_match_id)));
        }
        if let Some(same_lane_filter) = same_lane_filter {
            if same_lane_filter {
                assert!(query.contains("p1.assigned_lane = p2.assigned_lane"));
            } else {
                assert!(!query.contains("p1.assigned_lane = p2.assigned_lane"));
            }
        }
        if let Some(account_id) = account_id {
            assert!(query.contains(&format!("account_id = {}", account_id)));
        }
        if let Some(min_matches) = min_matches {
            assert!(query.contains(&format!("matches_played >= {}", min_matches)));
        }
    }
}
