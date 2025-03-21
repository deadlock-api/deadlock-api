use crate::error::{APIError, APIResult};
use crate::routes::v1::players::types::AccountIdQuery;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

#[derive(Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct ItemStatsQuery {
    min_unix_timestamp: Option<u64>,
    max_unix_timestamp: Option<u64>,
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    min_match_id: Option<u64>,
    max_match_id: Option<u64>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ItemStats {
    pub hero_id: u32,
    pub item_id: u32,
    pub wins: u64,
    pub matches_played: u64,
    pub matches: Vec<u64>,
}

#[cached(
    ty = "TimedCache<String, Vec<ItemStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{}-{:?}", account_id, query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_item_stats(
    ch_client: &clickhouse::Client,
    account_id: u32,
    query: ItemStatsQuery,
) -> APIResult<Vec<ItemStats>> {
    let mut filters = vec![];
    filters.push(format!("account_id = {}", account_id));
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        filters.push(format!("start_time >= {}", min_unix_timestamp));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        filters.push(format!("start_time <= {}", max_unix_timestamp));
    }
    if let Some(min_match_id) = query.min_match_id {
        filters.push(format!("match_id >= {}", min_match_id));
    }
    if let Some(max_match_id) = query.max_match_id {
        filters.push(format!("match_id <= {}", max_match_id));
    }
    if let Some(min_badge_level) = query.min_average_badge {
        filters.push(format!(
            "average_badge_team0 >= {} AND average_badge_team1 >= {}",
            min_badge_level, min_badge_level
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
        filters.push(format!(
            "average_badge_team0 <= {} AND average_badge_team1 <= {}",
            max_badge_level, max_badge_level
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        filters.push(format!("duration_s >= {}", min_duration_s));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        filters.push(format!("duration_s <= {}", max_duration_s));
    }
    let filters = if filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", filters.join(" AND "))
    };
    let query = format!(
        r#"
    SELECT hero_id, items.item_id as item_id, coalesce(sum(won), 0) AS wins, count() AS matches_played, groupUniqArray(match_id) AS matches
    FROM match_player FINAL
        INNER ANY JOIN match_info AS mi USING (match_id)
        ARRAY JOIN items.item_id
    WHERE match_outcome = 'TeamWin' AND match_mode IN ('Ranked', 'Unranked') AND game_mode = 'Normal' {}
    GROUP BY hero_id, item_id
    ORDER BY hero_id, item_id
    "#,
        filters
    );
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch item stats: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch item stats: {}", e),
        }
    })
}

#[utoipa::path(
    get,
    path = "/{account_id}/item-stats",
    params(AccountIdQuery, ItemStatsQuery),
    responses(
        (status = OK, description = "Item Stats", body = [ItemStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch item stats")
    ),
    tags = ["Players"],
    summary = "Item Stats",
    description = r"This endpoint returns the item stats."
)]
pub async fn item_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<ItemStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_item_stats(&state.clickhouse_client, account_id, query)
        .await
        .map(Json)
}
