use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub(super) struct RecentlyFetchedQuery {
    /// If true, only return matches that have been ingested by players.
    player_ingested_only: Option<bool>,
}

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
    ty = "TimedCache<bool, Vec<ClickhouseMatchInfo>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60)) }",
    result = true,
    convert = "{ player_ingested_only }",
    sync_writes = "by_key",
    key = "bool"
)]
async fn get_recently_fetched_match_ids(
    ch_client: &clickhouse::Client,
    player_ingested_only: bool,
) -> clickhouse::error::Result<Vec<ClickhouseMatchInfo>> {
    let filters = if player_ingested_only {
        "AND match_id IN (SELECT match_id FROM match_salts WHERE username IS NULL AND created_at > now() - 600)"
    } else {
        ""
    };
    let query = format!(
        "
    SELECT match_id,
        start_time,
        duration_s,
        match_mode,
        average_badge_team0,
        average_badge_team1
    FROM match_info FINAL
    WHERE created_at > now() - 600 AND match_mode IN ('Ranked', 'Unranked') {filters}
    ORDER BY created_at DESC
    "
    );
    ch_client.query(&query).fetch_all().await
}

#[utoipa::path(
    get,
    path = "/recently-fetched",
    params(RecentlyFetchedQuery),
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
    Query(RecentlyFetchedQuery {
        player_ingested_only,
    }): Query<RecentlyFetchedQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(
        get_recently_fetched_match_ids(
            &state.ch_client_ro,
            player_ingested_only.unwrap_or_default(),
        )
        .await?,
    ))
}
