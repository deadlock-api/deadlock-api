use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::parse::{
    comma_separated_num_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

fn default_comb_size() -> Option<u8> {
    2.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(super) struct ItemPermutationStatsQuery {
    /// Comma separated list of item ids. See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_num_deserialize_option")]
    item_ids: Option<Vec<u32>>,
    /// The combination size to return.
    #[param(minimum = 2, maximum = 12, default = 2)]
    comb_size: Option<u8>,
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_num_deserialize_option")]
    hero_ids: Option<Vec<u32>>,
    /// Filter matches based on the hero ID. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[deprecated(note = "Use hero_ids instead")]
    hero_id: Option<u32>,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    min_unix_timestamp: Option<i64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<i64>,
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
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    account_id: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
struct ItemPermutationStats {
    /// See more: <https://assets.deadlock-api.com/v2/items>
    item_ids: Vec<u32>,
    wins: u64,
    losses: u64,
    matches: u64,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &ItemPermutationStatsQuery) -> String {
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
        String::new()
    } else {
        format!(" AND {}", info_filters.join(" AND "))
    };
    let mut player_filters = vec![];
    let mut hero_ids = query.hero_ids.clone().unwrap_or_default();
    #[allow(deprecated)]
    if let Some(hero_id) = query.hero_id {
        hero_ids.push(hero_id);
    }
    if !hero_ids.is_empty() {
        player_filters.push(format!(
            "hero_id IN ({})",
            hero_ids.iter().map(u32::to_string).join(", ")
        ));
    }
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("account_id = {account_id}"));
    }
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("net_worth <= {max_networth}"));
    }
    let player_filters = if player_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    if let Some(item_ids) = &query.item_ids {
        if item_ids.len() < 2 {
            return String::new();
        }
        let items_list = format!("[{}]", item_ids.iter().map(ToString::to_string).join(", "));
        format!(
            "
        WITH t_matches AS (SELECT match_id
                FROM match_info
                WHERE match_mode IN ('Ranked', 'Unranked') {info_filters})
        SELECT
            arrayIntersect(items.item_id, {items_list}) AS item_ids,
            sum(won)      AS wins,
            sum(not won)  AS losses,
            wins + losses AS matches
        FROM match_player FINAL
        WHERE hasAll(items.item_id, {items_list})
            AND match_id IN t_matches
            {player_filters}
        GROUP BY item_ids
        ORDER BY matches DESC
        "
        )
    } else {
        let comb_size = query.comb_size.or(default_comb_size()).unwrap_or(2);
        let joins = (0..comb_size)
            .map(|i| format!(" ARRAY JOIN p_items AS i{i}, arrayEnumerate(p_items) AS i{i}_index "))
            .join("\n");
        let intersect_array = (0..comb_size).map(|i| format!("i{i}")).join(", ");
        let filters_distinct = (0..comb_size)
            .tuple_windows()
            .map(|(i, j)| format!("i{i}_index < i{j}_index"))
            .join(" AND ");
        format!(
            "
        WITH t_matches AS (SELECT match_id
                FROM match_info
                WHERE match_mode IN ('Ranked', 'Unranked') {info_filters}),
            t_items AS (SELECT id from items),
            t_players AS (SELECT arrayFilter(x -> x IN t_items, arrayDistinct(items.item_id)) as \
             p_items, won
                FROM match_player
                WHERE match_id IN t_matches {player_filters})
        SELECT [{intersect_array}] AS item_ids,
               sum(won)      AS wins,
               sum(not won)  AS losses,
               wins + losses AS matches
        FROM t_players {joins}
        WHERE {filters_distinct}
        GROUP BY item_ids
        ORDER BY matches DESC
        "
        )
    }
}

#[cached(
    ty = "TimedCache<String, Vec<ItemPermutationStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_item_permutation_stats(
    ch_client: &clickhouse::Client,
    query: ItemPermutationStatsQuery,
) -> APIResult<Vec<ItemPermutationStats>> {
    let query = build_query(&query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/item-permutation-stats",
    params(ItemPermutationStatsQuery),
    responses(
        (status = OK, description = "Item Stats", body = [ItemPermutationStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch item stats")
    ),
    tags = ["Analytics"],
    summary = "Item Permutation Stats",
    description = "
Retrieves item permutation statistics based on historical match data.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn item_permutation_stats(
    Query(query): Query<ItemPermutationStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if query.comb_size.is_some() && query.item_ids.is_some() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Cannot specify both comb_size and item_ids",
        ));
    }
    if query.item_ids.as_ref().is_some_and(Vec::is_empty) {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "No item ids provided",
        ));
    }
    get_item_permutation_stats(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_item_stats_query_min_unix_timestamp() {
        let min_unix_timestamp = 1672531200;
        let query = ItemPermutationStatsQuery {
            min_unix_timestamp: min_unix_timestamp.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("start_time >= {min_unix_timestamp}")));
    }

    #[test]
    fn test_build_item_stats_query_max_unix_timestamp() {
        let max_unix_timestamp = 1675209599;
        let query = ItemPermutationStatsQuery {
            max_unix_timestamp: max_unix_timestamp.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("start_time <= {max_unix_timestamp}")));
    }

    #[test]
    fn test_build_item_stats_query_min_duration_s() {
        let min_duration_s = 600;
        let query = ItemPermutationStatsQuery {
            min_duration_s: min_duration_s.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("duration_s >= {min_duration_s}")));
    }

    #[test]
    fn test_build_item_stats_query_max_duration_s() {
        let max_duration_s = 1800;
        let query = ItemPermutationStatsQuery {
            max_duration_s: max_duration_s.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("duration_s <= {max_duration_s}")));
    }

    #[test]
    fn test_build_item_stats_query_min_networth() {
        let min_networth = 1000;
        let query = ItemPermutationStatsQuery {
            min_networth: min_networth.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("net_worth >= {min_networth}")));
    }
    #[test]
    fn test_build_item_stats_query_max_networth() {
        let max_networth = 10000;
        let query = ItemPermutationStatsQuery {
            max_networth: max_networth.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("net_worth <= {max_networth}")));
    }

    #[test]
    fn test_build_item_stats_query_min_average_badge() {
        let min_average_badge = 1;
        let query = ItemPermutationStatsQuery {
            min_average_badge: min_average_badge.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!(
            "average_badge_team0 >= {min_average_badge} AND average_badge_team1 >= \
             {min_average_badge}"
        )));
    }

    #[test]
    fn test_build_item_stats_query_max_average_badge() {
        let max_average_badge = 116;
        let query = ItemPermutationStatsQuery {
            max_average_badge: max_average_badge.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!(
            "average_badge_team0 <= {max_average_badge} AND average_badge_team1 <= \
             {max_average_badge}"
        )));
    }

    #[test]
    fn test_build_item_stats_query_min_match_id() {
        let min_match_id = 10000;
        let query = ItemPermutationStatsQuery {
            min_match_id: min_match_id.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("match_id >= {min_match_id}")));
    }

    #[test]
    fn test_build_item_stats_query_max_match_id() {
        let max_match_id = 1000000;
        let query = ItemPermutationStatsQuery {
            max_match_id: max_match_id.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("match_id <= {max_match_id}")));
    }

    #[test]
    fn test_build_item_stats_query_account_id() {
        let account_id = 18373975;
        let query = ItemPermutationStatsQuery {
            account_id: account_id.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("account_id = {account_id}")));
    }

    #[test]
    fn test_build_item_stats_query_hero_ids() {
        let hero_ids = vec![1, 15];
        let query = ItemPermutationStatsQuery {
            hero_ids: hero_ids.clone().into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!(
            "hero_id IN ({})",
            hero_ids.iter().map(ToString::to_string).join(", ")
        )));
    }
}
