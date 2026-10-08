use crate::utils::sql::cached_ch_query;
use crate::utils::sql::impl_match_info;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    PlayerFilters, default_min_matches_u32, filter_protected_accounts, join_filters,
    not_corrupted_sql, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::reject_brawl_badge_filter;
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

fn default_comb_size() -> Option<u8> {
    2.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct ItemPermutationStatsQuery {
    /// Comma separated list of item ids. See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    item_ids: Option<Vec<u32>>,
    /// The combination size to return.
    #[param(minimum = 2, maximum = 12, default = 2)]
    comb_size: Option<u8>,
    /// The minimum number of matches for an item combination to be included in the response.
    #[serde(default = "default_min_matches_u32")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// The maximum number of matches for an item combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(
        default = "GameMode::default_option",
        deserialize_with = "GameMode::deserialize_option"
    )]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on the match mode. Valid values: `unranked`, `private_lobby`, `coop_bot`, `ranked`, `server_test`, `tutorial`, `hero_labs`. **Default:** `ranked,unranked`.
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<crate::routes::v1::matches::types::MatchMode>(), 0..=4))"
        )
    )]
    match_mode: Option<Vec<MatchMode>>,
    /// Filter matches based on the hero IDs. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Filter matches based on the hero ID. See more: <https://api.deadlock-api.com/v1/assets/heroes>
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
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
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
    /// Comma separated list of ability ids: only players whose ability upgrade order starts with exactly this sequence (one entry per ability point spent, unlocks included; see `ability_unlock_order_prefix` to match only the unlock order). See more: <https://api.deadlock-api.com/v1/analytics/ability-order-stats>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    ability_order_prefix: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players who unlocked (put their first point into) their abilities in exactly this order, e.g. `a,b` for players who unlocked `a` first and `b` second. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    ability_unlock_order_prefix: Option<Vec<u32>>,
    /// Count corrupted items (build 6712+: a T3/T4 upgrade the Broker swapped for a corrupted version with the same item id) as the normal item. **Default:** `false`, corrupted purchases are ignored.
    #[serde(default)]
    #[param(default = false)]
    include_corrupted_items: Option<bool>,
}

impl_match_info!(ItemPermutationStatsQuery);

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
struct ItemPermutationStats {
    /// See more: <https://api.deadlock-api.com/v1/assets/items>
    item_ids: Vec<u32>,
    wins: u64,
    losses: u64,
    matches: u64,
}

#[expect(clippy::too_many_lines)]
fn build_query(query: &ItemPermutationStatsQuery) -> String {
    let info_filters = query.match_info().build();
    let mut hero_ids = query.hero_ids.clone().unwrap_or_default();
    #[expect(deprecated)]
    if let Some(hero_id) = query.hero_id {
        hero_ids.push(hero_id);
    }
    #[expect(deprecated)]
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
            ability_order_prefix: query.ability_order_prefix.as_deref(),
            ability_unlock_order_prefix: query.ability_unlock_order_prefix.as_deref(),
            ..Default::default()
        }
        .build(),
    );
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    // `min_matches`/`max_matches` are pure post-aggregation filters, so keeping them out of the
    // SQL lets every value share one cached result instead of triggering a fresh multi-second
    // scan per value. The floor is clamped rather than dropped so the cached superset stays no
    // larger than the default query already returns; the exact bounds are applied in Rust.
    let having_clause = match query.min_matches.min(default_min_matches_u32()) {
        Some(min_matches) => format!("HAVING matches >= {min_matches}"),
        None => String::new(),
    };
    // Corrupted purchases keep the normal item's id; only `items.upgrade_info` tells them
    // apart. The swapped-out normal purchase stays in `items`, so a player who had an item
    // corrupted still counts as owning the normal item.
    let include_corrupted = query.include_corrupted_items == Some(true);
    // Both shapes read `items.*` (and `items.upgrade_info`), which the hero-led
    // `item_stats_by_hero_mode_badge_v2` projection stores, so ClickHouse also picks it
    // without a hero filter. With skip indexes evaluated at planning time
    // (`use_skip_indexes_on_data_read = 0` on the clients) start_time prunes it too: the
    // combinations query reads 36% of the bytes with it (identical results), so it may use the
    // projection. The hero-less intersect query still keeps it off: 32% fewer bytes but p50
    // 2.2 s -> 3.4 s.
    let projection_setting = if hero_ids.is_empty() {
        ", optimize_use_projections = 0"
    } else {
        ""
    };
    if let Some(item_ids) = &query.item_ids {
        if item_ids.len() < 2 {
            return String::new();
        }
        let items_list = format!("[{}]", item_ids.iter().map(ToString::to_string).join(", "));
        // `hasAll(items.item_id, ...)` stays as-is so the bf_items_item_id skip index still
        // prunes; the corruption-aware check is an extra predicate on the surviving rows.
        let (owned_items, corrupted_filter) = if include_corrupted {
            ("items.item_id".to_owned(), String::new())
        } else {
            let owned = format!(
                "arrayFilter((x, u) -> {}, items.item_id, items.upgrade_info)",
                not_corrupted_sql("u")
            );
            let filter = format!("\n            AND hasAll({owned}, {items_list})");
            (owned, filter)
        };
        format!(
            "
        SELECT
            arrayIntersect({owned_items}, {items_list}) AS item_ids,
            countIf(won)      AS wins,
            countIf(not won)  AS losses,
            wins + losses AS matches
        FROM match_player
        WHERE hasAll(items.item_id, {items_list}){corrupted_filter}
            AND {match_mode_filter} AND {game_mode_filter} {info_filters}
            {player_filters}
        GROUP BY item_ids
        {having_clause}
        ORDER BY matches DESC
        SETTINGS log_comment = 'item_permutation_stats_intersect', apply_patch_parts = 0{projection_setting}
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
        let owned_items = if include_corrupted {
            "arrayFilter(x -> x IN t_upgrades, arrayDistinct(items.item_id))".to_owned()
        } else {
            format!(
                "arrayDistinct(arrayFilter((x, u) -> x IN t_upgrades AND {}, items.item_id, items.upgrade_info))",
                not_corrupted_sql("u")
            )
        };
        let filters_distinct = (0..comb_size)
            .tuple_windows()
            .map(|(i, j)| format!("i{i}_index < i{j}_index"))
            .join(" AND ");
        format!(
            "
        WITH t_upgrades AS (SELECT id from items WHERE type = 'upgrade'),
            t_players AS (SELECT {owned_items}
             as p_items, won
                FROM match_player
                WHERE {match_mode_filter} AND {game_mode_filter} {info_filters} {player_filters})
        SELECT [{intersect_array}] AS item_ids,
               countIf(won)      AS wins,
               countIf(not won)  AS losses,
               wins + losses AS matches
        FROM t_players {joins}
        WHERE {filters_distinct}
        GROUP BY {intersect_array}
        {having_clause}
        ORDER BY matches DESC
        SETTINGS log_comment = 'item_permutation_stats_combinations', apply_patch_parts = 0
        "
        )
    }
}

cached_ch_query! {
    fn run_query(5_000, 21600) -> Vec<ItemPermutationStats>;
}

async fn get_item_permutation_stats(
    ch_client: &clickhouse::Client,
    mut query: ItemPermutationStatsQuery,
) -> APIResult<Vec<ItemPermutationStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    let mut stats = Arc::unwrap_or_clone(run_query(ch_client, &query_str).await?);
    stats.retain(|s| {
        query.min_matches.is_none_or(|m| s.matches >= u64::from(m))
            && query.max_matches.is_none_or(|m| s.matches <= u64::from(m))
    });
    Ok(stats)
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

Results are cached for **6 hours** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(super) async fn item_permutation_stats(
    Query(mut query): Query<ItemPermutationStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    #[expect(deprecated)]
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
mod tests {
    use super::*;

    fn query_with(min_matches: Option<u32>, max_matches: Option<u32>) -> String {
        build_query(&ItemPermutationStatsQuery {
            min_matches,
            max_matches,
            ..Default::default()
        })
    }

    #[test]
    fn match_count_bounds_at_or_above_the_default_share_one_query() {
        let baseline = query_with(default_min_matches_u32(), None);
        for min_matches in [20, 100, 500, 1000] {
            assert_eq!(baseline, query_with(Some(min_matches), None));
        }
        for max_matches in [None, Some(50), Some(900)] {
            assert_eq!(baseline, query_with(Some(500), max_matches));
        }
    }

    #[test]
    fn corrupted_items_are_excluded_by_default() {
        let combos = build_query(&ItemPermutationStatsQuery::default());
        assert!(combos.contains(
            "arrayDistinct(arrayFilter((x, u) -> x IN t_upgrades AND bitAnd(u, 8388608) = 0, items.item_id, items.upgrade_info))"
        ));
        let intersect = build_query(&ItemPermutationStatsQuery {
            item_ids: Some(vec![1, 2]),
            ..Default::default()
        });
        let owned =
            "arrayFilter((x, u) -> bitAnd(u, 8388608) = 0, items.item_id, items.upgrade_info)";
        assert!(intersect.contains(&format!("arrayIntersect({owned}, [1, 2]) AS item_ids")));
        assert!(intersect.contains(&format!(
            "WHERE hasAll(items.item_id, [1, 2])\n            AND hasAll({owned}, [1, 2])"
        )));
    }

    #[test]
    fn include_corrupted_items_keeps_the_raw_item_ids() {
        let combos = build_query(&ItemPermutationStatsQuery {
            include_corrupted_items: Some(true),
            ..Default::default()
        });
        assert!(combos.contains("arrayFilter(x -> x IN t_upgrades, arrayDistinct(items.item_id))"));
        assert!(!combos.contains("upgrade_info"));
        let intersect = build_query(&ItemPermutationStatsQuery {
            item_ids: Some(vec![1, 2]),
            include_corrupted_items: Some(true),
            ..Default::default()
        });
        assert!(intersect.contains("arrayIntersect(items.item_id, [1, 2]) AS item_ids"));
        assert!(!intersect.contains("upgrade_info"));
    }

    #[test]
    fn projections_are_disabled_only_for_the_hero_less_intersect() {
        for item_ids in [None, Some(vec![1, 2])] {
            for include_corrupted_items in [None, Some(true)] {
                let no_hero = build_query(&ItemPermutationStatsQuery {
                    item_ids: item_ids.clone(),
                    include_corrupted_items,
                    account_ids: Some(vec![5]),
                    ..Default::default()
                });
                // `item_ids` selects the intersect query; without it, combinations.
                assert_eq!(
                    no_hero.contains("apply_patch_parts = 0, optimize_use_projections = 0\n"),
                    item_ids.is_some(),
                    "{no_hero}"
                );
                let hero = build_query(&ItemPermutationStatsQuery {
                    item_ids: item_ids.clone(),
                    include_corrupted_items,
                    hero_ids: Some(vec![7]),
                    ..Default::default()
                });
                assert!(hero.contains("hero_id IN (7)"));
                assert!(!hero.contains("optimize_use_projections"), "{hero}");
                #[expect(deprecated)]
                let legacy_hero = build_query(&ItemPermutationStatsQuery {
                    item_ids: item_ids.clone(),
                    include_corrupted_items,
                    hero_id: Some(7),
                    ..Default::default()
                });
                assert!(!legacy_hero.contains("optimize_use_projections"));
            }
        }
    }

    #[test]
    fn min_matches_below_the_default_lowers_the_sql_floor() {
        let looser = query_with(Some(5), None);
        assert!(looser.contains("matches >= 5"));
        assert_ne!(query_with(default_min_matches_u32(), None), looser);
    }
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn item_permutation_stats_build_query_is_valid_sql(query: ItemPermutationStatsQuery) {
            let sql = build_query(&query);
            if !sql.is_empty() {
                assert_valid_sql(&sql);
            }
        }
    }
}
