use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::{
    comma_separated_num_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use strum_macros::Display;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum BucketQuery {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket Item Stats By Start Time (Hour)
    StartTimeHour,
    /// Bucket Item Stats By Start Time (Day)
    StartTimeDay,
    /// Bucket Item Stats By Start Time (Week)
    StartTimeWeek,
    /// Bucket Item Stats By Start Time (Month)
    StartTimeMonth,
}

impl BucketQuery {
    pub(super) fn get_select_clause(&self) -> String {
        match self {
            Self::NoBucket => "NULL".to_string(),
            Self::StartTimeHour => "toNullable(toStartOfHour(start_time))".to_string(),
            Self::StartTimeDay => "toNullable(toStartOfDay(start_time))".to_string(),
            Self::StartTimeWeek => "toNullable(toDateTime(toStartOfWeek(start_time)))".to_string(),
            Self::StartTimeMonth => {
                "toNullable(toDateTime(toStartOfMonth(start_time)))".to_string()
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct HeroStatsQuery {
    /// Bucket the stats.
    #[serde(default)]
    #[param(inline)]
    bucket: BucketQuery,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    min_unix_timestamp: Option<u64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<u64>,
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
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: https://assets.deadlock-api.com/v2/ranks
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: https://assets.deadlock-api.com/v2/ranks
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero.
    min_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero.
    max_hero_matches: Option<u64>,
    /// Comma separated list of item ids to include (only heroes who have purchased these items). See more: https://assets.deadlock-api.com/v2/items
    #[serde(default, deserialize_with = "comma_separated_num_deserialize_option")]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only heroes who have not purchased these items). See more: https://assets.deadlock-api.com/v2/items
    #[serde(default, deserialize_with = "comma_separated_num_deserialize_option")]
    exclude_item_ids: Option<Vec<u32>>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    account_id: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct AnalyticsHeroStats {
    /// See more: https://assets.deadlock-api.com/v2/heroes
    pub hero_id: u32,
    pub bucket: Option<u32>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    pub matches_per_bucket: u64,
    players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
    total_net_worth: u64,
    total_last_hits: u64,
    total_denies: u64,
    total_player_damage: u64,
    total_player_damage_taken: u64,
    total_boss_damage: u64,
    total_creep_damage: u64,
    total_neutral_damage: u64,
    total_max_health: u64,
    total_shots_hit: u64,
    total_shots_missed: u64,
}

fn build_query(query: &HeroStatsQuery) -> String {
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
    let mut player_filters = vec![];
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("account_id = {account_id}"));
    }
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("net_worth <= {max_networth}"));
    }
    if let Some(include_item_ids) = &query.include_item_ids {
        player_filters.push(format!(
            "hasAll(items, [{}])",
            include_item_ids.iter().map(|id| id.to_string()).join(", ")
        ));
    }
    if let Some(exclude_item_ids) = &query.exclude_item_ids {
        player_filters.push(format!(
            "not hasAny(items, [{}])",
            exclude_item_ids.iter().map(|id| id.to_string()).join(", ")
        ));
    }
    let player_filters = if player_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    let mut player_hero_filters = vec![];
    if let Some(min_hero_matches) = query.min_hero_matches {
        player_hero_filters.push(format!("COUNT(DISTINCT match_id) >= {min_hero_matches}"));
    }
    if let Some(max_hero_matches) = query.max_hero_matches {
        player_hero_filters.push(format!("COUNT(DISTINCT match_id) <= {max_hero_matches}"));
    }
    let player_hero_filters = if player_hero_filters.is_empty() {
        "TRUE".to_string()
    } else {
        player_hero_filters.join(" AND ")
    };
    let bucket = query.bucket.get_select_clause();
    format!(
        r#"
    WITH t_matches AS (
            SELECT match_id, start_time
            FROM match_info
            WHERE match_mode IN ('Ranked', 'Unranked')
                {info_filters}
        ),
        t_matches_per_bucket AS (
            SELECT {bucket} AS bucket, count() AS matches_per_bucket
            FROM t_matches
            GROUP BY bucket
        )
        {}
    SELECT
        hero_id,
        {bucket} AS bucket,
        sum(won) AS wins,
        sum(not won) AS losses,
        wins + losses AS matches,
        any(m.matches_per_bucket) AS matches_per_bucket,
        count(DISTINCT account_id) AS players,
        sum(kills) AS total_kills,
        sum(deaths) AS total_deaths,
        sum(assists) AS total_assists,
        sum(net_worth) AS total_net_worth,
        sum(last_hits) AS total_last_hits,
        sum(denies) AS total_denies,
        sum(max_player_damage) AS total_player_damage,
        sum(max_player_damage_taken) AS total_player_damage_taken,
        sum(max_boss_damage) AS total_boss_damage,
        sum(max_creep_damage) AS total_creep_damage,
        sum(max_neutral_damage) AS total_neutral_damage,
        sum(max_max_health) AS total_max_health,
        sum(max_shots_hit) AS total_shots_hit,
        sum(max_shots_missed) AS total_shots_missed
    FROM match_player FINAL
    INNER JOIN t_matches USING (match_id)
    INNER JOIN t_matches_per_bucket m ON {}
    WHERE TRUE {player_filters}
        {}
    GROUP BY hero_id, bucket
    HAVING COUNT() > 1
    ORDER BY hero_id, bucket
    "#,
        if query.min_hero_matches.or(query.max_hero_matches).is_some() {
            format!(
                r#",
        t_players AS (
            SELECT account_id, hero_id
            FROM match_player
            WHERE match_id IN t_matches
                {player_filters}
            GROUP BY account_id, hero_id
            HAVING {player_hero_filters}
        )"#
            )
        } else {
            "".to_string()
        },
        match query.bucket {
            BucketQuery::NoBucket => "TRUE".to_string(),
            _ => format!("m.bucket = {bucket}"),
        },
        if query.min_hero_matches.or(query.max_hero_matches).is_some() {
            "AND (account_id, hero_id) IN t_players"
        } else {
            ""
        }
    )
}

#[cached(
    ty = "TimedCache<String, Vec<AnalyticsHeroStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_hero_stats(
    ch_client: &clickhouse::Client,
    query: HeroStatsQuery,
) -> APIResult<Vec<AnalyticsHeroStats>> {
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(ch_client.query(&query_str).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/hero-stats",
    params(HeroStatsQuery),
    responses(
        (status = OK, description = "Hero Stats", body = [AnalyticsHeroStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Stats",
    description = r#"
Retrieves performance statistics for each hero based on historical match data.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "#
)]
pub(crate) async fn hero_stats(
    Query(query): Query<HeroStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_query_min_unix_timestamp() {
        let query = HeroStatsQuery {
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_query_max_unix_timestamp() {
        let query = HeroStatsQuery {
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_min_duration_s() {
        let query = HeroStatsQuery {
            min_duration_s: Some(600),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("duration_s >= 600"));
    }

    #[test]
    fn test_build_query_max_duration_s() {
        let query = HeroStatsQuery {
            max_duration_s: Some(1800),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_query_min_networth() {
        let query = HeroStatsQuery {
            min_networth: Some(1000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("net_worth >= 1000"));
    }

    #[test]
    fn test_build_query_max_networth() {
        let query = HeroStatsQuery {
            max_networth: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("net_worth <= 10000"));
    }

    #[test]
    fn test_build_query_min_average_badge() {
        let query = HeroStatsQuery {
            min_average_badge: Some(1),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 >= 1 AND average_badge_team1 >= 1"));
    }

    #[test]
    fn test_build_query_max_average_badge() {
        let query = HeroStatsQuery {
            max_average_badge: Some(116),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("average_badge_team0 <= 116 AND average_badge_team1 <= 116"));
    }

    #[test]
    fn test_build_query_min_match_id() {
        let query = HeroStatsQuery {
            min_match_id: Some(10000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_query_max_match_id() {
        let query = HeroStatsQuery {
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_query_account_id() {
        let query = HeroStatsQuery {
            account_id: Some(18373975),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("account_id = 18373975"));
    }

    #[test]
    fn test_build_query_include_item_ids() {
        let query = HeroStatsQuery {
            include_item_ids: Some(vec![1, 2, 3]),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("hasAll(items, [1, 2, 3])"));
    }

    #[test]
    fn test_build_query_exclude_item_ids() {
        let query = HeroStatsQuery {
            exclude_item_ids: Some(vec![4, 5, 6]),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("not hasAny(items, [4, 5, 6])"));
    }

    #[test]
    fn test_build_query_include_and_exclude_item_ids() {
        let query = HeroStatsQuery {
            include_item_ids: Some(vec![1, 2, 3]),
            exclude_item_ids: Some(vec![4, 5, 6]),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("hasAll(items, [1, 2, 3])"));
        assert!(sql.contains("not hasAny(items, [4, 5, 6])"));
    }
}
