use crate::error::APIResult;
use crate::routes::v1::players::types::AccountIdQuery;
use crate::state::AppState;
use crate::utils::parse::default_true;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub struct MateStatsQuery {
    /// Filter matches based on their start time (Unix timestamp).
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
    /// Filter based on the number of matches played.
    pub min_matches_played: Option<u64>,
    /// Filter based on the number of matches played.
    #[serde(default = "default_true")]
    #[param(default = true)]
    pub same_party: bool,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct MateStats {
    pub mate_id: u32,
    pub wins: u64,
    pub matches_played: u64,
    pub matches: Vec<u64>,
}

fn build_mate_stats_query(account_id: u32, query: &MateStatsQuery) -> String {
    let mut filters = vec![];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        filters.push(format!("match_id <= {max_match_id}"));
    }
    if let Some(min_badge_level) = query.min_average_badge {
        filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
        filters.push(format!(
            "average_badge_team0 <= {max_badge_level} AND average_badge_team1 <= {max_badge_level}"
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        filters.push(format!("duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        filters.push(format!("duration_s <= {max_duration_s}"));
    }
    let filters = if filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", filters.join(" AND "))
    };

    if query.same_party {
        format!(
            r#"
            WITH matches AS (SELECT DISTINCT match_id, team, party
                             FROM match_player
                             WHERE account_id = {account_id} AND party != 0 {filters}),
                 mates AS (SELECT DISTINCT match_id, won, account_id
                           FROM match_player
                           WHERE (match_id, team, party) IN (SELECT match_id, team, party FROM matches) AND account_id != {account_id})
            SELECT account_id as mate_id, sum(won) as wins, count() as matches_played, groupUniqArray(match_id) as matches
            FROM mates
            GROUP BY mate_id
            HAVING matches_played > {}
            ORDER BY matches_played DESC
            "#,
            query.min_matches_played.unwrap_or_default()
        )
    } else {
        format!(
            r#"
            WITH matches AS (SELECT DISTINCT match_id, team
                             FROM match_player
                             WHERE account_id = {account_id} {filters}),
                 mates AS (SELECT DISTINCT match_id, won, account_id
                           FROM match_player
                           WHERE (match_id, team) IN (SELECT match_id, team FROM matches) AND account_id != {account_id})
            SELECT account_id as mate_id, sum(won) as wins, count() as matches_played, groupUniqArray(match_id) as matches
            FROM mates
            GROUP BY mate_id
            HAVING matches_played > {}
            ORDER BY matches_played DESC
            "#,
            query.min_matches_played.unwrap_or_default()
        )
    }
}

#[cached(
    ty = "TimedCache<(u32, MateStatsQuery), Vec<MateStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ (account_id, query) }",
    sync_writes = "by_key",
    key = "(u32, MateStatsQuery)"
)]
async fn get_mate_stats(
    ch_client: &clickhouse::Client,
    account_id: u32,
    query: MateStatsQuery,
) -> APIResult<Vec<MateStats>> {
    let query = build_mate_stats_query(account_id, &query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/{account_id}/mate-stats",
    params(AccountIdQuery, MateStatsQuery),
    responses(
        (status = OK, description = "Mate Stats", body = [MateStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch mate stats")
    ),
    tags = ["Players"],
    summary = "Mate Stats",
    description = "This endpoint returns the mate stats."
)]
pub async fn mate_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<MateStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_mate_stats(&state.ch_client, account_id, query)
        .await
        .map(Json)
}
