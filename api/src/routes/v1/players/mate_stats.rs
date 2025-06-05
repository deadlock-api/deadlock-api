use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::players::AccountIdQuery;
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
pub(super) struct MateStatsQuery {
    /// Filter matches based on their start time (Unix timestamp).
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
    /// Filter based on the number of matches played.
    min_matches_played: Option<u64>,
    /// Filter based on the number of matches played.
    #[serde(default = "default_true")]
    #[param(default = true)]
    same_party: bool,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
struct MateStats {
    mate_id: u32,
    wins: u64,
    matches_played: u64,
    matches: Vec<u64>,
}

fn build_query(account_id: u32, query: &MateStatsQuery) -> String {
    let mut info_filters = vec![];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        info_filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        info_filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {max_match_id}"));
    }
    if let Some(min_badge_level) = query.min_average_badge {
        info_filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
        info_filters.push(format!(
            "average_badge_team0 <= {max_badge_level} AND average_badge_team1 <= {max_badge_level}"
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        info_filters.push(format!("duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {max_duration_s}"));
    }
    let info_filters = if info_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", info_filters.join(" AND "))
    };

    if query.same_party {
        format!(
            r#"
            WITH players AS (SELECT DISTINCT match_id, team, party
                             FROM match_player
                             WHERE account_id = {account_id} AND party != 0 AND match_id IN (SELECT match_id FROM match_info WHERE TRUE {info_filters})),
                 mates AS (SELECT DISTINCT match_id, won, account_id
                           FROM match_player
                           WHERE (match_id, team, party) IN (SELECT match_id, team, party FROM players) AND account_id != {account_id})
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
            WITH players AS (SELECT DISTINCT match_id, team
                             FROM match_player
                             WHERE account_id = {account_id} AND match_id IN (SELECT match_id FROM match_info WHERE TRUE {info_filters})),
                 mates AS (SELECT DISTINCT match_id, won, account_id
                           FROM match_player
                           WHERE (match_id, team) IN (SELECT match_id, team FROM players) AND account_id != {account_id})
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
    let query = build_query(account_id, &query);
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
pub(super) async fn mate_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<MateStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_mate_stats(&state.ch_client, account_id, query)
        .await
        .map(Json)
}
