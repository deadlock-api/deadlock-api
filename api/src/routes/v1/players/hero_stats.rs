use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::players::AccountIdQuery;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(super) struct HeroStatsQuery {
    /// Filter matches based on their start time (Unix timestamp).
    min_unix_timestamp: Option<u64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroStats {
    pub hero_id: u32,
    matches_played: u64,
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
    damage_mitigated_per_min: f64,
    damage_taken_per_min: f64,
    creeps_per_min: f64,
    obj_damage_per_min: f64,
    accuracy: f64,
    crit_shot_rate: f64,
    matches: Vec<u64>,
}

fn build_query(account_id: u32, query: &HeroStatsQuery) -> String {
    let mut filters = vec![];
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
    if let Some(min_badge_level) = query.min_average_badge {
        filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
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
    let filters = if filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", filters.join(" AND "))
    };
    let account_filter = format!("account_id = {account_id}");
    format!(
        r#"
    SELECT
        hero_id,
        COUNT() AS matches_played,
        sum(won) AS wins,
        avg(arrayMax(stats.level)) AS ending_level,
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
        60 * avg(arrayMax(stats.player_damage) / duration_s) AS damage_mitigated_per_min,
        60 * avg(arrayMax(stats.player_damage_taken) / duration_s) AS damage_taken_per_min,
        60 * avg(arrayMax(stats.creep_kills) / duration_s) AS creeps_per_min,
        60 * avg(arrayMax(stats.neutral_damage) / duration_s) AS obj_damage_per_min,
        avg(arrayMax(stats.shots_hit) / greatest(1, arrayMax(stats.shots_hit) + arrayMax(stats.shots_missed))) AS accuracy,
        avg(arrayMax(stats.hero_bullets_hit_crit) / greatest(1, arrayMax(stats.hero_bullets_hit_crit) + arrayMax(stats.hero_bullets_hit))) AS crit_shot_rate,
        groupUniqArray(mi.match_id) as matches
    FROM match_player mp FINAL
        INNER ANY JOIN match_info mi USING (match_id)
    PREWHERE {account_filter}
    WHERE match_mode IN ('Ranked', 'Unranked') {filters}
    GROUP BY hero_id
    ORDER BY hero_id
    "#
    )
}

#[cached(
    ty = "TimedCache<(u32, HeroStatsQuery), Vec<HeroStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ (account_id, query) }",
    sync_writes = "by_key",
    key = "(u32, HeroStatsQuery)"
)]
async fn get_hero_stats(
    ch_client: &clickhouse::Client,
    account_id: u32,
    query: HeroStatsQuery,
) -> APIResult<Vec<HeroStats>> {
    let query = build_query(account_id, &query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/{account_id}/hero-stats",
    params(AccountIdQuery, HeroStatsQuery),
    responses(
        (status = OK, description = "Hero Stats", body = [HeroStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero stats")
    ),
    tags = ["Players"],
    summary = "Hero Stats",
    description = "This endpoint returns statistics for each hero played by a given player account."
)]
pub(super) async fn hero_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<HeroStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_stats(&state.ch_client_ro, account_id, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_build_query_default() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("account_id = 12345"));
        assert!(sql.contains("SELECT"));
        assert!(sql.contains("hero_id"));
        assert!(sql.contains("COUNT() AS matches_played"));
        assert!(sql.contains("sum(won) AS wins"));
        assert!(sql.contains("FROM match_player mp FINAL"));
        assert!(sql.contains("INNER ANY JOIN match_info mi USING (match_id)"));
        assert!(sql.contains("PREWHERE account_id = 12345"));
        assert!(sql.contains("WHERE match_mode IN ('Ranked', 'Unranked')"));
        assert!(sql.contains("GROUP BY hero_id"));
        assert!(sql.contains("ORDER BY hero_id"));
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
            min_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_query_max_unix_timestamp() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            max_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_query_min_match_id() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            min_match_id: Some(10000),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_query_max_match_id() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            max_match_id: Some(1000000),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_query_min_average_badge() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            min_average_badge: Some(5),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("average_badge_team0 >= 5 AND average_badge_team1 >= 5"));
    }

    #[test]
    fn test_build_query_max_average_badge() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            max_average_badge: Some(100),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("average_badge_team0 <= 100 AND average_badge_team1 <= 100"));
    }

    #[test]
    fn test_build_query_combined_filters() {
        let account_id = 98765;
        let query = HeroStatsQuery {
            min_unix_timestamp: Some(1672531200),
            max_unix_timestamp: Some(1675209599),
            min_average_badge: Some(10),
            max_average_badge: Some(90),
            min_match_id: Some(5000),
            max_match_id: Some(500000),
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        assert!(sql.contains("account_id = 98765"));
        assert!(sql.contains("start_time >= 1672531200"));
        assert!(sql.contains("start_time <= 1675209599"));
        assert!(sql.contains("match_id >= 5000"));
        assert!(sql.contains("match_id <= 500000"));
        assert!(sql.contains("average_badge_team0 >= 10 AND average_badge_team1 >= 10"));
        assert!(sql.contains("average_badge_team0 <= 90 AND average_badge_team1 <= 90"));
    }

    #[test]
    fn test_build_query_statistical_fields() {
        let account_id = 12345;
        let query = HeroStatsQuery {
            ..Default::default()
        };
        let sql = build_query(account_id, &query);
        // Verify all statistical fields are included
        assert!(sql.contains("avg(arrayMax(stats.level)) AS ending_level"));
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
        assert!(sql.contains(
            "60 * avg(arrayMax(stats.player_damage) / duration_s) AS damage_mitigated_per_min"
        ));
        assert!(sql.contains(
            "60 * avg(arrayMax(stats.player_damage_taken) / duration_s) AS damage_taken_per_min"
        ));
        assert!(
            sql.contains("60 * avg(arrayMax(stats.creep_kills) / duration_s) AS creeps_per_min")
        );
        assert!(sql.contains(
            "60 * avg(arrayMax(stats.neutral_damage) / duration_s) AS obj_damage_per_min"
        ));
        assert!(sql.contains("avg(arrayMax(stats.shots_hit) / greatest(1, arrayMax(stats.shots_hit) + arrayMax(stats.shots_missed))) AS accuracy"));
        assert!(sql.contains("avg(arrayMax(stats.hero_bullets_hit_crit) / greatest(1, arrayMax(stats.hero_bullets_hit_crit) + arrayMax(stats.hero_bullets_hit))) AS crit_shot_rate"));
        assert!(sql.contains("groupUniqArray(mi.match_id) as matches"));
    }
}
