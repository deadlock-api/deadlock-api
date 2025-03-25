use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::parse::default_last_month_timestamp;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

fn default_true() -> Option<bool> {
    true.into()
}

#[derive(Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct HeroSynergyStatsQuery {
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
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// When `true`, only considers matchups where both `hero_id` and `enemy_hero_id` were assigned to the same lane (e.g., both Mid Lane). When `false`, considers all matchups regardless of assigned lane.
    #[serde(default = "default_true")]
    #[param(default = true)]
    same_lane_filter: Option<bool>,
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
}

#[cached(
    ty = "TimedCache<String, Vec<HeroSynergyStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_hero_synergy_stats(
    ch_client: &clickhouse::Client,
    query: HeroSynergyStatsQuery,
) -> APIResult<Vec<HeroSynergyStats>> {
    let mut filters = vec![];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        filters.push(format!("start_time >= {}", min_unix_timestamp));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        filters.push(format!("start_time <= {}", max_unix_timestamp));
    }
    if let Some(min_match_id) = query.min_match_id {
        filters.push(format!("match_id >= {}", min_match_id));
    }
    if let Some(max_match_id) = query.max_match_id {
        filters.push(format!("match_id <= {}", max_match_id));
    }
    if let Some(min_badge_level) = query.min_average_badge {
        filters.push(format!(
            "average_badge_team0 >= {} AND average_badge_team1 >= {}",
            min_badge_level, min_badge_level
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
        filters.push(format!(
            "average_badge_team0 <= {} AND average_badge_team1 <= {}",
            max_badge_level, max_badge_level
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        filters.push(format!("duration_s >= {}", min_duration_s));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        filters.push(format!("duration_s <= {}", max_duration_s));
    }
    let info_filters = if filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", filters.join(" AND "))
    };
    let same_lane_filter = if query.same_lane_filter.unwrap_or(true) {
        "AND p1.assigned_lane = p2.assigned_lane"
    } else {
        ""
    };
    let query = format!(
        r#"
    WITH matches AS (SELECT match_id
                 FROM match_info
                 WHERE match_outcome = 'TeamWin'
                   AND match_mode IN ('Ranked', 'Unranked')
                   AND game_mode = 'Normal' {})
    SELECT p1.hero_id  AS hero_id1,
           p2.hero_id  AS hero_id2,
           SUM(p1.won) AS wins,
           COUNT()     AS matches_played
    FROM match_player p1
             INNER JOIN match_player p2 USING (match_id)
    WHERE match_id IN matches
      AND p1.team = p2.team
      AND p1.hero_id < p2.hero_id
      {}
    GROUP BY p1.hero_id, p2.hero_id
    HAVING matches_played > 1
    ORDER BY p1.hero_id, p2.hero_id
    "#,
        info_filters, same_lane_filter
    );
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch hero synergy stats: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch hero synergy stats: {}", e),
        }
    })
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
    "#
)]
pub async fn hero_synergies(
    Query(query): Query<HeroSynergyStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_synergy_stats(&state.clickhouse_client, query)
        .await
        .map(Json)
}
