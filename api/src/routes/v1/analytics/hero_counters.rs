use crate::error::{APIError, APIResult};
use crate::state::AppState;
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
pub struct HeroCounterStatsQuery {
    min_unix_timestamp: Option<u64>,
    max_unix_timestamp: Option<u64>,
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    min_match_id: Option<u64>,
    max_match_id: Option<u64>,
    #[serde(default = "default_true")]
    #[param(default = true)]
    same_lane_filter: Option<bool>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroCounterStats {
    pub hero_id: u32,
    pub enemy_hero_id: u32,
    pub wins: u64,
    pub matches_played: u64,
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
    query: HeroCounterStatsQuery,
) -> APIResult<Vec<HeroCounterStats>> {
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
    HAVING matches_played > 1
    ORDER BY p1.hero_id, p2.hero_id
    "#,
        info_filters, same_lane_filter
    );
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
    description = r"This endpoint returns the hero counter stats."
)]
pub async fn hero_counters(
    Query(query): Query<HeroCounterStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_counter_stats(&state.clickhouse_client, query)
        .await
        .map(Json)
}
