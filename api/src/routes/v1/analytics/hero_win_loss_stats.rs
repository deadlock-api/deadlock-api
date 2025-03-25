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
    #[serde(deserialize_with = "parse_steam_id_option")]
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
        format!(" AND {}", player_filters.join(" AND "))
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
        sum(assists) AS total_assists
    FROM match_player FINAL
    WHERE match_id IN t_matches {}
    GROUP BY hero_id
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
    description = r#"
Retrieves overall win/loss and performance statistics for each hero based on historical match data.

This endpoint analyzes completed matches. For each hero, it calculates their total wins, losses, matches played, kills, deaths, and assists across all matches.

Results are cached for **1 hour**. The cache key is determined by the specific combination of filter parameters used in the query. Subsequent requests using the exact same filters within this timeframe will receive the cached response.
    "#
)]
pub async fn hero_win_loss_stats(
    Query(query): Query<HeroWinLossStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_win_loss_stats(&state.clickhouse_client, query)
        .await
        .map(Json)
}
