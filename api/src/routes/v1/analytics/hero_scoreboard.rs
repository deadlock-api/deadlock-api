use crate::error::{APIError, APIResult};
use crate::routes::v1::analytics::scoreboard_types::ScoreboardQuerySortBy;
use crate::state::AppState;
use crate::utils::parse::default_last_month_timestamp;
use crate::utils::types::SortDirectionDesc;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

#[derive(Copy, Eq, Hash, PartialEq, Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct HeroScoreboardQuery {
    /// Filter by min number of matches played.
    pub min_matches: Option<u32>,
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
    /// The field to sort by.
    #[param(inline)]
    pub sort_by: ScoreboardQuerySortBy,
    /// The direction to sort heroes in.
    #[serde(default)]
    #[param(inline)]
    pub sort_direction: SortDirectionDesc,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroScoreboardEntry {
    pub rank: u64,
    pub hero_id: u32,
    pub value: f64,
}

#[cached(
    ty = "TimedCache<HeroScoreboardQuery, Vec<HeroScoreboardEntry>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ query }",
    sync_writes = "by_key",
    key = "HeroScoreboardQuery"
)]
async fn get_hero_scoreboard(
    ch_client: &clickhouse::Client,
    query: HeroScoreboardQuery,
) -> APIResult<Vec<HeroScoreboardEntry>> {
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
    let info_filters = if !info_filters.is_empty() {
        format!(" WHERE {} ", info_filters.join(" AND "))
    } else {
        "".to_owned()
    };
    let mut player_filters = vec![];
    if !info_filters.is_empty() {
        player_filters.push(format!(
            "match_id IN (SELECT match_id FROM match_info {}) ",
            info_filters
        ));
    }
    let player_filters = if !player_filters.is_empty() {
        format!(" WHERE {} ", player_filters.join(" AND "))
    } else {
        "".to_owned()
    };
    let mut player_having = vec![];
    if let Some(min_matches) = query.min_matches {
        player_having.push(format!("count(distinct match_id) >= {}", min_matches));
    }
    let player_having = if !player_having.is_empty() {
        format!(" HAVING {} ", player_having.join(" AND "))
    } else {
        "".to_owned()
    };
    let query = format!(
        r#"
SELECT rowNumberInAllBlocks() + 1 as rank, hero_id, toFloat64({}) as value
FROM match_player
{}
GROUP BY hero_id
{}
ORDER BY value {}
    "#,
        query.sort_by.get_select_clause(),
        player_filters,
        player_having,
        query.sort_direction,
    );
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch scoreboard: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch scoreboard: {}", e),
        }
    })
}

#[utoipa::path(
    get,
    path = "/heroes",
    params(HeroScoreboardQuery),
    responses(
        (status = OK, description = "Hero Scoreboard", body = [HeroScoreboardEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero scoreboard")
    ),
    tags = ["Analytics"],
    summary = "Hero Scoreboard",
    description = "This endpoint returns the hero scoreboard."
)]
pub async fn hero_scoreboard(
    Query(query): Query<HeroScoreboardQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_scoreboard(&state.ch_client, query).await.map(Json)
}
