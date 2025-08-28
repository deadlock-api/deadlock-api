use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::types::AccountIdQuery;

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(super) struct EnemyStatsQuery {
    /// Filter matches based on their start time (Unix timestamp).
    min_unix_timestamp: Option<i64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<i64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// Filter based on the number of matches played.
    #[serde(default)]
    min_matches_played: Option<u64>,
    /// Filter based on the number of matches played.
    #[serde(default)]
    max_matches_played: Option<u64>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct EnemyStats {
    pub enemy_id: u32,
    /// The amount of matches won against the enemy.
    wins: u64,
    matches_played: u64,
    matches: Vec<u64>,
}

fn build_query(account_id: u32, query: &EnemyStatsQuery) -> String {
    let mut info_filters = vec![];
    info_filters.push("match_mode IN ('Ranked', 'Unranked')".to_owned());
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
    if let Some(min_badge_level) = query.min_average_badge
        && min_badge_level > 11
    {
        info_filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge
        && max_badge_level < 116
    {
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
        String::new()
    } else {
        format!(" AND {}", info_filters.join(" AND "))
    };
    let mut having_filters = vec![];
    if let Some(min_matches_played) = query.min_matches_played {
        having_filters.push(format!("matches_played >= {min_matches_played}"));
    }
    if let Some(max_matches_played) = query.max_matches_played {
        having_filters.push(format!("matches_played <= {max_matches_played}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };
    format!(
        "
    WITH
        t_histories AS (SELECT match_id FROM player_match_history WHERE account_id = {account_id}),
        t_matches AS (SELECT match_id FROM match_info WHERE match_id IN t_histories {info_filters}),
        players AS (
            SELECT DISTINCT match_id, if(team = 'Team1', 'Team0', 'Team1') as enemy_team
            FROM match_player
            WHERE team IN ('Team0', 'Team1') AND match_id IN t_matches AND account_id = {account_id}
        ),
        enemies AS (
            SELECT DISTINCT match_id, won, account_id
            FROM match_player
            WHERE (match_id, team) IN (SELECT match_id, enemy_team FROM players)
        )
    SELECT
        account_id as enemy_id,
        sum(not won) as wins,
        count() as matches_played,
        groupUniqArray(match_id) as matches
    FROM enemies
    GROUP BY enemy_id
    {having_clause}
    ORDER BY matches_played DESC
    "
    )
}

async fn get_enemy_stats(
    ch_client: &clickhouse::Client,
    account_id: u32,
    query: EnemyStatsQuery,
) -> APIResult<Vec<EnemyStats>> {
    let query = build_query(account_id, &query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/{account_id}/enemy-stats",
    params(AccountIdQuery, EnemyStatsQuery),
    responses(
        (status = OK, description = "Enemy Stats", body = [EnemyStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch enemy stats")
    ),
    tags = ["Players"],
    summary = "Enemy Stats",
    description = "
This endpoint returns the enemy stats.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn enemy_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<EnemyStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_enemy_stats(&state.ch_client_ro, account_id, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_build_query_default() {
        let account_id = 12345;
        let query = EnemyStatsQuery {
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("account_id = 12345"));
        assert!(sql.contains("if(team = 'Team1', 'Team0', 'Team1') as enemy_team"));
        assert!(sql.contains("team IN ('Team0', 'Team1')"));
        assert!(sql.contains("account_id as enemy_id"));
        assert!(sql.contains("sum(not won) as wins"));
        assert!(sql.contains("count() as matches_played"));
        assert!(sql.contains("groupUniqArray(match_id) as matches"));
        assert!(sql.contains("GROUP BY enemy_id"));
        assert!(sql.contains("ORDER BY matches_played DESC"));
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
        let query = EnemyStatsQuery {
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_query_max_unix_timestamp() {
        let account_id = 12345;
        let query = EnemyStatsQuery {
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_min_match_id() {
        let account_id = 12345;
        let query = EnemyStatsQuery {
            min_match_id: Some(10000),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_query_max_match_id() {
        let account_id = 12345;
        let query = EnemyStatsQuery {
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_query_min_average_badge() {
        let account_id = 12345;
        let query = EnemyStatsQuery {
            min_average_badge: Some(61),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
    }

    #[test]
    fn test_build_query_max_average_badge() {
        let account_id = 12345;
        let query = EnemyStatsQuery {
            max_average_badge: Some(112),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
    }

    #[test]
    fn test_build_query_min_matches_played() {
        let account_id = 12345;
        let query = EnemyStatsQuery {
            min_matches_played: Some(5),
            max_matches_played: Some(100),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("matches_played >= 5"));
        assert!(sql.contains("matches_played <= 100"));
    }

    #[test]
    fn test_build_query_combined_filters() {
        let account_id = 98765;
        let query = EnemyStatsQuery {
            min_unix_timestamp: Some(1672531200),
            max_unix_timestamp: Some(1675209599),
            min_average_badge: Some(61),
            max_average_badge: Some(112),
            min_match_id: Some(5000),
            max_match_id: Some(500000),
            min_matches_played: Some(3),
            max_matches_played: Some(100),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("account_id = 98765"));
        assert!(sql.contains("start_time >= 1672531200"));
        assert!(sql.contains("start_time <= 1675209599"));
        assert!(sql.contains("match_id >= 5000"));
        assert!(sql.contains("match_id <= 500000"));
        assert!(sql.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
        assert!(sql.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
        assert!(sql.contains("matches_played >= 3"));
        assert!(sql.contains("matches_played <= 100"));
    }

    #[test]
    fn test_build_query_team_logic() {
        let account_id = 12345;
        let query = EnemyStatsQuery {
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        // Verify the team logic is correct - enemies are on the opposite team
        assert!(sql.contains("if(team = 'Team1', 'Team0', 'Team1') as enemy_team"));
        assert!(sql.contains("team IN ('Team0', 'Team1')"));
        assert!(sql.contains("(match_id, team) IN (SELECT match_id, enemy_team FROM players)"));
    }
}
