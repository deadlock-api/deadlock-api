use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{MatchInfoFilters, round_timestamps};
use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::{MIN_DEMO_PLAYER_TIMESTAMP, default_last_month_timestamp};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(super) struct HeroBanStatsQuery {
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago. **Minimum:** March 1, 2026.
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
pub struct HeroBanStats {
    /// The ID of the banned hero. See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_id: u32,
    /// The number of matches in which this hero was banned.
    pub bans: u64,
}

fn build_query(query: &HeroBanStatsQuery) -> String {
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
    format!(
        "
    WITH t_matches AS (
        SELECT match_id
        FROM match_info
        WHERE match_mode IN ('Ranked', 'Unranked') AND game_mode = 1 {info_filters}
    ),
    t_bans AS (
        SELECT dp.match_id, any(dp.banned_hero_ids) AS banned_hero_ids
        FROM demo_player dp
        WHERE dp.match_id IN (SELECT match_id FROM t_matches) AND notEmpty(dp.banned_hero_ids)
        GROUP BY dp.match_id
    )
    SELECT arrayJoin(banned_hero_ids) AS hero_id, uniq(match_id) AS bans
    FROM t_bans
    GROUP BY hero_id
    ORDER BY bans DESC
    "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<HeroBanStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<HeroBanStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_hero_ban_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroBanStatsQuery,
) -> APIResult<Vec<HeroBanStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    query.min_unix_timestamp = Some(
        query
            .min_unix_timestamp
            .unwrap_or(MIN_DEMO_PLAYER_TIMESTAMP)
            .max(MIN_DEMO_PLAYER_TIMESTAMP),
    );
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
}

#[utoipa::path(
    get,
    path = "/hero-ban-stats",
    params(HeroBanStatsQuery),
    responses(
        (status = OK, description = "Hero Ban Stats", body = [HeroBanStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero ban stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Ban Stats",
    description = "
Retrieves ban statistics for each hero based on historical match data from demo analysis.

Only matches with successfully extracted ban data are included. Matches where ban extraction failed (empty `banned_hero_ids`) are excluded entirely.

Results are cached for **1 hour** based on the combination of query parameters provided.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn hero_ban_stats(
    Query(query): Query<HeroBanStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_ban_stats(&state.ch_client_ro, query)
        .await
        .map(Json)
}
