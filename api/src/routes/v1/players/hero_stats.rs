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
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{comma_separated_deserialize, comma_separated_deserialize_option};
use crate::utils::types::AccountIdQuery;

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct HeroStatsQuery {
    /// Comma separated list of account ids, Account IDs are in `SteamID3` format.
    #[param(inline, min_items = 1, max_items = 1000)]
    #[serde(deserialize_with = "comma_separated_deserialize")]
    pub(crate) account_ids: Vec<u32>,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    hero_ids: Option<Vec<u32>>,
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

#[allow(clippy::too_many_lines)]
fn build_query(query: &HeroStatsQuery) -> String {
    let account_ids = query.account_ids.iter().map(ToString::to_string).join(",");
    let hero_ids_in = query
        .hero_ids
        .as_ref()
        .map(|heroes| heroes.iter().map(ToString::to_string).join(","));

    // Push time/mode/match_id filters into PMH: it's partitioned by them, so this prunes
    // partitions before touching match_player/match_info.
    let mut pmh_filters = vec![
        format!("account_id IN ({account_ids})"),
        MatchMode::sql_filter(None),
        GameMode::sql_filter(query.game_mode),
    ];
    if let Some(ref ids) = hero_ids_in {
        pmh_filters.push(format!("hero_id IN ({ids})"));
    }
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        pmh_filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        pmh_filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        pmh_filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        pmh_filters.push(format!("match_id <= {max_match_id}"));
    }
    let pmh_where = pmh_filters.join(" AND ");

    // account_id/hero_id/net_worth are columns in the `hero_stats_by_account` projection,
    // so ClickHouse can serve this read from the projection.
    let mut mp_filters = vec![
        "match_id IN t_histories".to_owned(),
        format!("account_id IN ({account_ids})"),
    ];
    if let Some(ref ids) = hero_ids_in {
        mp_filters.push(format!("hero_id IN ({ids})"));
    }
    if let Some(min_networth) = query.min_networth {
        mp_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        mp_filters.push(format!("net_worth <= {max_networth}"));
    }
    let mp_where = mp_filters.join(" AND ");

    let mut outer_filters: Vec<String> = vec![];
    if let Some(min_duration_s) = query.min_duration_s {
        outer_filters.push(format!("mi.duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        outer_filters.push(format!("mi.duration_s <= {max_duration_s}"));
    }
    if let Some(min_badge_level) = query.min_average_badge
        && min_badge_level > 11
    {
        outer_filters.push(format!(
            "mi.average_badge_team0 >= {min_badge_level} AND mi.average_badge_team1 >= \
             {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge
        && max_badge_level < 116
    {
        outer_filters.push(format!(
            "mi.average_badge_team0 <= {max_badge_level} AND mi.average_badge_team1 <= \
             {max_badge_level}"
        ));
    }
    let outer_where = if outer_filters.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", outer_filters.join(" AND "))
    };

    format!(
        "
    WITH
    t_histories AS (
        SELECT match_id FROM player_match_history WHERE {pmh_where}
    ),
    mi AS (
        SELECT match_id,
               any(duration_s) AS duration_s,
               any(start_time) AS start_time,
               any(average_badge_team0) AS average_badge_team0,
               any(average_badge_team1) AS average_badge_team1
        FROM match_info
        WHERE match_id IN t_histories
        GROUP BY match_id
    ),
    mp AS (
        SELECT account_id, match_id, hero_id, won, kills, deaths, assists, denies,
               net_worth, last_hits, max_level, max_player_damage, max_player_damage_taken,
               max_creep_kills, max_boss_damage, max_shots_hit, max_shots_missed,
               max_hero_bullets_hit, max_hero_bullets_hit_crit
        FROM match_player
        WHERE {mp_where}
        LIMIT 1 BY match_id, account_id
    )
    SELECT
        mp.account_id,
        mp.hero_id,
        COUNT() AS matches_played,
        max(mi.start_time) AS last_played,
        sum(mi.duration_s) AS time_played,
        countIf(won) AS wins,
        avg(max_level) AS ending_level,
        sum(mp.kills) AS kills,
        sum(mp.deaths) AS deaths,
        sum(mp.assists) AS assists,
        avg(denies) AS denies_per_match,
        60 * avg(mp.kills / mi.duration_s) AS kills_per_min,
        60 * avg(mp.deaths / mi.duration_s) AS deaths_per_min,
        60 * avg(mp.assists / mi.duration_s) AS assists_per_min,
        60 * avg(denies / mi.duration_s) AS denies_per_min,
        60 * avg(net_worth / mi.duration_s) AS networth_per_min,
        60 * avg(last_hits / mi.duration_s) AS last_hits_per_min,
        60 * avg(max_player_damage / mi.duration_s) AS damage_per_min,
        avg(max_player_damage / net_worth) AS damage_per_soul,
        60 * avg(max_player_damage / mi.duration_s) AS damage_mitigated_per_min,
        60 * avg(max_player_damage_taken / mi.duration_s) AS damage_taken_per_min,
        avg(max_player_damage_taken / net_worth) AS damage_taken_per_soul,
        60 * avg(max_creep_kills / mi.duration_s) AS creeps_per_min,
        60 * avg(max_boss_damage / mi.duration_s) AS obj_damage_per_min,
        avg(max_boss_damage / net_worth) AS obj_damage_per_soul,
        avg(max_shots_hit / greatest(1, max_shots_hit + max_shots_missed)) AS accuracy,
        avg(max_hero_bullets_hit_crit / greatest(1, max_hero_bullets_hit_crit + \
         max_hero_bullets_hit)) AS crit_shot_rate,
        groupUniqArray(mi.match_id) as matches
    FROM mp INNER JOIN mi USING (match_id)
    {outer_where}
    GROUP BY mp.account_id, mp.hero_id
    ORDER BY mp.account_id, mp.hero_id
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
    if query.account_ids.len() > 1000 {
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
    if query.game_mode.is_some_and(|g| g == GameMode::StreetBrawl)
        && (query.min_average_badge.is_some() || query.max_average_badge.is_some())
    {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Cannot filter by average badge for street brawl game mode".to_string(),
        });
    }
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
}

pub(crate) async fn hero_stats_single(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<HeroStatsQueryOld>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }
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
        ..Default::default()
    };
    get_hero_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod test {
    use tracing::warn;

    use super::*;

    #[test]
    fn test_build_query_default() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("account_id IN (12345)"));
        assert!(sql.contains("SELECT"));
        assert!(sql.contains("hero_id"));
        assert!(sql.contains("COUNT() AS matches_played"));
        assert!(sql.contains("max(mi.start_time) AS last_played"));
        assert!(sql.contains("sum(mi.duration_s) AS time_played"));
        assert!(sql.contains("countIf(won) AS wins"));
        assert!(sql.contains("FROM match_player"));
        assert!(!sql.contains("FINAL"));
        assert!(sql.contains("LIMIT 1 BY match_id, account_id"));
        assert!(sql.contains("FROM mp INNER JOIN mi USING (match_id)"));
        assert!(sql.contains("match_mode IN ('Ranked', 'Unranked')"));
        assert!(sql.contains("GROUP BY mp.account_id, mp.hero_id"));
        assert!(sql.contains("ORDER BY mp.account_id, mp.hero_id"));
        // Should not contain any filters
        assert!(!sql.contains("start_time >="));
        assert!(!sql.contains("start_time <="));
        assert!(!sql.contains("match_id >="));
        assert!(!sql.contains("match_id <="));
        assert!(!sql.contains("average_badge_team0 >="));
        assert!(!sql.contains("average_badge_team0 <="));
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
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
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
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
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
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
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
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
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
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("mi.average_badge_team0 >= 61 AND mi.average_badge_team1 >= 61"));
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
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("mi.average_badge_team0 <= 112 AND mi.average_badge_team1 <= 112"));
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
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("account_id IN (98765)"));
        assert!(sql.contains("start_time >= 1672531200"));
        assert!(sql.contains("start_time <= 1675209599"));
        assert!(sql.contains("match_id >= 5000"));
        assert!(sql.contains("match_id <= 500000"));
        assert!(sql.contains("mi.average_badge_team0 >= 61 AND mi.average_badge_team1 >= 61"));
        assert!(sql.contains("mi.average_badge_team0 <= 112 AND mi.average_badge_team1 <= 112"));
    }

    #[test]
    fn test_build_query_statistical_fields() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            account_ids: vec![account_id],
            ..Default::default()
        };
        let sql = build_query(&query);
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        // Verify all statistical fields are included
        assert!(sql.contains("avg(max_level) AS ending_level"));
        assert!(sql.contains("sum(mp.kills) AS kills"));
        assert!(sql.contains("sum(mp.deaths) AS deaths"));
        assert!(sql.contains("sum(mp.assists) AS assists"));
        assert!(sql.contains("avg(denies) AS denies_per_match"));
        assert!(sql.contains("60 * avg(mp.kills / mi.duration_s) AS kills_per_min"));
        assert!(sql.contains("60 * avg(mp.deaths / mi.duration_s) AS deaths_per_min"));
        assert!(sql.contains("60 * avg(mp.assists / mi.duration_s) AS assists_per_min"));
        assert!(sql.contains("60 * avg(denies / mi.duration_s) AS denies_per_min"));
        assert!(sql.contains("60 * avg(net_worth / mi.duration_s) AS networth_per_min"));
        assert!(sql.contains("60 * avg(last_hits / mi.duration_s) AS last_hits_per_min"));
        assert!(sql.contains("60 * avg(max_player_damage / mi.duration_s) AS damage_per_min"));
        assert!(sql.contains("avg(max_player_damage / net_worth) AS damage_per_soul"));
        assert!(
            sql.contains(
                "60 * avg(max_player_damage_taken / mi.duration_s) AS damage_taken_per_min"
            )
        );
        assert!(sql.contains("avg(max_player_damage_taken / net_worth) AS damage_taken_per_soul"));
        assert!(sql.contains("60 * avg(max_creep_kills / mi.duration_s) AS creeps_per_min"));
        assert!(sql.contains("60 * avg(max_boss_damage / mi.duration_s) AS obj_damage_per_min"));
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
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
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
        if let Err(e) =
            sqlparser::parser::Parser::parse_sql(&sqlparser::dialect::ClickHouseDialect {}, &sql)
        {
            warn!("Failed to parse SQL: {sql}: {e}");
        }
        assert!(sql.contains("net_worth <= 10000"));
    }
}
