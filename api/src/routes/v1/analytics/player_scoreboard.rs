use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::analytics::scoreboard_types::ScoreboardQuerySortBy;
use crate::utils::parse::comma_separated_deserialize_option;
use crate::utils::types::SortDirectionDesc;

#[allow(clippy::unnecessary_wraps)]
fn default_limit() -> Option<u32> {
    100.into()
}

#[allow(clippy::unnecessary_wraps)]
fn default_min_matches() -> Option<u32> {
    20.into()
}

#[derive(Eq, Hash, PartialEq, Debug, Clone, Deserialize, IntoParams, Default)]
pub(crate) struct PlayerScoreboardQuery {
    /// The field to sort by.
    #[param(inline)]
    sort_by: ScoreboardQuerySortBy,
    /// The direction to sort players in.
    #[serde(default)]
    #[param(inline)]
    sort_direction: SortDirectionDesc,
    /// Filter matches based on the hero ID. See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: Option<u32>,
    /// The minimum number of matches played for a player to be included in the scoreboard.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
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
    /// Filter players based on their final net worth.
    min_networth: Option<u64>,
    /// Filter players based on their final net worth.
    max_networth: Option<u64>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// The offset to start fetching players from.
    start: Option<u32>,
    /// The maximum number of players to fetch.
    #[serde(default = "default_limit")]
    #[param(inline, default = "100", maximum = 10000, minimum = 1)]
    limit: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    account_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct Entry {
    /// tier = first digits, subtier = last digit, see more: <https://assets.deadlock-api.com/v2/ranks>
    rank: u64,
    account_id: u32,
    pub value: f64,
    pub matches: u64,
}

fn build_query(query: &PlayerScoreboardQuery) -> String {
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
        format!(" WHERE {} ", info_filters.join(" AND "))
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
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("net_worth <= {max_networth}"));
    }
    player_filters.push("account_id > 0".to_owned());
    if let Some(account_ids) = &query.account_ids {
        player_filters.push(format!(
            "has([{}], account_id)",
            account_ids.iter().map(|i| (*i).to_string()).join(", ")
        ));
    }
    let player_filters = if player_filters.is_empty() {
        String::new()
    } else {
        format!(" WHERE {} ", player_filters.join(" AND "))
    };
    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("uniq(match_id) >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("uniq(match_id) <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!(" HAVING {} ", having_filters.join(" AND "))
    };
    format!(
        "
SELECT rowNumberInAllBlocks() + {} as rank, account_id, toFloat64({}) as value, uniq(\
         match_id) as matches
FROM match_player
{player_filters}
GROUP BY account_id
{having_clause}
ORDER BY value {}
LIMIT {} OFFSET {}
    ",
        query.start.unwrap_or_default() + 1,
        query.sort_by.get_select_clause(),
        query.sort_direction,
        query.limit.unwrap_or_default(),
        query.start.unwrap_or_default() + 1,
    )
}

#[cached(
    ty = "TimedCache<String, Vec<Entry>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<Entry>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_player_scoreboard(
    ch_client: &clickhouse::Client,
    mut query: PlayerScoreboardQuery,
) -> APIResult<Vec<Entry>> {
    query.min_unix_timestamp = query.min_unix_timestamp.map(|v| v - v % 3600);
    query.max_unix_timestamp = query.max_unix_timestamp.map(|v| v + 3600 - v % 3600);
    let query = build_query(&query);
    debug!(?query);
    Ok(run_query(ch_client, &query).await?)
}

#[utoipa::path(
    get,
    path = "/players",
    params(PlayerScoreboardQuery),
    responses(
        (status = OK, description = "Player Scoreboard", body = [Entry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch player scoreboard")
    ),
    tags = ["Analytics"],
    summary = "Player Scoreboard",
    description = "
This endpoint returns the player scoreboard.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn player_scoreboard(
    Query(mut query): Query<PlayerScoreboardQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if let Some(account_ids) = query.account_ids {
        let protected_users = state
            .steam_client
            .get_protected_users(&state.pg_client)
            .await?;
        let filtered_account_ids = account_ids
            .into_iter()
            .filter(|id| !protected_users.contains(id))
            .collect::<Vec<_>>();
        if filtered_account_ids.is_empty() {
            return Err(APIError::protected_user());
        }
        query.account_ids = Some(filtered_account_ids);
    }
    get_player_scoreboard(&state.ch_client_ro, query)
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
        let query_str = build_query(&query);
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
        let query_str = build_query(&query);
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
        let query_str = build_query(&query);
        assert!(query_str.contains("duration_s >= 600"));
        assert!(query_str.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_player_scoreboard_query_badge_levels() {
        let min_average_badge = Some(61);
        let max_average_badge = Some(112);
        let query = PlayerScoreboardQuery {
            min_average_badge,
            max_average_badge,
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
        assert!(query_str.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
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
        let query_str = build_query(&query);
        assert!(query_str.contains("match_id >= 10000"));
        assert!(query_str.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_player_scoreboard_query_min_matches() {
        let query = PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Matches,
            min_matches: Some(10),
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains("uniq(match_id) >= 10"));
    }

    #[test]
    fn test_build_player_scoreboard_query_max_matches() {
        let query = PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Matches,
            max_matches: Some(100),
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains("uniq(match_id) <= 100"));
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
        let query_str = build_query(&query);
        assert!(query_str.contains("ORDER BY value desc"));
        assert!(query_str.contains(&format!(
            "toFloat64({}) as value",
            sort_by.get_select_clause()
        )));
        assert!(query_str.contains("OFFSET 6"));
        assert!(query_str.contains("LIMIT 10"));
    }

    #[test]
    fn test_build_player_scoreboard_query_min_networth() {
        let min_networth = Some(1000);
        let query = PlayerScoreboardQuery {
            min_networth,
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains("net_worth >= 1000"));
    }

    #[test]
    fn test_build_player_scoreboard_query_max_networth() {
        let max_networth = Some(10000);
        let query = PlayerScoreboardQuery {
            max_networth,
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains("net_worth <= 10000"));
    }
}
