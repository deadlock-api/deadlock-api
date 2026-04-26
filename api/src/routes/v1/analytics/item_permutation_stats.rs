use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, PlayerFilters, filter_protected_accounts, join_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

#[allow(clippy::unnecessary_wraps)]
fn default_comb_size() -> Option<u8> {
    2.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct ItemPermutationStatsQuery {
    /// Comma separated list of item ids. See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    item_ids: Option<Vec<u32>>,
    /// The combination size to return.
    #[param(minimum = 2, maximum = 12, default = 2)]
    comb_size: Option<u8>,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
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
    /// Filter players based on their final net worth.
    min_networth: Option<u64>,
    /// Filter players based on their final net worth.
    max_networth: Option<u64>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
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
    let info_filters = MatchInfoFilters {
        min_unix_timestamp: query.min_unix_timestamp,
        max_unix_timestamp: query.max_unix_timestamp,
        min_match_id: query.min_match_id,
        max_match_id: query.max_match_id,
        min_average_badge: query.min_average_badge,
        max_average_badge: query.max_average_badge,
        min_duration_s: query.min_duration_s,
        max_duration_s: query.max_duration_s,
    }
    .build();
    let mut hero_ids = query.hero_ids.clone().unwrap_or_default();
    #[allow(deprecated)]
    if let Some(hero_id) = query.hero_id {
        hero_ids.push(hero_id);
    }
    #[allow(deprecated)]
    let player_filters = join_filters(
        &PlayerFilters {
            hero_ids: if hero_ids.is_empty() {
                None
            } else {
                Some(&hero_ids)
            },
            account_id: query.account_id,
            account_ids: query.account_ids.as_deref(),
            min_networth: query.min_networth,
            max_networth: query.max_networth,
            ..Default::default()
        }
        .build(),
    );
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    if let Some(item_ids) = &query.item_ids {
        if item_ids.len() < 2 {
            return String::new();
        }
        let items_list = format!("[{}]", item_ids.iter().map(ToString::to_string).join(", "));
        format!(
            "
        SELECT
            arrayIntersect(items.item_id, {items_list}) AS item_ids,
            countIf(won)      AS wins,
            countIf(not won)  AS losses,
            wins + losses AS matches
        FROM match_player
        WHERE hasAll(items.item_id, {items_list})
            AND match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters}
            {player_filters}
        GROUP BY item_ids
        ORDER BY matches DESC
        SETTINGS log_comment = 'item_permutation_stats_intersect'
        "
        )
    } else {
        let comb_size = query.comb_size.or(default_comb_size()).unwrap_or(2);
        if comb_size < 2 {
            return String::new();
        }
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
        WITH t_upgrades AS (SELECT id from items WHERE type = 'upgrade'),
            t_players AS (SELECT arrayFilter(x -> x IN t_upgrades, arrayDistinct(items.item_id))
             as p_items, won
                FROM match_player
                WHERE match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters} {player_filters})
        SELECT [{intersect_array}] AS item_ids,
               countIf(won)      AS wins,
               countIf(not won)  AS losses,
               wins + losses AS matches
        FROM t_players {joins}
        WHERE {filters_distinct}
        GROUP BY {intersect_array}
        ORDER BY matches DESC
        SETTINGS log_comment = 'item_permutation_stats_combinations'
        "
        )
    }
}

#[cached(
    ty = "TimedCache<String, Vec<ItemPermutationStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<ItemPermutationStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_item_permutation_stats(
    ch_client: &clickhouse::Client,
    mut query: ItemPermutationStatsQuery,
) -> APIResult<Vec<ItemPermutationStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query = build_query(&query);
    debug!(?query);
    Ok(run_query(ch_client, &query).await?)
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
    Query(mut query): Query<ItemPermutationStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if query.game_mode.is_some_and(|g| g == GameMode::StreetBrawl)
        && (query.min_average_badge.is_some() || query.max_average_badge.is_some())
    {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Cannot filter by average badge for street brawl game mode".to_string(),
        });
    }
    #[allow(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
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
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        #[allow(deprecated)]
        fn item_permutation_stats_build_query_is_valid_sql(query: ItemPermutationStatsQuery) {
            let sql = build_query(&query);
            if !sql.is_empty() {
                assert_valid_sql(&sql);
            }
        }
    }
}
