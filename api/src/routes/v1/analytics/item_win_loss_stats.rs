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
pub struct ItemWinLossStatsQuery {
    /// Filter matches based on the hero ID.
    pub hero_id: Option<u32>,
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
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ItemWinLossStats {
    pub item_id: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
}

#[cached(
    ty = "TimedCache<String, Vec<ItemWinLossStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
pub async fn get_item_win_loss_stats(
    ch_client: &clickhouse::Client,
    query: ItemWinLossStatsQuery,
) -> APIResult<Vec<ItemWinLossStats>> {
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
    if let Some(hero_id) = query.hero_id {
        player_filters.push(format!("hero_id = {}", hero_id));
    }
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
    WITH matches AS (SELECT match_id
            FROM match_info
            WHERE match_outcome = 'TeamWin'
            AND match_mode IN ('Ranked', 'Unranked')
            AND game_mode = 'Normal' {}),
        players AS (SELECT items.item_id as items, won
            FROM match_player
            WHERE match_id IN (SELECT match_id FROM matches) {})
    SELECT
        item_id,
        sum(won)      AS wins,
        sum(not won)  AS losses,
        wins + losses AS matches
    FROM players
        ARRAY JOIN items as item_id
    GROUP BY item_id
    ORDER BY item_id
    "#,
        info_filters, player_filters
    );
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch item win loss stats: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch item win loss stats: {}", e),
        }
    })
}

#[utoipa::path(
    get,
    path = "/item-win-loss-stats",
    params(ItemWinLossStatsQuery),
    responses(
        (status = OK, description = "Item Win Loss Stats", body = [ItemWinLossStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch item win loss stats")
    ),
    tags = ["Analytics"],
    summary = "Item Win Loss Stats",
    description = r#"
Retrieves item win/loss statistics based on historical match data.

This endpoint analyzes completed matches to calculate how often matches were won or lost when specific items were present within those matches.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.
    "#
)]
pub async fn item_win_loss_stats(
    Query(query): Query<ItemWinLossStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_item_win_loss_stats(&state.ch_client, query)
        .await
        .map(Json)
}
