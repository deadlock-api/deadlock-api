use crate::error::{APIError, APIResult};
use crate::state::AppState;
use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ClickhouseMatchInfo {
    pub match_id: u64,
    pub start_time: u32,
    pub duration_s: u32,
    pub match_mode: i8,
    #[serde(default)]
    pub average_badge_team0: Option<u32>,
    #[serde(default)]
    pub average_badge_team1: Option<u32>,
    pub account_hero_ids: Vec<(u32, u32)>,
}

#[cached(
    ty = "TimedCache<String, Vec<ClickhouseMatchInfo>>",
    create = "{ TimedCache::with_lifespan(60) }",
    result = true,
    convert = r#"{ format!("") }"#,
    sync_writes = "default"
)]
async fn get_recently_fetched_match_ids(
    ch_client: &clickhouse::Client,
) -> APIResult<Vec<ClickhouseMatchInfo>> {
    let query = r#"
    SELECT match_id,
        any(start_time) as start_time,
        any(duration_s) as duration_s,
        any(match_mode) as match_mode,
        any(average_badge_team0),
        any(average_badge_team1),
        groupUniqArray(12)((account_id, hero_id)) as account_ids
    FROM match_info FINAL
        INNER JOIN match_player FINAL USING (match_id)
    WHERE created_at > now() - 600 AND match_outcome = 'TeamWin' AND match_info.match_mode IN ('Ranked', 'Unranked') AND game_mode = 'Normal'
    GROUP BY match_id
    ORDER BY any(created_at) DESC
    "#;
    ch_client
        .query(query)
        .fetch_all()
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch recently fetched matches: {}", e),
        })
}

#[utoipa::path(
    get,
    path = "/recently-fetched",
    responses(
        (status = OK, description = "Recently fetched match info", body = [ClickhouseMatchInfo]),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch recently fetched matches")
    ),
    tags = ["Matches"],
    summary = "Recently Fetched Matches",
    description = r"This endpoint returns a list of match ids that have been fetched within the last 10 minutes."
)]
pub async fn recently_fetched(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    get_recently_fetched_match_ids(&state.clickhouse_client)
        .await
        .map(Json)
}
