use core::ops::AddAssign;
use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
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
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

#[allow(clippy::unnecessary_wraps)]
fn default_min_matches() -> Option<u32> {
    20.into()
}

#[allow(clippy::unnecessary_wraps)]
fn default_comb_size() -> Option<u8> {
    6.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Default)]
pub(crate) struct HeroCombStatsQuery {
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
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
    /// Comma separated list of hero ids to include. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    include_hero_ids: Option<Vec<u32>>,
    /// Comma separated list of hero ids to exclude. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    exclude_hero_ids: Option<Vec<u32>>,
    /// The minimum number of matches played for a hero combination to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
    /// The combination size to return.
    #[serde(default = "default_comb_size")]
    #[param(minimum = 2, maximum = 6, default = 6)]
    comb_size: Option<u8>,
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
pub struct HeroCombStats {
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_ids: Vec<u32>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
}

impl AddAssign for HeroCombStats {
    fn add_assign(&mut self, rhs: Self) {
        self.wins += rhs.wins;
        self.losses += rhs.losses;
        self.matches += rhs.matches;
    }
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &HeroCombStatsQuery) -> String {
    let team_size = if query.game_mode == Some(GameMode::StreetBrawl) {
        4
    } else {
        6
    };
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
    let mut player_filters = vec![];
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("net_worth <= {max_networth}"));
    }
    let player_filters = if player_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    let mut grouped_filters = vec![];
    #[allow(deprecated)]
    if let Some(account_id) = query.account_id {
        grouped_filters.push(format!("has(account_ids, {account_id})"));
    }
    if let Some(account_ids) = &query.account_ids {
        grouped_filters.push(format!(
            "hasAny(account_ids, [{}])",
            account_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    if let Some(include_hero_ids) = &query.include_hero_ids {
        grouped_filters.push(format!(
            "hasAll(hero_ids, [{}])",
            include_hero_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    if let Some(exclude_hero_ids) = &query.exclude_hero_ids {
        grouped_filters.push(format!(
            "not hasAny(hero_ids, [{}])",
            exclude_hero_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    let grouped_filters = if grouped_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", grouped_filters.join(" AND "))
    };
    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!(
            "({} < 6 OR matches >= {min_matches})",
            query.comb_size.unwrap_or(6)
        ));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    format!(
        "
WITH hero_combinations AS (
    SELECT
        arraySort(groupUniqArray({team_size})(hero_id)) AS hero_ids,
        groupArray(account_id) AS account_ids,
        any(won) AS won
    FROM match_player
    INNER JOIN match_info mi USING (match_id)
    WHERE mi.match_mode IN ('Ranked', 'Unranked') AND mi.{game_mode_filter} {player_filters} {info_filters}
    GROUP BY match_id, team
    HAVING length(hero_ids) = {team_size}
)
SELECT
    hero_ids,
    sum(won) AS wins,
    sum(not won) AS losses,
    wins + losses AS matches
FROM hero_combinations
WHERE true {grouped_filters}
GROUP BY hero_ids
{having_clause}
ORDER BY wins / greatest(1, matches) DESC
    "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<HeroCombStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<HeroCombStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_comb_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroCombStatsQuery,
) -> APIResult<Vec<HeroCombStats>> {
    query.min_unix_timestamp = query.min_unix_timestamp.map(|v| v - v % 3600);
    query.max_unix_timestamp = query.max_unix_timestamp.map(|v| v + 3600 - v % 3600);
    let ch_query = build_query(&query);
    debug!(?ch_query);
    let comb_stats: Vec<HeroCombStats> = run_query(ch_client, &ch_query).await?;
    let comb_size = match query.comb_size {
        Some(6) | None => return Ok(comb_stats),
        Some(x) if !(2..=6).contains(&x) => {
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                "Combination size must be between 2 and 6".to_owned(),
            ));
        }
        Some(x) => x,
    };
    let mut comb_stats_agg = HashMap::new();
    for comb_stat in &comb_stats {
        for comb_hero_ids in comb_stat.hero_ids.iter().combinations(comb_size as usize) {
            *comb_stats_agg
                .entry(comb_hero_ids.clone())
                .or_insert_with(|| HeroCombStats {
                    hero_ids: comb_hero_ids.into_iter().copied().collect_vec(),
                    wins: 0,
                    losses: 0,
                    matches: 0,
                }) += comb_stat.clone();
        }
    }
    Ok(comb_stats_agg
        .into_values()
        .filter(|c| {
            c.matches
                >= u64::from(
                    query
                        .min_matches
                        .or(default_min_matches())
                        .unwrap_or_default(),
                )
                && c.matches <= u64::from(query.max_matches.unwrap_or(u32::MAX))
        })
        .sorted_by_key(|c| c.wins / c.matches)
        .rev()
        .collect())
}

#[utoipa::path(
    get,
    path = "/hero-comb-stats",
    params(HeroCombStatsQuery),
    responses(
        (status = OK, description = "Hero Comb Stats", body = [HeroCombStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero comb stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Comb Stats",
    description = "
Retrieves overall statistics for each hero combination.

Results are cached for **1 hour**. The cache key is determined by the specific combination of filter parameters used in the query. Subsequent requests using the exact same filters within this timeframe will receive the cached response.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn hero_comb_stats(
    Query(mut query): Query<HeroCombStatsQuery>,
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
    get_comb_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_query_min_unix_timestamp() {
        let min_unix_timestamp = Some(1672531200);
        let comb_query = HeroCombStatsQuery {
            min_unix_timestamp,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_query_max_unix_timestamp() {
        let max_unix_timestamp = Some(1675209599);
        let comb_query = HeroCombStatsQuery {
            max_unix_timestamp,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_min_duration_s() {
        let min_duration_s = Some(600);
        let comb_query = HeroCombStatsQuery {
            min_duration_s,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("duration_s >= 600"));
    }

    #[test]
    fn test_build_query_max_duration_s() {
        let max_duration_s = Some(1800);
        let comb_query = HeroCombStatsQuery {
            max_duration_s,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_query_min_networth() {
        let min_networth = Some(1000);
        let comb_query = HeroCombStatsQuery {
            min_networth,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("net_worth >= 1000"));
    }

    #[test]
    fn test_build_query_max_networth() {
        let max_networth = Some(10000);
        let comb_query = HeroCombStatsQuery {
            max_networth,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("net_worth <= 10000"));
    }

    #[test]
    fn test_build_query_min_average_badge() {
        let min_average_badge = Some(61);
        let comb_query = HeroCombStatsQuery {
            min_average_badge,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
    }

    #[test]
    fn test_build_query_max_average_badge() {
        let max_average_badge = Some(112);
        let comb_query = HeroCombStatsQuery {
            max_average_badge,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
    }

    #[test]
    fn test_build_query_min_match_id() {
        let min_match_id = Some(10000);
        let comb_query = HeroCombStatsQuery {
            min_match_id,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_query_max_match_id() {
        let max_match_id = Some(1000000);
        let comb_query = HeroCombStatsQuery {
            max_match_id,
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_query_account_id() {
        let comb_query = HeroCombStatsQuery {
            account_ids: Some(vec![18373975]),
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("hasAny(account_ids, [18373975])"));
    }

    #[test]
    fn test_build_query_include_hero_ids() {
        let include_hero_ids = vec![1, 2, 3];
        let comb_query = HeroCombStatsQuery {
            include_hero_ids: include_hero_ids.clone().into(),
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains(&format!(
            "hasAll(hero_ids, [{}])",
            include_hero_ids.iter().map(ToString::to_string).join(", ")
        )));
    }

    #[test]
    fn test_build_query_exclude_hero_ids() {
        let exclude_hero_ids = vec![1, 2, 3];
        let comb_query = HeroCombStatsQuery {
            exclude_hero_ids: exclude_hero_ids.clone().into(),
            ..Default::default()
        };
        let sql = build_query(&comb_query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            panic!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains(&format!(
            "not hasAny(hero_ids, [{}])",
            exclude_hero_ids.iter().map(ToString::to_string).join(", ")
        )));
    }
}
