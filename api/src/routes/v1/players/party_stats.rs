use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::players::AccountIdQuery;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(super) struct PartyStatsQuery {
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
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct PartyStats {
    pub party_size: u64,
    wins: u64,
    matches_played: u64,
    matches: Vec<u64>,
}

fn build_query(account_id: u32, query: &PartyStatsQuery) -> String {
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
    format!(
        r#"
    WITH players AS (SELECT DISTINCT match_id, team, party
                     FROM match_player
                     WHERE account_id = {account_id} AND match_id IN (SELECT match_id FROM match_info WHERE TRUE {info_filters})),
         parties AS (SELECT match_id, any(won) as won, groupUniqArray(account_id) as account_ids
                     FROM match_player
                     WHERE account_id = {account_id} or (match_id, team, party) IN (SELECT match_id, team, party FROM players WHERE party != 0)
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
    let query = build_query(account_id, &query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
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
pub(super) async fn party_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<PartyStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_party_stats(&state.ch_client, account_id, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_build_query_default() {
        let account_id = 12345;
        let query = PartyStatsQuery {
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("account_id = 12345"));
        assert!(sql.contains("WITH players AS"));
        assert!(sql.contains("SELECT length(account_ids) as party_size"));
        assert!(sql.contains("GROUP BY party_size"));
        assert!(sql.contains("ORDER BY party_size"));
        // Should not contain any filters
        assert!(!sql.contains("start_time >="));
        assert!(!sql.contains("start_time <="));
        assert!(!sql.contains("match_id >="));
        assert!(!sql.contains("match_id <="));
        assert!(!sql.contains("average_badge_team"));
    }

    #[test]
    fn test_build_query_min_unix_timestamp() {
        let account_id = 12345;
        let query = PartyStatsQuery {
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_query_max_unix_timestamp() {
        let account_id = 12345;
        let query = PartyStatsQuery {
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_min_match_id() {
        let account_id = 12345;
        let query = PartyStatsQuery {
            min_match_id: Some(10000),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_query_max_match_id() {
        let account_id = 12345;
        let query = PartyStatsQuery {
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_query_min_average_badge() {
        let account_id = 12345;
        let query = PartyStatsQuery {
            min_average_badge: Some(5),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("average_badge_team0 >= 5 AND average_badge_team1 >= 5"));
    }

    #[test]
    fn test_build_query_max_average_badge() {
        let account_id = 12345;
        let query = PartyStatsQuery {
            max_average_badge: Some(100),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("average_badge_team0 <= 100 AND average_badge_team1 <= 100"));
    }

    #[test]
    fn test_build_query_min_duration_s() {
        let account_id = 12345;
        let query = PartyStatsQuery {
            min_duration_s: Some(600),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("duration_s >= 600"));
    }

    #[test]
    fn test_build_query_max_duration_s() {
        let account_id = 12345;
        let query = PartyStatsQuery {
            max_duration_s: Some(1800),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_query_combined_filters() {
        let account_id = 98765;
        let query = PartyStatsQuery {
            min_unix_timestamp: Some(1672531200),
            max_unix_timestamp: Some(1675209599),
            min_average_badge: Some(10),
            max_average_badge: Some(90),
            min_match_id: Some(5000),
            max_match_id: Some(500000),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("account_id = 98765"));
        assert!(sql.contains("start_time >= 1672531200"));
        assert!(sql.contains("start_time <= 1675209599"));
        assert!(sql.contains("match_id >= 5000"));
        assert!(sql.contains("match_id <= 500000"));
        assert!(sql.contains("average_badge_team0 >= 10 AND average_badge_team1 >= 10"));
        assert!(sql.contains("average_badge_team0 <= 90 AND average_badge_team1 <= 90"));
    }
}
