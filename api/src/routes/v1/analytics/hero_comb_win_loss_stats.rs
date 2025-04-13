use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::parse::{
    comma_separated_num_deserialize, default_last_month_timestamp, parse_steam_id_option,
};
use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

#[derive(Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct HeroCombWinLossStatsQuery {
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
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    pub account_id: Option<u32>,
    /// Comma separated list of hero ids to include
    #[serde(default, deserialize_with = "comma_separated_num_deserialize")]
    pub include_hero_ids: Option<Vec<u32>>,
    /// Comma separated list of hero ids to exclude
    #[serde(default, deserialize_with = "comma_separated_num_deserialize")]
    pub exclude_hero_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroCombWinLossStats {
    pub hero_ids: Vec<u32>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
}

#[cached(
    ty = "TimedCache<String, Vec<HeroCombWinLossStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
pub async fn get_comb_hero_win_loss_stats(
    ch_client: &clickhouse::Client,
    query: HeroCombWinLossStatsQuery,
) -> APIResult<Vec<HeroCombWinLossStats>> {
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
        player_filters.push(format!("has(account_ids, {})", account_id));
    }
    let player_filters = if player_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    let mut hero_filters = vec![];
    if let Some(include_hero_ids) = &query.include_hero_ids {
        hero_filters.push(format!(
            "hasAll(hero_ids, [{}])",
            include_hero_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    if let Some(exclude_hero_ids) = &query.exclude_hero_ids {
        hero_filters.push(format!(
            "not hasAny(hero_ids, [{}])",
            exclude_hero_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    let hero_filters = if hero_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", hero_filters.join(" AND "))
    };
    let query = format!(
        r#"
WITH hero_combinations AS (
    SELECT
        groupArraySorted(6)(hero_id) AS hero_ids,
        groupArray(account_id) AS account_ids,
        any(won) AS won
    FROM match_player FINAL
    INNER JOIN match_info mi USING (match_id)
    WHERE mi.match_outcome = 'TeamWin'
      AND mi.match_mode IN ('Ranked', 'Unranked')
      AND mi.game_mode = 'Normal' {}
    GROUP BY match_id, team
    HAVING length(hero_ids) = 6
)
SELECT
    hero_ids,
    sum(won) AS wins,
    sum(not won) AS losses,
    wins + losses AS matches
FROM hero_combinations
WHERE true {} {}
GROUP BY hero_ids
HAVING matches > 1
ORDER BY matches DESC
    "#,
        info_filters, player_filters, hero_filters
    );
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch hero comb win loss stats: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch hero comb win loss stats: {}", e),
        }
    })
}

#[utoipa::path(
    get,
    path = "/hero-comb-win-loss-stats",
    params(HeroCombWinLossStatsQuery),
    responses(
        (status = OK, description = "Hero Win Loss Stats", body = [HeroCombWinLossStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero comb win loss stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Comb Win Loss Stats",
    description = r#"
Retrieves overall win/loss and performance statistics for each hero combination.

This endpoint analyzes completed matches. For each hero combination, it calculates their total wins and matches played across all matches.

Results are cached for **1 hour**. The cache key is determined by the specific combination of filter parameters used in the query. Subsequent requests using the exact same filters within this timeframe will receive the cached response.
    "#
)]
pub async fn hero_comb_win_loss_stats(
    Query(query): Query<HeroCombWinLossStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_comb_hero_win_loss_stats(&state.ch_client, query)
        .await
        .map(Json)
}
