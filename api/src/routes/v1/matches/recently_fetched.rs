use crate::context::AppState;
use crate::error::APIResult;
use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
struct ClickhouseMatchInfo {
    match_id: u64,
    start_time: u32,
    duration_s: u32,
    match_mode: i8,
    /// See more: <https://assets.deadlock-api.com/v2/ranks>
    #[serde(default)]
    average_badge_team0: Option<u32>,
    /// See more: <https://assets.deadlock-api.com/v2/ranks>
    #[serde(default)]
    average_badge_team1: Option<u32>,
}

#[cached(
    ty = "TimedCache<u8, Vec<ClickhouseMatchInfo>>",
    create = "{ TimedCache::with_lifespan(60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn get_recently_fetched_match_ids(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<Vec<ClickhouseMatchInfo>> {
    let query = "
    SELECT match_id,
        start_time,
        duration_s,
        match_mode,
        average_badge_team0,
        average_badge_team1
    FROM match_info FINAL
    WHERE created_at > now() - 600 AND match_mode IN ('Ranked', 'Unranked')
    ORDER BY created_at DESC
    ";
    ch_client.query(query).fetch_all().await
}

#[utoipa::path(
    get,
    path = "/recently-fetched",
    responses(
        (status = OK, description = "Recently fetched match info", body = [ClickhouseMatchInfo]),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch recently fetched matches")
    ),
    tags = ["Matches"],
    summary = "Recently Fetched",
    description = "
This endpoint returns a list of match ids that have been fetched within the last 10 minutes.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn recently_fetched(
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(
        get_recently_fetched_match_ids(&state.ch_client_ro).await?,
    ))
}
