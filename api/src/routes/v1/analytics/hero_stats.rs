use crate::error::APIResult;
use crate::state::AppState;
use crate::utils::parse::{default_last_month_timestamp, parse_steam_id_option};
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub struct HeroStatsQuery {
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
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
    /// Filter players based on the number of matches they have played with a specific hero.
    pub min_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero.
    pub max_hero_matches: Option<u64>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    pub account_id: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct AnalyticsHeroStats {
    pub hero_id: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    pub players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
    pub total_net_worth: u64,
    pub total_last_hits: u64,
    pub total_denies: u64,
    pub total_player_damage: u64,
    pub total_player_damage_taken: u64,
    pub total_boss_damage: u64,
    pub total_creep_damage: u64,
    pub total_neutral_damage: u64,
    pub total_max_health: u64,
    pub total_shots_hit: u64,
    pub total_shots_missed: u64,
}

fn build_hero_stats_query(query: &HeroStatsQuery) -> String {
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
    format!(
        r#"
    WITH t_matches AS (
            SELECT match_id
            FROM match_info
            WHERE match_mode IN ('Ranked', 'Unranked')
                {info_filters}
        )
        {}
    SELECT
        hero_id,
        sum(won) AS wins,
        sum(not won) AS losses,
        wins + losses AS matches,
        count(DISTINCT account_id) AS players,
        sum(kills) AS total_kills,
        sum(deaths) AS total_deaths,
        sum(assists) AS total_assists,
        sum(net_worth) AS total_net_worth,
        sum(last_hits) AS total_last_hits,
        sum(denies) AS total_denies,
        sum(arrayMax(stats.player_damage)) AS total_player_damage,
        sum(arrayMax(stats.player_damage_taken)) AS total_player_damage_taken,
        sum(arrayMax(stats.boss_damage)) AS total_boss_damage,
        sum(arrayMax(stats.creep_damage)) AS total_creep_damage,
        sum(arrayMax(stats.neutral_damage)) AS total_neutral_damage,
        sum(arrayMax(stats.max_health)) AS total_max_health,
        sum(arrayMax(stats.shots_hit)) AS total_shots_hit,
        sum(arrayMax(stats.shots_missed)) AS total_shots_missed
    FROM match_player FINAL
    WHERE match_id IN t_matches
        {player_filters}
        {}
    GROUP BY hero_id
    HAVING COUNT() > 1
    ORDER BY hero_id
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
        if query.min_hero_matches.or(query.max_hero_matches).is_some() {
            "AND (account_id, hero_id) IN t_players"
        } else {
            ""
        }
    )
}

#[cached(
    ty = "TimedCache<HeroStatsQuery, Vec<AnalyticsHeroStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ query }",
    sync_writes = "by_key",
    key = "HeroStatsQuery"
)]
pub async fn get_hero_stats(
    ch_client: &clickhouse::Client,
    query: HeroStatsQuery,
) -> APIResult<Vec<AnalyticsHeroStats>> {
    let query = build_hero_stats_query(&query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
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
    description = "Retrieves performance statistics for each hero based on historical match data."
)]
pub async fn hero_stats(
    Query(query): Query<HeroStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_stats(&state.ch_client, query).await.map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_hero_stats_query_min_unix_timestamp() {
        let query = HeroStatsQuery {
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_hero_stats_query(&query);
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_hero_stats_query_max_unix_timestamp() {
        let query = HeroStatsQuery {
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_hero_stats_query(&query);
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_hero_stats_query_min_duration_s() {
        let query = HeroStatsQuery {
            min_duration_s: Some(600),
            ..Default::default()
        };
        let sql = build_hero_stats_query(&query);
        assert!(sql.contains("duration_s >= 600"));
    }

    #[test]
    fn test_build_hero_stats_query_max_duration_s() {
        let query = HeroStatsQuery {
            max_duration_s: Some(1800),
            ..Default::default()
        };
        let sql = build_hero_stats_query(&query);
        assert!(sql.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_hero_stats_query_min_average_badge() {
        let query = HeroStatsQuery {
            min_average_badge: Some(1),
            ..Default::default()
        };
        let sql = build_hero_stats_query(&query);
        assert!(sql.contains("average_badge_team0 >= 1 AND average_badge_team1 >= 1"));
    }

    #[test]
    fn test_build_hero_stats_query_max_average_badge() {
        let query = HeroStatsQuery {
            max_average_badge: Some(116),
            ..Default::default()
        };
        let sql = build_hero_stats_query(&query);
        assert!(sql.contains("average_badge_team0 <= 116 AND average_badge_team1 <= 116"));
    }

    #[test]
    fn test_build_hero_stats_query_min_match_id() {
        let query = HeroStatsQuery {
            min_match_id: Some(10000),
            ..Default::default()
        };
        let sql = build_hero_stats_query(&query);
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_hero_stats_query_max_match_id() {
        let query = HeroStatsQuery {
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_hero_stats_query(&query);
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_hero_stats_query_account_id() {
        let query = HeroStatsQuery {
            account_id: Some(18373975),
            ..Default::default()
        };
        let sql = build_hero_stats_query(&query);
        assert!(sql.contains("account_id = 18373975"));
    }
}
