use crate::error::{APIError, APIResult};
use crate::routes::v1::analytics::scoreboard_types::ScoreboardQuerySortBy;
use crate::state::AppState;
use crate::utils::types::SortDirectionDesc;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

fn default_limit() -> Option<u32> {
    100.into()
}

fn default_min_matches() -> Option<u32> {
    10.into()
}

#[derive(Copy, Eq, Hash, PartialEq, Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct PlayerScoreboardQuery {
    /// Filter matches based on the hero ID.
    pub hero_id: Option<u32>,
    /// The minimum number of matches played for a player to be included in the scoreboard.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 10)]
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
    /// The field to sort by.
    #[param(inline)]
    pub sort_by: ScoreboardQuerySortBy,
    /// The direction to sort players in.
    #[serde(default)]
    #[param(inline)]
    pub sort_direction: SortDirectionDesc,
    /// The offset to start fetching players from.
    pub start: Option<u32>,
    /// The maximum number of players to fetch.
    #[serde(default = "default_limit")]
    #[param(inline, default = "100", maximum = 10000, minimum = 1)]
    pub limit: Option<u32>,
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
    info_filters.push("match_outcome = 'TeamWin'".to_string());
    info_filters.push("match_mode IN ('Ranked', 'Unranked')".to_string());
    info_filters.push("game_mode = 'Normal'".to_string());
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        info_filters.push(format!("start_time >= {}", min_unix_timestamp));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {}", max_unix_timestamp));
    }
    if let Some(min_match_id) = query.min_match_id {
        info_filters.push(format!("match_id >= {}", min_match_id));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {}", max_match_id));
    }
    if let Some(min_badge_level) = query.min_average_badge {
        info_filters.push(format!(
            "average_badge_team0 >= {} AND average_badge_team1 >= {}",
            min_badge_level, min_badge_level
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
        info_filters.push(format!(
            "average_badge_team0 <= {} AND average_badge_team1 <= {}",
            max_badge_level, max_badge_level
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        info_filters.push(format!("duration_s >= {}", min_duration_s));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {}", max_duration_s));
    }
    let info_filters = if !info_filters.is_empty() {
        format!(" WHERE {} ", info_filters.join(" AND "))
    } else {
        "".to_owned()
    };
    let mut player_filters = vec![];
    if !info_filters.is_empty() {
        player_filters.push(format!(
            "match_id IN (SELECT match_id FROM match_info {}) ",
            info_filters
        ));
    }
    if let Some(hero_id) = query.hero_id {
        player_filters.push(format!("hero_id = {}", hero_id));
    }
    player_filters.push("account_id > 0".to_string());
    let player_filters = if !player_filters.is_empty() {
        format!(" WHERE {} ", player_filters.join(" AND "))
    } else {
        "".to_owned()
    };
    let mut player_having = vec![];
    if let Some(min_matches) = query.min_matches {
        player_having.push(format!("count(distinct match_id) >= {}", min_matches));
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
{}
GROUP BY account_id
{}
ORDER BY value {}
LIMIT {} OFFSET {}
    "#,
        query.start.unwrap_or_default() + 1,
        query.sort_by.get_select_clause(),
        player_filters,
        player_having,
        query.sort_direction,
        query.limit.unwrap_or_default(),
        query.start.unwrap_or_default() + 1,
    )
}

#[cached(
    ty = "TimedCache<PlayerScoreboardQuery, Vec<PlayerScoreboardEntry>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ query }",
    sync_writes = "by_key",
    key = "PlayerScoreboardQuery"
)]
async fn get_player_scoreboard(
    ch_client: &clickhouse::Client,
    query: PlayerScoreboardQuery,
) -> APIResult<Vec<PlayerScoreboardEntry>> {
    let query = build_player_scoreboard_query(&query);
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch scoreboard: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch scoreboard: {}", e),
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
    get_player_scoreboard(&state.ch_client, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;
    use rstest::rstest;

    #[rstest]
    fn test_build_player_scoreboard_query(
        #[values(None, Some(15))] hero_id: Option<u32>,
        #[values(None, Some(1672531200))] min_unix_timestamp: Option<u64>,
        #[values(None, Some(1675209599))] max_unix_timestamp: Option<u64>,
        #[values(None, Some(600))] min_duration_s: Option<u64>,
        #[values(None, Some(1800))] max_duration_s: Option<u64>,
        #[values(None, Some(1))] min_average_badge: Option<u8>,
        #[values(None, Some(116))] max_average_badge: Option<u8>,
        #[values(None, Some(10000))] min_match_id: Option<u64>,
        #[values(None, Some(1000000))] max_match_id: Option<u64>,
        #[values(ScoreboardQuerySortBy::Matches, ScoreboardQuerySortBy::Wins)]
        sort_by: ScoreboardQuerySortBy,
        #[values(SortDirectionDesc::Asc, SortDirectionDesc::Desc)]
        sort_direction: SortDirectionDesc,
        #[values(None, Some(10))] min_matches: Option<u32>,
        #[values(None, Some(5))] start: Option<u32>,
        #[values(None, Some(10))] limit: Option<u32>,
    ) {
        let query = PlayerScoreboardQuery {
            hero_id,
            min_unix_timestamp,
            max_unix_timestamp,
            min_duration_s,
            max_duration_s,
            min_average_badge,
            max_average_badge,
            min_match_id,
            max_match_id,
            sort_by,
            min_matches,
            sort_direction,
            start,
            limit,
        };
        let query = build_player_scoreboard_query(&query);

        if let Some(hero_id) = hero_id {
            assert!(query.contains(&format!("hero_id = {}", hero_id)));
        }
        if let Some(min_unix_timestamp) = min_unix_timestamp {
            assert!(query.contains(&format!("start_time >= {}", min_unix_timestamp)));
        }
        if let Some(max_unix_timestamp) = max_unix_timestamp {
            assert!(query.contains(&format!("start_time <= {}", max_unix_timestamp)));
        }
        if let Some(min_duration_s) = min_duration_s {
            assert!(query.contains(&format!("duration_s >= {}", min_duration_s)));
        }
        if let Some(max_duration_s) = max_duration_s {
            assert!(query.contains(&format!("duration_s <= {}", max_duration_s)));
        }
        if let Some(min_average_badge) = min_average_badge {
            assert!(query.contains(&format!(
                "average_badge_team0 >= {} AND average_badge_team1 >= {}",
                min_average_badge, min_average_badge
            )));
        }
        if let Some(max_average_badge) = max_average_badge {
            assert!(query.contains(&format!(
                "average_badge_team0 <= {} AND average_badge_team1 <= {}",
                max_average_badge, max_average_badge
            )));
        }
        if let Some(min_match_id) = min_match_id {
            assert!(query.contains(&format!("match_id >= {}", min_match_id)));
        }
        if let Some(max_match_id) = max_match_id {
            assert!(query.contains(&format!("match_id <= {}", max_match_id)));
        }
        if let Some(min_matches) = min_matches {
            assert!(query.contains(&format!("count(distinct match_id) >= {}", min_matches)));
        }
        assert!(query.contains(&format!("ORDER BY value {}", sort_direction)));
        assert!(query.contains(&format!(
            "toFloat64({}) as value",
            sort_by.get_select_clause()
        )));
        if let Some(start) = start {
            assert!(query.contains(&format!("OFFSET {}", start + 1)));
        }
        if let Some(limit) = limit {
            assert!(query.contains(&format!("LIMIT {}", limit)));
        }
    }
}
