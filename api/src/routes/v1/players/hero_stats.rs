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

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub struct HeroStatsQuery {
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
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroStats {
    pub hero_id: u32,
    pub matches_played: u64,
    pub wins: u64,
    pub ending_level: f64,
    pub kills: u64,
    pub deaths: u64,
    pub assists: u64,
    pub denies_per_match: f64,
    pub kills_per_min: f64,
    pub deaths_per_min: f64,
    pub assists_per_min: f64,
    pub denies_per_min: f64,
    pub networth_per_min: f64,
    pub last_hits_per_min: f64,
    pub damage_mitigated_per_min: f64,
    pub damage_taken_per_min: f64,
    pub creeps_per_min: f64,
    pub obj_damage_per_min: f64,
    pub accuracy: f64,
    pub crit_shot_rate: f64,
    pub matches: Vec<u64>,
}

fn build_hero_stats_query(account_id: u32, query: &HeroStatsQuery) -> String {
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
    let query = build_hero_stats_query(account_id, &query);
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
pub async fn hero_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<HeroStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_stats(&state.ch_client, account_id, query)
        .await
        .map(Json)
}
