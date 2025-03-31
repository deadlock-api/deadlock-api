use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::parse::{default_last_month_timestamp, parse_steam_id_option};
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

#[derive(Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct HeroWinLossStatsQuery {
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
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    pub account_id: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroWinLossStats {
    pub hero_id: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
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

#[cached(
    ty = "TimedCache<String, Vec<HeroWinLossStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_hero_win_loss_stats(
    ch_client: &clickhouse::Client,
    query: HeroWinLossStatsQuery,
) -> APIResult<Vec<HeroWinLossStats>> {
    let mut info_filters = vec![];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        info_filters.push(format!("start_time >= {}", min_unix_timestamp));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {}", max_unix_timestamp));
    }
    if let Some(min_match_id) = query.min_match_id {
        info_filters.push(format!("match_id >= {}", min_match_id));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {}", max_match_id));
    }
    if let Some(min_badge_level) = query.min_average_badge {
        info_filters.push(format!(
            "average_badge_team0 >= {} AND average_badge_team1 >= {}",
            min_badge_level, min_badge_level
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
        info_filters.push(format!(
            "average_badge_team0 <= {} AND average_badge_team1 <= {}",
            max_badge_level, max_badge_level
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        info_filters.push(format!("duration_s >= {}", min_duration_s));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {}", max_duration_s));
    }
    let info_filters = if info_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", info_filters.join(" AND "))
    };
    let mut player_filters = vec![];
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("account_id = {}", account_id));
    }
    let player_filters = if player_filters.is_empty() {
        "".to_string()
    } else {
        format!(" PREWHERE {}", player_filters.join(" AND "))
    };
    let query = format!(
        r#"
    WITH t_matches AS (
        SELECT match_id
        FROM match_info
        WHERE match_outcome = 'TeamWin'
            AND match_mode IN ('Ranked', 'Unranked')
            AND game_mode = 'Normal'
            {}
        )
    SELECT
        hero_id,
        sum(won) AS wins,
        sum(not won) AS losses,
        wins + losses AS matches,
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
    {}
    WHERE match_id IN t_matches
    GROUP BY hero_id
    HAVING COUNT() > 1
    ORDER BY hero_id
    "#,
        info_filters, player_filters
    );
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch hero win loss stats: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch hero win loss stats: {}", e),
        }
    })
}

#[utoipa::path(
    get,
    path = "/hero-win-loss-stats",
    params(HeroWinLossStatsQuery),
    responses(
        (status = OK, description = "Hero Win Loss Stats", body = [HeroWinLossStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero win loss stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Win Loss Stats",
    description = "Retrieves overall win/loss and performance statistics for each hero based on historical match data."
)]
pub async fn hero_win_loss_stats(
    Query(query): Query<HeroWinLossStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_win_loss_stats(&state.clickhouse_client, query)
        .await
        .map(Json)
}
