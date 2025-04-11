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

#[derive(Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct BadgeDistributionQuery {
    /// Filter matches based on their start time (Unix timestamp).
    min_unix_timestamp: Option<u64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<u64>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct BadgeDistribution {
    /// The badge level.
    pub badge_level: u32,
    /// The total number of matches.
    pub total_matches: u64,
}

#[cached(
    ty = "TimedCache<String, Vec<BadgeDistribution>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_badge_distribution(
    ch_client: &clickhouse::Client,
    query: BadgeDistributionQuery,
) -> APIResult<Vec<BadgeDistribution>> {
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
    let filters = if filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", filters.join(" AND "))
    };
    let query = format!(
        r#"
    SELECT
        coalesce(t_badge_level, 0) as badge_level,
        COUNT() as total_matches
    FROM match_info
        ARRAY JOIN [average_badge_team0, average_badge_team1] AS t_badge_level
    WHERE match_outcome = 'TeamWin' AND match_mode IN ('Ranked', 'Unranked') AND game_mode = 'Normal' AND badge_level > 0 {}
    GROUP BY badge_level
    ORDER BY badge_level
    "#,
        filters
    );
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch badge distribution: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch badge distribution: {}", e),
        }
    })
}

#[utoipa::path(
    get,
    path = "/badge-distribution",
    params(BadgeDistributionQuery),
    responses(
        (status = OK, description = "Badge Distribution", body = [BadgeDistribution]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch badge distribution")
    ),
    tags = ["Matches"],
    summary = "Badge Distribution",
    description = "This endpoint returns the player badge distribution."
)]
pub async fn badge_distribution(
    Query(query): Query<BadgeDistributionQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_badge_distribution(&state.ch_client, query)
        .await
        .map(Json)
}
