use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchScope, PlayerFilters, default_min_matches_u32, filter_protected_accounts, is_non_empty,
    join_filters, not_corrupted_sql, round_timestamps, with_legacy_id,
};
use super::item_stats::retry_on_base_table;
use super::rollup_window::{Coverage, DaySplit, EdgeRows, Reach, Rollup, RollupFilters};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::cohort_agg_refresh::HORIZON_DAYS;
use crate::utils::match_modes::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};
use crate::utils::sql::{cached_ch_query, id_list, impl_match_info};

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
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<crate::utils::match_modes::MatchMode>(), 0..=4))"
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
    #[serde(default, deserialize_with = "steam_id::de::account_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "steam_id::de::account_ids_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players whose ability upgrade order starts with exactly this sequence (one entry per ability point spent, unlocks included; see `ability_unlock_order_prefix` to match only the unlock order). See more: <https://api.deadlock-api.com/v1/analytics/ability-order-stats>
    // Order matters, and repeated keys reach the API reordered: clients must send one `a,b` value.
    #[param(explode = false)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    ability_order_prefix: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players who unlocked (put their first point into) their abilities in exactly this order, e.g. `a,b` for players who unlocked `a` first and `b` second. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    // Order matters, and repeated keys reach the API reordered: clients must send one `a,b` value.
    #[param(explode = false)]
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

#[expect(
    clippy::option_if_let_else,
    reason = "one linear query builder with two long query shapes reads clearer than split helpers"
)]
fn build_query(query: &ItemPermutationStatsQuery) -> String {
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    let hero_ids = with_legacy_id(query.hero_ids.as_deref(), query.hero_id);
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    let player_filters = join_filters(
        &PlayerFilters {
            hero_ids: Some(&hero_ids),
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
    let scope_filters = MatchScope::new(
        query.match_mode.as_deref(),
        query.game_mode,
        query.match_info(),
    )
    .sql();
    let having_clause = having_clause(query);
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
        let items_list = format!("[{}]", id_list(item_ids));
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
            arraySort(arrayIntersect({owned_items}, {items_list})) AS item_ids,
            countIf(won)      AS wins,
            countIf(not won)  AS losses,
            wins + losses AS matches
        FROM match_player
        WHERE hasAll(items.item_id, {items_list}){corrupted_filter}
            AND {scope_filters}
            {player_filters}
        GROUP BY item_ids
        {having_clause}
        ORDER BY matches DESC
        SETTINGS log_comment = 'item_permutation_stats_intersect', apply_patch_parts = 0{projection_setting}
        "
        )
    } else {
        let comb_size = query.comb_size.or_else(default_comb_size).unwrap_or(2);
        // Only increasing index tuples, so each combination is built once rather than all `n^k`
        // tuples filtered down to `i0_index < i1_index < ...`. `p_items` is sorted by id, so a
        // combination is one row whatever order its items were bought in.
        let joins = (0..comb_size)
            .map(|i| {
                if let Some(prev) = i.checked_sub(1) {
                    let index = if i.saturating_add(1) < comb_size {
                        format!(", arraySlice(arrayEnumerate(p_items), j{prev} + 1) AS j{i}")
                    } else {
                        String::new()
                    };
                    format!(" ARRAY JOIN arraySlice(p_items, j{prev} + 1) AS i{i}{index}")
                } else {
                    " ARRAY JOIN p_items AS i0, arrayEnumerate(p_items) AS j0".to_owned()
                }
            })
            .join("\n");
        let intersect_array = (0..comb_size).map(|i| format!("i{i}")).join(", ");
        let decoded_items = (0..comb_size).map(|i| format!("u_ids[i{i}]")).join(", ");
        let p_items = upgrade_positions_sql(include_corrupted);
        format!(
            "
        WITH {UPGRADE_IDS_SQL} AS u_ids,
            t_upgrades AS (SELECT id from items WHERE type = 'upgrade'),
            t_players AS (SELECT {p_items}
             as p_items, won
                FROM match_player
                WHERE {scope_filters} {player_filters})
        SELECT [{decoded_items}] AS item_ids,
               countIf(won)      AS wins,
               countIf(not won)  AS losses,
               wins + losses AS matches
        FROM t_players {joins}
        GROUP BY {intersect_array}
        {having_clause}
        ORDER BY matches DESC
        SETTINGS log_comment = 'item_permutation_stats_combinations', apply_patch_parts = 0
        "
        )
    }
}

/// `u_ids`: the sorted upgrade ids, whose 1-based positions [`upgrade_positions_sql`] maps a
/// player's items to. Fails loudly past 255 upgrades, which `UInt8` positions can't hold.
const UPGRADE_IDS_SQL: &str = "(SELECT arraySort(groupArray(id)) FROM items WHERE type = 'upgrade'
                HAVING throwIf(count() > 255, 'too many upgrades for UInt8 positions') = 0)";

/// A player's distinct upgrades, as their sorted 1-based `UInt8` positions in `u_ids`
/// ([`UPGRADE_IDS_SQL`]), with `t_upgrades` the set of upgrade ids. Corrupted purchases are
/// dropped unless `include_corrupted`.
///
/// The combinations are grouped by these positions rather than by the `UInt32` ids: the `GROUP BY`
/// dominates the cost, and the narrow keys cut its memory 27-43% and CPU 17-35% (identical
/// results). Mapping only the filtered, distinct ids keeps `transform` cheap. Positions follow id
/// order, so the array stays sorted and each combination is one increasing tuple.
fn upgrade_positions_sql(include_corrupted: bool) -> String {
    let owned_items = if include_corrupted {
        "arraySort(arrayFilter(x -> x IN t_upgrades, arrayDistinct(items.item_id)))".to_owned()
    } else {
        format!(
            "arraySort(arrayDistinct(arrayFilter((x, u) -> x IN t_upgrades AND {}, items.item_id, items.upgrade_info)))",
            not_corrupted_sql("u")
        )
    };
    format!(
        "arrayMap(x -> transform(x, u_ids, arrayMap(i -> toUInt8(i), arrayEnumerate(u_ids)), toUInt8(0)), {owned_items})"
    )
}

/// The SQL floor on `matches`. `min_matches`/`max_matches` are pure post-aggregation filters, so
/// keeping them out of the SQL lets every value share one cached result instead of triggering a
/// fresh multi-second scan per value. The floor is clamped rather than dropped so the cached
/// superset stays no larger than the default query already returns; the exact bounds are applied
/// in Rust.
fn having_clause(query: &ItemPermutationStatsQuery) -> String {
    query
        .min_matches
        .min(default_min_matches_u32())
        .map_or_else(String::new, |min_matches| {
            format!("HAVING matches >= {min_matches}")
        })
}

/// The item pair rollup, rebuilt per day by `services/cohort_agg_refresh.rs` from
/// [`pairs_agg_select_body`].
///
/// Without a hero, `comb_size=2` expands every player of the window into each pair of upgrades
/// they own, ~142 per player: 30 days are ~10B pairs, 200-270 CPU-s, and mostly hit the 20 s
/// limit. No rewrite of that query was cheaper (2026-11-09: one flat pair-key ARRAY JOIN +77%
/// CPU, roaring bitmaps per item +101%, the rest within noise). The rollup holds ~630k rows a day
/// (~1.7 MiB on disk).
pub(crate) const PAIRS_AGG_TABLE: &str = "default.item_permutation_pairs_agg";
pub(crate) const PAIRS_AGG_STAGING: &str = "default.item_permutation_pairs_agg_staging";

/// `item_permutation_pairs_agg`: per mode, day, badge and pair of upgrades owned (the lower id
/// first), with corrupted purchases dropped like the base query's default. The base-table rows
/// group by the items' `UInt8` positions (`i0`, `i1`) and map them back to ids after
/// ([`pair_rows`]).
const PAIRS_AGG: Rollup<'static> = Rollup {
    table: PAIRS_AGG_TABLE,
    grain: &[
        ("game_mode", "game_mode"),
        ("match_mode", "match_mode"),
        ("day", "toDate(start_time)"),
        ("least_badge", "ifNull(average_badge, 0)"),
        ("greatest_badge", "ifNull(average_badge, 65535)"),
        ("item_a", "i0"),
        ("item_b", "i1"),
    ],
    measures: "n_matches, n_wins",
    coverage: Coverage::Incremental {
        horizon_days: HORIZON_DAYS,
    },
};

/// The [`PAIRS_AGG`] rows of the matches `where_clause` selects, grouped by the grain columns of
/// `grain_select`/`group_by`, which must include `item_a` and `item_b`: a window's partial days,
/// or a whole rollup day.
fn pair_rows(
    EdgeRows {
        where_clause,
        grain_select,
        group_by,
    }: &EdgeRows,
) -> String {
    let p_items = upgrade_positions_sql(false);
    format!(
        "WITH {UPGRADE_IDS_SQL} AS u_ids,
    t_upgrades AS (SELECT id FROM items WHERE type = 'upgrade')
SELECT * REPLACE (u_ids[item_a] AS item_a, u_ids[item_b] AS item_b)
FROM (
    SELECT {grain_select}count() AS n_matches, countIf(won) AS n_wins
    FROM (
        SELECT {p_items} AS p_items, won, game_mode, match_mode, start_time, average_badge
        FROM default.match_player
        WHERE match_mode IN ('Ranked', 'Unranked') AND {where_clause}
    )
    ARRAY JOIN p_items AS i0, arrayEnumerate(p_items) AS j0
    ARRAY JOIN arraySlice(p_items, j0 + 1) AS i1
    GROUP BY {group_by}
)"
    )
}

/// The [`PAIRS_AGG`] rows of the matches selected by `since_clause`, at the full grain and in
/// the table's column order. The refresh job builds the rollup's days with it.
pub(crate) fn pairs_agg_select_body(since_clause: &str) -> String {
    pair_rows(&EdgeRows::full_grain(PAIRS_AGG.grain, since_clause))
}

/// Builds a query against [`PAIRS_AGG`] for hero-less `comb_size=2` requests filtering only on
/// the game mode, match mode (ranked/unranked), badge and time range, else `None`.
fn build_pairs_mv_query(query: &ItemPermutationStatsQuery) -> Option<String> {
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    let unsupported = query.item_ids.is_some()
        || query.comb_size.or_else(default_comb_size) != Some(2)
        || query.hero_id.is_some()
        || is_non_empty(query.hero_ids.as_deref())
        || query.account_id.is_some()
        || is_non_empty(query.account_ids.as_deref())
        || query.min_networth.is_some()
        || query.max_networth.is_some()
        || query.min_duration_s.is_some()
        || query.max_duration_s.is_some()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some()
        || query.ability_order_prefix.is_some()
        || query.ability_unlock_order_prefix.is_some()
        || query.include_corrupted_items == Some(true)
        || !MatchMode::is_agg_servable(query.match_mode.as_deref());
    if unsupported {
        return None;
    }
    // Without a hero, the base query reads every player of the window too.
    if !PAIRS_AGG.serves(query.min_unix_timestamp, Reach::Unlimited) {
        return None;
    }
    let split = DaySplit::new(query.min_unix_timestamp, query.max_unix_timestamp)?;
    let filters = RollupFilters::new(
        query.game_mode,
        query.match_mode.as_deref(),
        query.min_average_badge,
        query.max_average_badge,
    );
    let source = PAIRS_AGG.source(&split, &filters, "item_a, item_b", pair_rows);
    let having_clause = having_clause(query);
    Some(format!(
        "
        SELECT [item_a, item_b] AS item_ids,
               sum(n_wins) AS wins,
               toUInt64(sum(n_matches) - sum(n_wins)) AS losses,
               sum(n_matches) AS matches
        FROM {source}
        GROUP BY item_a, item_b
        {having_clause}
        ORDER BY matches DESC
        SETTINGS log_comment = 'item_permutation_stats_pairs_mv', apply_patch_parts = 0
        "
    ))
}

/// Rejects queries `build_query` can't serve: a combination needs at least two items.
fn validate_query(query: &ItemPermutationStatsQuery) -> APIResult<()> {
    if query.comb_size.is_some() && query.item_ids.is_some() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Cannot specify both comb_size and item_ids",
        ));
    }
    if query.comb_size.is_some_and(|x| !(2..=12).contains(&x)) {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Combination size must be between 2 and 12",
        ));
    }
    if query
        .item_ids
        .as_ref()
        .is_some_and(|ids| ids.iter().unique().count() < 2)
    {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "At least two distinct item ids must be provided",
        ));
    }
    Ok(())
}

cached_ch_query! {
    fn run_query(3600) -> Vec<ItemPermutationStats>;
}

cached_ch_query! {
    /// [`build_pairs_mv_query`]'s rollup reads, with their own disk directory, metrics label and
    /// timeout cooldowns.
    fn run_rollup_query(3600) -> Vec<ItemPermutationStats>;
}

async fn get_item_permutation_stats(
    ch_client: &clickhouse::Client,
    mut query: ItemPermutationStatsQuery,
) -> APIResult<Vec<ItemPermutationStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let stats = match build_pairs_mv_query(&query) {
        Some(mv_query) => {
            debug!(?mv_query);
            match run_rollup_query(ch_client, &mv_query).await {
                Ok(stats) => Some(stats),
                // A missing or rebuilding rollup never breaks the endpoint; a timeout is not
                // retried, the base table reads far more.
                Err(e) if retry_on_base_table(&e) => {
                    warn!(
                        "item_permutation_stats pairs MV query failed, falling back to base table: {e}"
                    );
                    None
                }
                Err(e) => return Err(e.into()),
            }
        }
        None => None,
    };
    let stats = if let Some(stats) = stats {
        stats
    } else {
        let query_str = build_query(&query);
        debug!(?query_str);
        run_query(ch_client, &query_str).await?
    };
    Ok(stats
        .iter()
        .filter(|s| {
            query.min_matches.is_none_or(|m| s.matches >= u64::from(m))
                && query.max_matches.is_none_or(|m| s.matches <= u64::from(m))
        })
        .cloned()
        .collect())
}

#[utoipa::path(
    get,
    path = "/item-permutation-stats",
    params(ItemPermutationStatsQuery),
    responses(
        (status = OK, description = "Item Permutation Stats", body = [ItemPermutationStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch item permutation stats")
    ),
    tags = ["Analytics"],
    summary = "Item Permutation Stats",
    description = super::describe("
Retrieves item permutation statistics based on historical match data.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

    ")
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
    validate_query(&query)?;
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    get_item_permutation_stats(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::v1::analytics::rollup_window::BUILT_THROUGH;
    use crate::utils::proptest_utils::{assert_parses, assert_valid_sql};

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
            "arraySort(arrayDistinct(arrayFilter((x, u) -> x IN t_upgrades AND bitAnd(u, 8388608) = 0, items.item_id, items.upgrade_info)))"
        ));
        let intersect = build_query(&ItemPermutationStatsQuery {
            item_ids: Some(vec![1, 2]),
            ..Default::default()
        });
        let owned =
            "arrayFilter((x, u) -> bitAnd(u, 8388608) = 0, items.item_id, items.upgrade_info)";
        assert!(intersect.contains(&format!(
            "arraySort(arrayIntersect({owned}, [1, 2])) AS item_ids"
        )));
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
        assert!(combos.contains(
            "arraySort(arrayFilter(x -> x IN t_upgrades, arrayDistinct(items.item_id)))"
        ));
        assert!(!combos.contains("upgrade_info"));
        let intersect = build_query(&ItemPermutationStatsQuery {
            item_ids: Some(vec![1, 2]),
            include_corrupted_items: Some(true),
            ..Default::default()
        });
        assert!(intersect.contains("arraySort(arrayIntersect(items.item_id, [1, 2])) AS item_ids"));
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
                #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
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
    fn query_validation() {
        let valid = |comb_size, item_ids| {
            validate_query(&ItemPermutationStatsQuery {
                item_ids,
                comb_size,
                ..Default::default()
            })
            .is_ok()
        };
        assert!(valid(None, None));
        assert!(valid(Some(2), None));
        assert!(valid(Some(12), None));
        assert!(!valid(Some(0), None));
        assert!(!valid(Some(1), None));
        assert!(!valid(Some(13), None));
        assert!(valid(None, Some(vec![1, 2])));
        assert!(!valid(None, Some(vec![])));
        assert!(!valid(None, Some(vec![1])));
        assert!(!valid(None, Some(vec![1, 1])));
        assert!(!valid(Some(2), Some(vec![1, 2])));
    }

    fn last_week() -> i64 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .cast_signed();
        now - now.rem_euclid(3600) - 7 * 86_400
    }

    #[test]
    fn hero_less_pairs_read_the_pair_rollup() {
        let mv = build_pairs_mv_query(&ItemPermutationStatsQuery {
            game_mode: Some(GameMode::Normal),
            min_unix_timestamp: Some(last_week()),
            min_matches: Some(20),
            ..Default::default()
        })
        .unwrap();
        assert_valid_sql(&mv);
        assert!(mv.contains("FROM default.item_permutation_pairs_agg WHERE game_mode = 1"));
        assert!(mv.contains("GROUP BY item_a, item_b\n        HAVING matches >= 20"));
        assert!(mv.contains("log_comment = 'item_permutation_stats_pairs_mv'"));
        // The base-table rows drop corrupted purchases like the base query's default.
        assert!(mv.contains(&upgrade_positions_sql(false)));
        // No badge filter, so no badge column in the source.
        assert!(!mv.contains("least_badge"));

        let comb_2 = build_pairs_mv_query(&ItemPermutationStatsQuery {
            comb_size: Some(2),
            game_mode: Some(GameMode::Normal),
            min_unix_timestamp: Some(last_week()),
            min_matches: Some(20),
            ..Default::default()
        });
        assert_eq!(comb_2.as_deref(), Some(mv.as_str()));

        let badge = build_pairs_mv_query(&ItemPermutationStatsQuery {
            min_unix_timestamp: Some(last_week()),
            min_average_badge: Some(40),
            max_average_badge: Some(79),
            ..Default::default()
        })
        .unwrap();
        assert_valid_sql(&badge);
        assert!(badge.contains("least_badge >= 40 AND greatest_badge <= 79"));
        assert!(badge.contains("ifNull(average_badge, 0) >= 40"));
        assert!(badge.contains("ifNull(average_badge, 65535) <= 79"));

        let ranked = build_pairs_mv_query(&ItemPermutationStatsQuery {
            min_unix_timestamp: Some(last_week()),
            match_mode: Some(vec![MatchMode::Ranked]),
            ..Default::default()
        })
        .unwrap();
        assert!(ranked.contains("match_mode = 'Ranked'"));
    }

    #[test]
    #[expect(deprecated, reason = "sets the deprecated legacy query parameters")]
    fn pair_rollup_declines_what_its_grain_lacks() {
        let base = ItemPermutationStatsQuery {
            min_unix_timestamp: Some(last_week()),
            ..Default::default()
        };
        let declined = [
            ItemPermutationStatsQuery {
                comb_size: Some(3),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                comb_size: None,
                item_ids: Some(vec![1, 2]),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                hero_ids: Some(vec![7]),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                hero_id: Some(7),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                account_ids: Some(vec![5]),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                account_id: Some(5),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                min_networth: Some(1),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                max_duration_s: Some(1800),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                min_match_id: Some(1),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                ability_order_prefix: Some(vec![1]),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                ability_unlock_order_prefix: Some(vec![1]),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                include_corrupted_items: Some(true),
                ..base.clone()
            },
            ItemPermutationStatsQuery {
                match_mode: Some(vec![MatchMode::PrivateLobby]),
                ..base.clone()
            },
            // No whole day.
            ItemPermutationStatsQuery {
                max_unix_timestamp: base.min_unix_timestamp.map(|min| min + 3600),
                ..base.clone()
            },
        ];
        for query in declined {
            assert!(build_pairs_mv_query(&query).is_none(), "{query:?}");
        }
        assert!(build_pairs_mv_query(&base).is_some());
        assert!(
            build_pairs_mv_query(&ItemPermutationStatsQuery {
                hero_ids: Some(vec![]),
                include_corrupted_items: Some(false),
                ..base
            })
            .is_some()
        );
    }

    #[test]
    fn pair_rollup_rows_match_their_table_columns() {
        let columns = |ddl: &str| {
            ddl.lines()
                .filter_map(|line| line.trim().strip_prefix('`')?.split_once('`'))
                .map(|(col, _)| col.to_owned())
                .collect::<Vec<_>>()
        };
        let expected = PAIRS_AGG
            .grain
            .iter()
            .map(|(col, _)| *col)
            .chain(PAIRS_AGG.measures.split(", "))
            .chain([BUILT_THROUGH])
            .map(str::to_owned)
            .collect::<Vec<_>>();
        for (table, ddl) in [
            (
                PAIRS_AGG_TABLE,
                include_str!("../../../../../db/clickhouse/default/item_permutation_pairs_agg.sql"),
            ),
            (
                PAIRS_AGG_STAGING,
                include_str!(
                    "../../../../../db/clickhouse/default/item_permutation_pairs_agg_staging.sql"
                ),
            ),
        ] {
            assert!(ddl.starts_with(&format!("CREATE TABLE {table}\n")));
            assert_eq!(columns(ddl), expected);
        }
        let body = pairs_agg_select_body("true");
        assert_parses(&body);
        for (col, expr) in PAIRS_AGG.grain {
            assert!(body.contains(&format!("{expr} AS {col},")), "{col}");
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
    use crate::utils::proptest_utils::{assert_valid_sql, dump_sql};

    #[test]
    fn sql_dump() {
        dump_sql("item_permutation_stats", build_query);
    }

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn item_permutation_stats_build_query_is_valid_sql(query: ItemPermutationStatsQuery) {
            prop_assume!(validate_query(&query).is_ok());
            assert_valid_sql(&build_query(&query));
        }

        #[test]
        fn item_permutation_stats_build_pairs_mv_query_is_valid_sql(query: ItemPermutationStatsQuery) {
            prop_assume!(validate_query(&query).is_ok());
            if let Some(mv) = build_pairs_mv_query(&query) {
                assert_valid_sql(&mv);
            }
        }
    }
}
