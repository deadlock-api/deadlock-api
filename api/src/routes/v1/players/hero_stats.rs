use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::parse::comma_separated_deserialize;
use crate::utils::types::AccountIdQuery;

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct HeroStatsQuery {
    /// Comma separated list of account ids, Account IDs are in `SteamID3` format.
    #[param(inline, min_items = 1, max_items = 100)]
    #[serde(deserialize_with = "comma_separated_deserialize")]
    pub(crate) account_ids: Vec<u32>,
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
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroStats {
    account_id: u32,
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_id: u32,
    matches_played: u64,
    last_played: u32,
    time_played: u64,
    wins: u64,
    ending_level: f64,
    kills: u64,
    deaths: u64,
    assists: u64,
    denies_per_match: f64,
    kills_per_min: f64,
    deaths_per_min: f64,
    assists_per_min: f64,
    denies_per_min: f64,
    networth_per_min: f64,
    last_hits_per_min: f64,
    damage_per_min: f64,
    damage_per_soul: f64,
    #[deprecated(
        note = "This field is deprecated and will be removed in the future. Use `damage_per_min` \
                instead."
    )]
    damage_mitigated_per_min: f64,
    damage_taken_per_min: f64,
    damage_taken_per_soul: f64,
    creeps_per_min: f64,
    obj_damage_per_min: f64,
    obj_damage_per_soul: f64,
    accuracy: f64,
    crit_shot_rate: f64,
    matches: Vec<u64>,
}

fn build_query(query: &HeroStatsQuery) -> String {
    let mut filters = vec![];
    filters.push("match_mode IN ('Ranked', 'Unranked')".to_owned());
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
    if let Some(min_badge_level) = query.min_average_badge
        && min_badge_level > 11
    {
        filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge
        && max_badge_level < 116
    {
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
    if let Some(min_networth) = query.min_networth {
        filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        filters.push(format!("net_worth <= {max_networth}"));
    }
    let filters = if filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", filters.join(" AND "))
    };
    let account_ids_filter = format!(
        "account_id IN ({})",
        query.account_ids.iter().map(ToString::to_string).join(",")
    );
    format!(
        "
    WITH t_histories AS (SELECT match_id FROM player_match_history WHERE {account_ids_filter})
    SELECT
        account_id,
        hero_id,
        COUNT() AS matches_played,
        max(start_time) AS last_played,
        sum(duration_s) AS time_played,
        sum(won) AS wins,
        avg(max_level) AS ending_level,
        sum(kills) AS kills,
        sum(deaths) AS deaths,
        sum(assists) AS assists,
        avg(denies) AS denies_per_match,
        60 * avg(mp.kills / duration_s) AS kills_per_min,
        60 * avg(mp.deaths / duration_s) AS deaths_per_min,
        60 * avg(mp.assists / duration_s) AS assists_per_min,
        60 * avg(denies / duration_s) AS denies_per_min,
        60 * avg(net_worth / duration_s) AS networth_per_min,
        60 * avg(last_hits / duration_s) AS last_hits_per_min,
        60 * avg(max_player_damage / duration_s) AS damage_per_min,
        avg(max_player_damage / net_worth) AS damage_per_soul,
        60 * avg(max_player_damage / duration_s) AS damage_mitigated_per_min,
        60 * avg(max_player_damage_taken / duration_s) AS damage_taken_per_min,
        avg(max_player_damage_taken / net_worth) AS damage_taken_per_soul,
        60 * avg(max_creep_kills / duration_s) AS creeps_per_min,
        60 * avg(max_boss_damage / duration_s) AS obj_damage_per_min,
        avg(max_boss_damage / net_worth) AS obj_damage_per_soul,
        avg(max_shots_hit / greatest(1, max_shots_hit + max_shots_missed)) AS accuracy,
        avg(max_hero_bullets_hit_crit / greatest(1, max_hero_bullets_hit_crit + \
         max_hero_bullets_hit)) AS crit_shot_rate,
        groupUniqArray(mi.match_id) as matches
    FROM match_player mp FINAL
        INNER JOIN match_info mi USING (match_id)
    WHERE match_id IN t_histories AND {account_ids_filter} {filters}
    GROUP BY account_id, hero_id
    ORDER BY account_id, hero_id
    "
    )
}

async fn get_hero_stats(
    ch_client: &clickhouse::Client,
    query: HeroStatsQuery,
) -> APIResult<Vec<HeroStats>> {
    if query.account_ids.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "No account IDs provided.",
        ));
    }
    if query.account_ids.len() > 100 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Too many account IDs provided.",
        ));
    }
    let query = build_query(&query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/hero-stats",
    params(HeroStatsQuery),
    responses(
        (status = OK, description = "Hero Stats", body = [HeroStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero stats")
    ),
    tags = ["Players"],
    summary = "Hero Stats",
    description = "
This endpoint returns statistics for each hero played by a given player account.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn player_hero_stats(
    Query(query): Query<HeroStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_stats(&state.ch_client_ro, query).await.map(Json)
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct HeroStatsQueryOld {
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
}
pub(crate) async fn hero_stats_single(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<HeroStatsQueryOld>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let query = HeroStatsQuery {
        account_ids: vec![account_id],
        min_unix_timestamp: query.min_unix_timestamp,
        max_unix_timestamp: query.max_unix_timestamp,
        min_duration_s: query.min_duration_s,
        max_duration_s: query.max_duration_s,
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        min_average_badge: query.min_average_badge,
        max_average_badge: query.max_average_badge,
        min_match_id: query.min_match_id,
        max_match_id: query.max_match_id,
    };
    get_hero_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_build_query_default() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("account_id IN (12345)"));
        assert!(sql.contains("SELECT"));
        assert!(sql.contains("hero_id"));
        assert!(sql.contains("COUNT() AS matches_played"));
        assert!(sql.contains("max(start_time) AS last_played"));
        assert!(sql.contains("sum(duration_s) AS time_played"));
        assert!(sql.contains("sum(won) AS wins"));
        assert!(sql.contains("FROM match_player mp FINAL"));
        assert!(sql.contains("INNER JOIN match_info mi USING (match_id)"));
        assert!(sql.contains("match_mode IN ('Ranked', 'Unranked')"));
        assert!(sql.contains("GROUP BY account_id, hero_id"));
        assert!(sql.contains("ORDER BY account_id, hero_id"));
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
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_query_max_unix_timestamp() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_min_match_id() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            min_match_id: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_query_max_match_id() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_query_min_average_badge() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            min_average_badge: Some(61),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
    }

    #[test]
    fn test_build_query_max_average_badge() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            max_average_badge: Some(112),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
    }

    #[test]
    fn test_build_query_combined_filters() {
        let account_id = 98765;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            min_unix_timestamp: Some(1672531200),
            max_unix_timestamp: Some(1675209599),
            min_average_badge: Some(61),
            max_average_badge: Some(112),
            min_match_id: Some(5000),
            max_match_id: Some(500000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("account_id IN (98765)"));
        assert!(sql.contains("start_time >= 1672531200"));
        assert!(sql.contains("start_time <= 1675209599"));
        assert!(sql.contains("match_id >= 5000"));
        assert!(sql.contains("match_id <= 500000"));
        assert!(sql.contains("average_badge_team0 >= 61 AND average_badge_team1 >= 61"));
        assert!(sql.contains("average_badge_team0 <= 112 AND average_badge_team1 <= 112"));
    }

    #[test]
    fn test_build_query_statistical_fields() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            ..Default::default()
        };
        let sql = build_query(&query);
        // Verify all statistical fields are included
        assert!(sql.contains("avg(max_level) AS ending_level"));
        assert!(sql.contains("sum(kills) AS kills"));
        assert!(sql.contains("sum(deaths) AS deaths"));
        assert!(sql.contains("sum(assists) AS assists"));
        assert!(sql.contains("avg(denies) AS denies_per_match"));
        assert!(sql.contains("60 * avg(mp.kills / duration_s) AS kills_per_min"));
        assert!(sql.contains("60 * avg(mp.deaths / duration_s) AS deaths_per_min"));
        assert!(sql.contains("60 * avg(mp.assists / duration_s) AS assists_per_min"));
        assert!(sql.contains("60 * avg(denies / duration_s) AS denies_per_min"));
        assert!(sql.contains("60 * avg(net_worth / duration_s) AS networth_per_min"));
        assert!(sql.contains("60 * avg(last_hits / duration_s) AS last_hits_per_min"));
        assert!(sql.contains("60 * avg(max_player_damage / duration_s) AS damage_per_min"));
        assert!(sql.contains("avg(max_player_damage / net_worth) AS damage_per_soul"));
        assert!(
            sql.contains("60 * avg(max_player_damage_taken / duration_s) AS damage_taken_per_min")
        );
        assert!(sql.contains("avg(max_player_damage_taken / net_worth) AS damage_taken_per_soul"));
        assert!(sql.contains("60 * avg(max_creep_kills / duration_s) AS creeps_per_min"));
        assert!(sql.contains("60 * avg(max_boss_damage / duration_s) AS obj_damage_per_min"));
        assert!(sql.contains("avg(max_boss_damage / net_worth) AS obj_damage_per_soul"));
        assert!(sql.contains(
            "avg(max_shots_hit / greatest(1, max_shots_hit + max_shots_missed)) AS accuracy"
        ));
        assert!(sql.contains(
            "avg(max_hero_bullets_hit_crit / greatest(1, max_hero_bullets_hit_crit + \
             max_hero_bullets_hit)) AS crit_shot_rate"
        ));
        assert!(sql.contains("groupUniqArray(mi.match_id) as matches"));
    }

    #[test]
    fn test_build_query_min_networth() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            min_networth: Some(1000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("net_worth >= 1000"));
    }

    #[test]
    fn test_build_query_max_networth() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            max_networth: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("net_worth <= 10000"));
    }
}
