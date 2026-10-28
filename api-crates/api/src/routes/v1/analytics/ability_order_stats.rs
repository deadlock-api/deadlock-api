use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    PlayerFilters, account_match_prefilter, filter_protected_accounts, join_filters, range_filters,
    round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{
    comma_separated_deserialize_option, comma_separated_steam_ids_option,
    default_last_month_timestamp, parse_steam_id_option,
};
use crate::utils::sql::{cached_ch_query, impl_match_info};

fn default_min_matches() -> Option<u32> {
    10.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct AbilityOrderStatsQuery {
    /// See more: <https://api.deadlock-api.com/v1/assets/heroes>
    hero_id: u32,
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
    /// Filter players based on their minimum number of ability upgrades over the whole match.
    #[param(minimum = 0, maximum = 16)]
    min_ability_upgrades: Option<u64>,
    /// Filter players based on their maximum number of ability upgrades over the whole match.
    #[param(minimum = 1, maximum = 16)]
    max_ability_upgrades: Option<u64>,
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
    /// The minimum number of matches played for an ability order (on `/ability-order-tree`: an order prefix, on `/ability-max-first-stats`: an ability) to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 10)]
    min_matches: Option<u32>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_steam_ids_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
    /// Only players who started the match with this hero build selected. Matches without a processed demo record no
    /// build. See more: <https://api.deadlock-api.com/v1/analytics/hero-build-stats/{hero_id}>
    hero_build_id: Option<u64>,
    /// Comma separated list of item ids to include (only players who have purchased these items). See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only players who have not purchased these items). See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    exclude_item_ids: Option<Vec<u32>>,
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
}

impl_match_info!(AbilityOrderStatsQuery);

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct AnalyticsAbilityOrderStats {
    /// See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub abilities: Vec<u32>,
    /// Average game time (in seconds) at which each upgrade in `abilities` was bought, index-aligned with `abilities`.
    pub avg_upgrade_times_s: Vec<f64>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
}

/// One node of the ability order tree: the players whose upgrade order starts with `abilities`.
#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct AnalyticsAbilityOrderTreeNode {
    /// The order prefix: one entry per ability point spent, unlocks included. Its parent node is the prefix one
    /// entry shorter. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub abilities: Vec<u32>,
    /// Average game time (in seconds) at which the last upgrade in `abilities` was bought.
    pub avg_upgrade_time_s: f64,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    /// Distinct players, counted exactly.
    players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
}

/// The players who maxed one ability first, or (`ability_id` null) none.
#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct AnalyticsAbilityMaxFirstStats {
    /// The ability these players maxed first (unlocked and upgraded three times before any other), null for the
    /// players who maxed none. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub ability_id: Option<u32>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    /// Distinct players, counted exactly.
    players: u64,
}

/// The `WHERE` clause of all three endpoints: the hero's matches and players that pass the filters.
fn where_clause(query: &AbilityOrderStatsQuery) -> String {
    let info_filters = query.match_info();
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    let player_filter_inputs = PlayerFilters {
        hero_id: Some(query.hero_id),
        account_id: query.account_id,
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
        ability_order_prefix: query.ability_order_prefix.as_deref(),
        ability_unlock_order_prefix: query.ability_unlock_order_prefix.as_deref(),
        hero_build_id: query.hero_build_id,
        ..Default::default()
    };
    let mut player_filters = player_filter_inputs.build();
    player_filters.extend(account_match_prefilter(
        player_filter_inputs,
        &info_filters,
        &match_mode_filter,
        &game_mode_filter,
    ));
    let info_filters = info_filters.build();
    player_filters.extend(range_filters(
        "length(abilities)",
        query.min_ability_upgrades,
        query.max_ability_upgrades,
    ));
    format!(
        "{match_mode_filter} AND {game_mode_filter} {info_filters} {}",
        join_filters(&player_filters)
    )
}

fn build_query(query: &AbilityOrderStatsQuery) -> String {
    let where_clause = where_clause(query);
    format!(
        "
    SELECT
        abilities,
        avgForEach(arrayFilter(
            (t, x) -> dictHas('default.ability_items_dict', toUInt64(x)),
            items.game_time_s,
            items.item_id
        )) AS avg_upgrade_times_s,
        countIf(won) AS wins,
        countIf(not won) AS losses,
        wins + losses AS matches,
        uniq(account_id) AS players,
        sum(kills) AS total_kills,
        sum(deaths) AS total_deaths,
        sum(assists) AS total_assists
    FROM match_player
    WHERE {where_clause}
    GROUP BY abilities
    HAVING matches >= {}
    ORDER BY matches DESC
    SETTINGS log_comment = 'ability_order_stats', apply_patch_parts = 0
    ",
        query.min_matches.unwrap_or_default()
    )
}

/// Street brawl hands out ability points in blocks (6, 6, then 5 each); an upgrade costs 1, 2 then 5 points. The
/// order within a block is the player's click order, not a choice, so each block is sorted by ability id. Yields the
/// block index of each upgrade in `full_order`.
const STREET_BRAWL_BLOCKS: &str = "arrayFold(
    (acc, cost) -> if(acc.2 + cost >= if(acc.1 < 2, 6, 5),
        (toUInt32(acc.1 + 1), toUInt32(0), arrayPushBack(acc.3, acc.1)),
        (acc.1, toUInt32(acc.2 + cost), arrayPushBack(acc.3, acc.1))),
    arrayMap(i -> [1, 2, 5][least(countEqual(arraySlice(full_order, 1, i - 1), full_order[i]), 2) + 1], arrayEnumerate(full_order)),
    (toUInt32(0), toUInt32(0), CAST([], 'Array(UInt32)'))
).3";

/// The player's upgrade order `full_order`, with street brawl's blocks sorted.
fn upgrade_order(query: &AbilityOrderStatsQuery) -> String {
    if query.game_mode == Some(GameMode::StreetBrawl) {
        format!(
            "arraySort((x, b, i) -> (b, x, i), full_order, {STREET_BRAWL_BLOCKS}, arrayEnumerate(full_order))"
        )
    } else {
        "full_order".to_owned()
    }
}

/// Aggregates the players per order first (few distinct orders), then fans each order out into its prefixes, so
/// `min_matches` applies per node instead of dropping every player whose full order is rare.
///
/// `abilities` was materialized with the ability dict of its insert, and today's dict finds other upgrades in a few old
/// rows (mostly empty orders; 34 non-empty ones this season), so the upgrade times are resized to the order's length.
fn build_tree_query(query: &AbilityOrderStatsQuery) -> String {
    let where_clause = where_clause(query);
    let upgrade_order = upgrade_order(query);
    let upgrade_time_sums = if query.game_mode == Some(GameMode::StreetBrawl) {
        format!(
            "arraySort((t, x, b, i) -> (b, x, i), time_sums, full_order, {STREET_BRAWL_BLOCKS}, arrayEnumerate(full_order))"
        )
    } else {
        "time_sums".to_owned()
    };
    format!(
        "
    SELECT
        arraySlice(upgrade_order, 1, depth) AS abilities,
        sum(upgrade_time_sums[depth]) / matches AS avg_upgrade_time_s,
        sum(order_wins) AS wins,
        sum(order_losses) AS losses,
        wins + losses AS matches,
        uniqExactMerge(order_players) AS players,
        sum(order_kills) AS total_kills,
        sum(order_deaths) AS total_deaths,
        sum(order_assists) AS total_assists
    FROM (
        SELECT
            {upgrade_order} AS upgrade_order,
            {upgrade_time_sums} AS upgrade_time_sums,
            order_wins, order_losses, order_players, order_kills, order_deaths, order_assists
        FROM (
            SELECT
                abilities AS full_order,
                sumForEach(arrayResize(arrayFilter(
                    (t, x) -> dictHas('default.ability_items_dict', toUInt64(x)),
                    items.game_time_s,
                    items.item_id
                ), length(abilities))) AS time_sums,
                countIf(won) AS order_wins,
                countIf(not won) AS order_losses,
                uniqExactState(account_id) AS order_players,
                sum(kills) AS order_kills,
                sum(deaths) AS order_deaths,
                sum(assists) AS order_assists
            FROM match_player
            WHERE {where_clause}
            GROUP BY full_order
        )
    )
    ARRAY JOIN arrayEnumerate(upgrade_order) AS depth
    GROUP BY abilities
    HAVING matches >= {}
    ORDER BY matches DESC
    SETTINGS log_comment = 'ability_order_tree', apply_patch_parts = 0
    ",
        query.min_matches.unwrap_or_default()
    )
}

/// Aggregates the players per order first, then finds the ability each order maxes first: the first one whose upgrade
/// is its fourth (unlock and three upgrades). Every player counts, in one row: `min_matches` never drops the players
/// who maxed none.
fn build_max_first_query(query: &AbilityOrderStatsQuery) -> String {
    let where_clause = where_clause(query);
    let upgrade_order = upgrade_order(query);
    format!(
        "
    SELECT
        nullIf(upgrade_order[arrayFirstIndex(
            i -> countEqual(arraySlice(upgrade_order, 1, i), upgrade_order[i]) = {MAXED_UPGRADES},
            arrayEnumerate(upgrade_order)
        )], 0) AS ability_id,
        sum(order_wins) AS wins,
        sum(order_losses) AS losses,
        wins + losses AS matches,
        uniqExactMerge(order_players) AS players
    FROM (
        SELECT
            {upgrade_order} AS upgrade_order,
            order_wins, order_losses, order_players
        FROM (
            SELECT
                abilities AS full_order,
                countIf(won) AS order_wins,
                countIf(not won) AS order_losses,
                uniqExactState(account_id) AS order_players
            FROM match_player
            WHERE {where_clause}
            GROUP BY full_order
        )
    )
    GROUP BY ability_id
    HAVING matches >= {} OR ability_id IS NULL
    ORDER BY matches DESC
    SETTINGS log_comment = 'ability_max_first_stats', apply_patch_parts = 0
    ",
        query.min_matches.unwrap_or_default()
    )
}

/// An ability is maxed by its unlock and three upgrades.
const MAXED_UPGRADES: u32 = 4;

cached_ch_query! {
    fn run_query(3600) -> Vec<AnalyticsAbilityOrderStats>;
}

cached_ch_query! {
    fn run_max_first_query(3600) -> Vec<AnalyticsAbilityMaxFirstStats>;
}

cached_ch_query! {
    fn run_tree_query(3600) -> Vec<AnalyticsAbilityOrderTreeNode>;
}

async fn get_ability_order_stats(
    ch_client: &clickhouse::Client,
    mut query: AbilityOrderStatsQuery,
) -> APIResult<Arc<Vec<AnalyticsAbilityOrderStats>>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
}

async fn validate_query(state: &AppState, query: &mut AbilityOrderStatsQuery) -> APIResult<()> {
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    filter_protected_accounts(state, &mut query.account_ids, query.account_id).await?;
    if !state.assets_client.validate_hero_id(query.hero_id).await {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Invalid hero_id: {}", query.hero_id),
        ));
    }
    Ok(())
}

#[utoipa::path(
    get,
    path = "/ability-order-stats",
    params(AbilityOrderStatsQuery),
    responses(
        (status = OK, description = "Ability Order Stats", body = [AnalyticsAbilityOrderStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch ability order stats")
    ),
    tags = ["Analytics"],
    summary = "Ability Order Stats",
    description = super::describe("
Retrieves statistics for the ability order of a hero.

    ")
)]
pub(super) async fn ability_order_stats(
    Query(mut query): Query<AbilityOrderStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    validate_query(&state, &mut query).await?;
    get_ability_order_stats(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/ability-order-tree",
    params(AbilityOrderStatsQuery),
    responses(
        (status = OK, description = "Ability Order Tree", body = [AnalyticsAbilityOrderTreeNode]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch the ability order tree")
    ),
    tags = ["Analytics"],
    summary = "Ability Order Tree",
    description = super::describe("
Retrieves the ability upgrade orders of a hero as a tree: one node per order prefix, with the stats of every player
whose order starts with it. `min_matches` applies to each node, so a node counts all its players even when their full
orders are rare (which `/ability-order-stats`, grouping by full order, leaves out). A node's parent is always present.

In `street_brawl`, ability points come in blocks, and the upgrades within one block are sorted by ability id.

    ")
)]
pub(super) async fn ability_order_tree(
    Query(mut query): Query<AbilityOrderStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    validate_query(&state, &mut query).await?;
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_tree_query(&query);
    debug!(?query_str);
    Ok(Json(run_tree_query(&state.ch_client_ro, &query_str).await?))
}

#[utoipa::path(
    get,
    path = "/ability-max-first-stats",
    params(AbilityOrderStatsQuery),
    responses(
        (status = OK, description = "Ability Max First Stats", body = [AnalyticsAbilityMaxFirstStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch ability max first stats")
    ),
    tags = ["Analytics"],
    summary = "Ability Max First Stats",
    description = super::describe("
Retrieves which ability the players of a hero max first: one row per ability, with every player whose upgrade order
unlocks and upgrades it three times before any other ability, and one row (`ability_id` null) for the players who maxed
none. Every player is in exactly one row, so the rows add up to all the hero's players, and `min_matches` never drops
the null row. Unlike summing `/ability-order-tree` nodes, no player is lost to `min_matches` on a rare order.

In `street_brawl`, ability points come in blocks, and the upgrades within one block are sorted by ability id.

    ")
)]
pub(super) async fn ability_max_first_stats(
    Query(mut query): Query<AbilityOrderStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    validate_query(&state, &mut query).await?;
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_max_first_query(&query);
    debug!(?query_str);
    Ok(Json(
        run_max_first_query(&state.ch_client_ro, &query_str).await?,
    ))
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn ability_order_stats_build_query_is_valid_sql(query: AbilityOrderStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }

        #[test]
        fn ability_order_tree_build_query_is_valid_sql(query: AbilityOrderStatsQuery) {
            assert_valid_sql(&build_tree_query(&query));
        }

        #[test]
        fn ability_max_first_build_query_is_valid_sql(query: AbilityOrderStatsQuery) {
            assert_valid_sql(&build_max_first_query(&query));
        }
    }
}
