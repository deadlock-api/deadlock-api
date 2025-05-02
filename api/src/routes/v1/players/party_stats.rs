use crate::error::{APIError, APIResult};
use crate::routes::v1::players::types::AccountIdQuery;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub struct PartyStatsQuery {
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
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct PartyStats {
    pub party_size: u64,
    pub wins: u64,
    pub matches_played: u64,
    pub matches: Vec<u64>,
}

fn build_party_stats_query(account_id: u32, query: &PartyStatsQuery) -> String {
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
    format!(
        r#"
    WITH matches AS (SELECT DISTINCT match_id, team, party
                     FROM match_player
                     WHERE account_id = {account_id} {filters}),
         parties AS (SELECT match_id, any(won) as won, groupUniqArray(account_id) as account_ids
                     FROM match_player
                     WHERE account_id = {account_id} or (match_id, team, party) IN (SELECT match_id, team, party FROM matches WHERE party != 0)
                     GROUP BY match_id)
    SELECT length(account_ids) as party_size, sum(won) as wins, COUNT(DISTINCT match_id) as matches_played, groupUniqArray(match_id) as matches
    FROM parties
    GROUP BY party_size
    ORDER BY party_size
    "#
    )
}

#[cached(
    ty = "TimedCache<(u32, PartyStatsQuery), Vec<PartyStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ (account_id, query) }",
    sync_writes = "by_key",
    key = "(u32, PartyStatsQuery)"
)]
async fn get_party_stats(
    ch_client: &clickhouse::Client,
    account_id: u32,
    query: PartyStatsQuery,
) -> APIResult<Vec<PartyStats>> {
    let query = build_party_stats_query(account_id, &query);
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch party stats: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch party stats: {e}"),
        }
    })
}

#[utoipa::path(
    get,
    path = "/{account_id}/party-stats",
    params(AccountIdQuery, PartyStatsQuery),
    responses(
        (status = OK, description = "Party Stats", body = [PartyStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch party stats")
    ),
    tags = ["Players"],
    summary = "Party Stats",
    description = "This endpoint returns the party stats."
)]
pub async fn party_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<PartyStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_party_stats(&state.ch_client, account_id, query)
        .await
        .map(Json)
}
