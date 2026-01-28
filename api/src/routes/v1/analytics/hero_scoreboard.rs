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
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};
use crate::utils::types::SortDirectionDesc;

#[derive(Eq, Hash, PartialEq, Debug, Clone, Deserialize, IntoParams, Default)]
pub(super) struct HeroScoreboardQuery {
    /// The field to sort by.
    #[param(inline)]
    sort_by: ScoreboardQuerySortBy,
    /// The direction to sort heroes in.
    #[serde(default)]
    #[param(inline)]
    sort_direction: SortDirectionDesc,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter by min number of matches played.
    min_matches: Option<u32>,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
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
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    account_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct Entry {
    /// tier = first digits, subtier = last digit, see more: <https://assets.deadlock-api.com/v2/ranks>
    rank: u64,
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: u32,
    pub value: f64,
    pub matches: u64,
}

fn build_query(query: &HeroScoreboardQuery) -> String {
    let mut info_filters = vec![];
    info_filters.push("match_mode IN ('Ranked', 'Unranked')".to_owned());
    info_filters.push(GameMode::sql_filter(query.game_mode));
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
    #[allow(deprecated)]
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("account_id = {account_id}"));
    }
    if let Some(account_ids) = &query.account_ids {
        player_filters.push(format!(
            "account_id IN ({})",
            account_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("net_worth <= {max_networth}"));
    }
    let player_filters = if player_filters.is_empty() {
        String::new()
    } else {
        format!(" WHERE {} ", player_filters.join(" AND "))
    };
    let mut player_having = vec![];
    if let Some(min_matches) = query.min_matches {
        player_having.push(format!("uniq(match_id) >= {min_matches}"));
    }
    let player_having = if player_having.is_empty() {
        String::new()
    } else {
        format!(" HAVING {} ", player_having.join(" AND "))
    };
    format!(
        "
SELECT rowNumberInAllBlocks() + 1 as rank, hero_id, toFloat64({}) as value, uniq(match_id) as matches
FROM match_player
{player_filters}
GROUP BY hero_id
{player_having}
ORDER BY value {}
    ",
        query.sort_by.get_select_clause(),
        query.sort_direction,
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

async fn get_hero_scoreboard(
    ch_client: &clickhouse::Client,
    mut query: HeroScoreboardQuery,
) -> APIResult<Vec<Entry>> {
    query.min_unix_timestamp = query.min_unix_timestamp.map(|v| v - v % 3600);
    query.max_unix_timestamp = query.max_unix_timestamp.map(|v| v + 3600 - v % 3600);
    let query = build_query(&query);
    debug!(?query);
    Ok(run_query(ch_client, &query).await?)
}

#[utoipa::path(
    get,
    path = "/heroes",
    params(HeroScoreboardQuery),
    responses(
        (status = OK, description = "Hero Scoreboard", body = [Entry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero scoreboard")
    ),
    tags = ["Analytics"],
    summary = "Hero Scoreboard",
    description = "
This endpoint returns the hero scoreboard.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn hero_scoreboard(
    Query(mut query): Query<HeroScoreboardQuery>,
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
    #[allow(deprecated)]
    if let Some(account_id) = query.account_id
        && state
            .steam_client
            .is_user_protected(&state.pg_client, account_id)
            .await?
    {
        return Err(APIError::protected_user());
    }
    get_hero_scoreboard(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]

    use super::*;

    #[test]
    fn test_build_hero_scoreboard_query_min_max_unix_timestamp() {
        let query = HeroScoreboardQuery {
            min_unix_timestamp: Some(1672531200),
            max_unix_timestamp: Some(1675209599),
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("start_time >= 1672531200"));
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_hero_scoreboard_query_min_max_duration() {
        let query = HeroScoreboardQuery {
            min_duration_s: Some(600),
            max_duration_s: Some(1800),
            sort_by: ScoreboardQuerySortBy::Wins,
            sort_direction: SortDirectionDesc::Desc,
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("duration_s >= 600"));
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_hero_scoreboard_query_min_networth() {
        let query = HeroScoreboardQuery {
            min_networth: Some(1000),
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("net_worth >= 1000"));
    }

    #[test]
    fn test_build_hero_scoreboard_query_max_networth() {
        let query = HeroScoreboardQuery {
            max_networth: Some(10000),
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("net_worth <= 10000"));
    }

    #[test]
    fn test_build_hero_scoreboard_query_min_max_average_badge() {
        let query = HeroScoreboardQuery {
            min_average_badge: Some(61),
            max_average_badge: Some(112),
            sort_by: ScoreboardQuerySortBy::Matches,
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
        assert!(sql.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
    }

    #[test]
    fn test_build_hero_scoreboard_query_min_max_match_id() {
        let query = HeroScoreboardQuery {
            min_match_id: Some(10000),
            max_match_id: Some(1000000),
            sort_by: ScoreboardQuerySortBy::Wins,
            sort_direction: SortDirectionDesc::Desc,
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("match_id >= 10000"));
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_hero_scoreboard_query_account_id_and_min_matches() {
        let query = HeroScoreboardQuery {
            account_ids: Some(vec![18373975]),
            sort_by: ScoreboardQuerySortBy::Matches,
            min_matches: Some(10),
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("account_id IN (18373975)"));
        assert!(sql.contains("uniq(match_id) >= 10"));
    }

    #[test]
    fn test_build_hero_scoreboard_query_order_and_select_clause() {
        let query = HeroScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Wins,
            sort_direction: SortDirectionDesc::Desc,
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("ORDER BY value desc"));
        assert!(sql.contains(&format!(
            "toFloat64({}) as value",
            ScoreboardQuerySortBy::Wins.get_select_clause()
        )));
    }
}
