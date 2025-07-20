use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::{default_last_month_timestamp, parse_steam_id_option};

fn default_min_matches() -> Option<u32> {
    10.into()
}

#[derive(Debug, Clone, Copy, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct AbilityOrderStatsQuery {
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_id: u32,
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
    /// Filter players based on their minimum number of ability upgrades over the whole match.
    #[param(minimum = 0, maximum = 16)]
    min_ability_upgrades: Option<u64>,
    /// Filter players based on their maximum number of ability upgrades over the whole match.
    #[param(minimum = 1, maximum = 16)]
    max_ability_upgrades: Option<u64>,
    /// Filter players based on their net worth.
    min_networth: Option<u64>,
    /// Filter players based on their net worth.
    max_networth: Option<u64>,
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
    /// The minimum number of matches played for an ability order to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    account_id: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct AnalyticsAbilityOrderStats {
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub abilities: Vec<u32>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &AbilityOrderStatsQuery) -> String {
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
        String::new()
    } else {
        format!(" AND {}", info_filters.join(" AND "))
    };
    let mut player_filters = vec![];
    player_filters.push(format!("hero_id = {}", query.hero_id));
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("account_id = {account_id}"));
    }
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("net_worth <= {max_networth}"));
    }
    if let Some(min_ability_upgrades) = query.min_ability_upgrades {
        player_filters.push(format!("length(abilities) >= {min_ability_upgrades}"));
    }
    if let Some(max_ability_upgrades) = query.max_ability_upgrades {
        player_filters.push(format!("length(abilities) <= {max_ability_upgrades}"));
    }
    let player_filters = if player_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    format!(
        "
    WITH t_matches AS (
            SELECT match_id, start_time
            FROM match_info
            WHERE match_mode IN ('Ranked', 'Unranked')
                {info_filters}
        ),
        ability_ids AS (SELECT id FROM items WHERE type = 'ability')
    SELECT
        arrayFilter(x -> x in ability_ids, items.item_id) as abilities,
        sum(won) AS wins,
        sum(not won) AS losses,
        wins + losses AS matches,
        count(DISTINCT account_id) AS players,
        sum(kills) AS total_kills,
        sum(deaths) AS total_deaths,
        sum(assists) AS total_assists
    FROM match_player FINAL
    INNER JOIN t_matches USING (match_id)
    WHERE TRUE {player_filters}
    GROUP BY abilities
    HAVING matches >= {}
    ORDER BY matches DESC
    ",
        query.min_matches.unwrap_or_default()
    )
}

#[cached(
    ty = "TimedCache<AbilityOrderStatsQuery, Vec<AnalyticsAbilityOrderStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ query }",
    sync_writes = "by_key",
    key = "AbilityOrderStatsQuery"
)]
async fn get_ability_order_stats(
    ch_client: &clickhouse::Client,
    query: AbilityOrderStatsQuery,
) -> APIResult<Vec<AnalyticsAbilityOrderStats>> {
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(ch_client.query(&query_str).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/ability-order-stats",
    params(AbilityOrderStatsQuery),
    responses(
        (status = OK, description = "Ability Order Stats", body = [AnalyticsAbilityOrderStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch ability order stats")
    ),
    tags = ["Analytics"],
    summary = "Ability Order Stats",
    description = "
Retrieves statistics for the ability order of a hero.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn ability_order_stats(
    Query(query): Query<AbilityOrderStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_ability_order_stats(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_query_min_unix_timestamp() {
        let query = AbilityOrderStatsQuery {
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_query_max_unix_timestamp() {
        let query = AbilityOrderStatsQuery {
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_min_duration_s() {
        let query = AbilityOrderStatsQuery {
            min_duration_s: Some(600),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("duration_s >= 600"));
    }

    #[test]
    fn test_build_query_max_duration_s() {
        let query = AbilityOrderStatsQuery {
            max_duration_s: Some(1800),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_query_min_networth() {
        let query = AbilityOrderStatsQuery {
            min_networth: Some(1000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("net_worth >= 1000"));
    }

    #[test]
    fn test_build_query_max_networth() {
        let query = AbilityOrderStatsQuery {
            max_networth: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("net_worth <= 10000"));
    }

    #[test]
    fn test_build_query_min_average_badge() {
        let query = AbilityOrderStatsQuery {
            min_average_badge: Some(1),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 >= 1 AND average_badge_team1 >= 1"));
    }

    #[test]
    fn test_build_query_max_average_badge() {
        let query = AbilityOrderStatsQuery {
            max_average_badge: Some(116),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 <= 116 AND average_badge_team1 <= 116"));
    }

    #[test]
    fn test_build_query_min_match_id() {
        let query = AbilityOrderStatsQuery {
            min_match_id: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_query_max_match_id() {
        let query = AbilityOrderStatsQuery {
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_query_account_id() {
        let query = AbilityOrderStatsQuery {
            account_id: Some(18373975),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("account_id = 18373975"));
    }

    #[test]
    fn test_build_query_min_ability_upgrades() {
        let query = AbilityOrderStatsQuery {
            min_ability_upgrades: Some(10),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("length(abilities) >= 10"));
    }

    #[test]
    fn test_build_query_max_ability_upgrades() {
        let query = AbilityOrderStatsQuery {
            max_ability_upgrades: Some(100),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("length(abilities) <= 100"));
    }
    #[test]
    fn test_build_query_min_matches() {
        let query = AbilityOrderStatsQuery {
            min_matches: Some(10),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("matches >= 10"));
    }
}
