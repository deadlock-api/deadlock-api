use crate::error::{APIError, APIResult};
use crate::routes::v1::analytics::scoreboard_types::ScoreboardQuerySortBy;
use crate::state::AppState;
use crate::utils::parse::comma_separated_num_deserialize_option;
use crate::utils::types::SortDirectionDesc;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

fn default_limit() -> Option<u32> {
    100.into()
}

fn default_min_matches() -> Option<u32> {
    20.into()
}

#[derive(Eq, Hash, PartialEq, Debug, Clone, Deserialize, IntoParams, Default)]
pub struct PlayerScoreboardQuery {
    /// The field to sort by.
    #[param(inline)]
    pub sort_by: ScoreboardQuerySortBy,
    /// The direction to sort players in.
    #[serde(default)]
    #[param(inline)]
    pub sort_direction: SortDirectionDesc,
    /// Filter matches based on the hero ID.
    pub hero_id: Option<u32>,
    /// The minimum number of matches played for a player to be included in the scoreboard.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    pub min_matches: Option<u32>,
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
    /// The offset to start fetching players from.
    pub start: Option<u32>,
    /// The maximum number of players to fetch.
    #[serde(default = "default_limit")]
    #[param(inline, default = "100", maximum = 10000, minimum = 1)]
    pub limit: Option<u32>,
    /// Comma separated list of account ids to include
    #[serde(default, deserialize_with = "comma_separated_num_deserialize_option")]
    pub account_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct PlayerScoreboardEntry {
    pub rank: u64,
    pub account_id: u32,
    pub value: f64,
    pub matches: u64,
}

fn build_player_scoreboard_query(query: &PlayerScoreboardQuery) -> String {
    let mut info_filters = vec![];
    info_filters.push("match_mode IN ('Ranked', 'Unranked')".to_string());
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
    let info_filters = if !info_filters.is_empty() {
        format!(" WHERE {} ", info_filters.join(" AND "))
    } else {
        "".to_owned()
    };
    let mut player_filters = vec![];
    if !info_filters.is_empty() {
        player_filters.push(format!(
            "match_id IN (SELECT match_id FROM match_info {info_filters}) "
        ));
    }
    if let Some(hero_id) = query.hero_id {
        player_filters.push(format!("hero_id = {hero_id}"));
    }
    player_filters.push("account_id > 0".to_string());
    if let Some(account_ids) = &query.account_ids {
        player_filters.push(format!(
            "has([{}], account_id)",
            account_ids.iter().map(|i| (*i).to_string()).join(", ")
        ));
    }
    let player_filters = if !player_filters.is_empty() {
        format!(" WHERE {} ", player_filters.join(" AND "))
    } else {
        "".to_owned()
    };
    let mut player_having = vec![];
    if let Some(min_matches) = query.min_matches {
        player_having.push(format!("count(distinct match_id) >= {min_matches}"));
    }
    let player_having = if !player_having.is_empty() {
        format!(" HAVING {} ", player_having.join(" AND "))
    } else {
        "".to_owned()
    };
    format!(
        r#"
SELECT rowNumberInAllBlocks() + {} as rank, account_id, toFloat64({}) as value, count(distinct match_id) as matches
FROM match_player
{player_filters}
GROUP BY account_id
{player_having}
ORDER BY value {}
LIMIT {} OFFSET {}
    "#,
        query.start.unwrap_or_default() + 1,
        query.sort_by.get_select_clause(),
        query.sort_direction,
        query.limit.unwrap_or_default(),
        query.start.unwrap_or_default() + 1,
    )
}

#[cached(
    ty = "TimedCache<String, Vec<PlayerScoreboardEntry>>",
    create = "{ TimedCache::with_lifespan(10 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_player_scoreboard(
    ch_client: &clickhouse::Client,
    query: &PlayerScoreboardQuery,
) -> APIResult<Vec<PlayerScoreboardEntry>> {
    let query = build_player_scoreboard_query(query);
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch scoreboard: {e}");
        APIError::InternalError {
            message: format!("Failed to fetch scoreboard: {e}"),
        }
    })
}

#[utoipa::path(
    get,
    path = "/players",
    params(PlayerScoreboardQuery),
    responses(
        (status = OK, description = "Player Scoreboard", body = [PlayerScoreboardEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch player scoreboard")
    ),
    tags = ["Analytics"],
    summary = "Player Scoreboard",
    description = "This endpoint returns the player scoreboard."
)]
pub async fn player_scoreboard(
    Query(query): Query<PlayerScoreboardQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_player_scoreboard(&state.ch_client, &query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_player_scoreboard_query_hero_id() {
        let hero_id = Some(15);
        let query = PlayerScoreboardQuery {
            hero_id,
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_player_scoreboard_query(&query);
        assert!(query_str.contains("hero_id = 15"));
    }

    #[test]
    fn test_build_player_scoreboard_query_unix_timestamps() {
        let min_unix_timestamp = Some(1672531200);
        let max_unix_timestamp = Some(1675209599);
        let query = PlayerScoreboardQuery {
            min_unix_timestamp,
            max_unix_timestamp,
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_player_scoreboard_query(&query);
        assert!(query_str.contains("start_time >= 1672531200"));
        assert!(query_str.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_player_scoreboard_query_duration() {
        let min_duration_s = Some(600);
        let max_duration_s = Some(1800);
        let query = PlayerScoreboardQuery {
            min_duration_s,
            max_duration_s,
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_player_scoreboard_query(&query);
        assert!(query_str.contains("duration_s >= 600"));
        assert!(query_str.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_player_scoreboard_query_badge_levels() {
        let min_average_badge = Some(1);
        let max_average_badge = Some(116);
        let query = PlayerScoreboardQuery {
            min_average_badge,
            max_average_badge,
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_player_scoreboard_query(&query);
        assert!(query_str.contains("average_badge_team0 >= 1 AND average_badge_team1 >= 1"));
        assert!(query_str.contains("average_badge_team0 <= 116 AND average_badge_team1 <= 116"));
    }

    #[test]
    fn test_build_player_scoreboard_query_match_ids() {
        let min_match_id = Some(10000);
        let max_match_id = Some(1000000);
        let query = PlayerScoreboardQuery {
            min_match_id,
            max_match_id,
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_player_scoreboard_query(&query);
        assert!(query_str.contains("match_id >= 10000"));
        assert!(query_str.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_player_scoreboard_query_min_matches() {
        let min_matches = Some(10);
        let query = PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Matches,
            min_matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_player_scoreboard_query(&query);
        assert!(query_str.contains("count(distinct match_id) >= 10"));
    }

    #[test]
    fn test_build_player_scoreboard_query_order_and_limit_offset() {
        let sort_by = ScoreboardQuerySortBy::Wins;
        let sort_direction = SortDirectionDesc::Desc;
        let start = Some(5);
        let limit = Some(10);
        let query = PlayerScoreboardQuery {
            sort_by,
            sort_direction,
            start,
            limit,
            ..Default::default()
        };
        let query_str = build_player_scoreboard_query(&query);
        assert!(query_str.contains("ORDER BY value desc"));
        assert!(query_str.contains(&format!(
            "toFloat64({}) as value",
            sort_by.get_select_clause()
        )));
        assert!(query_str.contains("OFFSET 6"));
        assert!(query_str.contains("LIMIT 10"));
    }
}
