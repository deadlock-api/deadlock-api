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
    PlayerFilters, default_min_matches_u32, filter_protected_accounts, is_non_empty, join_filters,
    not_corrupted_sql, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};
use crate::utils::sql::{cached_ch_query, impl_match_info};

fn default_phase_interval_s() -> Option<u32> {
    600.into()
}

fn default_phase_count() -> Option<u8> {
    4.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct ItemFlowStatsQuery {
    /// Deprecated/unused. `normal` mode uses fixed phase boundaries (0-9m, 9-20m, 20-30m, 30m+)
    /// aligned to the stats time-series; `street_brawl` columns are rounds.
    #[serde(default = "default_phase_interval_s")]
    #[param(minimum = 1, default = 600)]
    phase_interval_s: Option<u32>,
    /// Number of columns for `street_brawl` (rounds). Ignored for `normal`, which has fixed time
    /// phases. **Default:** 4.
    #[serde(default = "default_phase_count")]
    #[param(minimum = 2, maximum = 12, default = 4)]
    phase_count: Option<u8>,
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
    /// The minimum number of matches for a node or edge to be included in the response.
    #[serde(default = "default_min_matches_u32")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
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
    /// Comma separated list of item ids forming a "locked" build path. Pairs positionally with
    /// `locked_columns`: the i-th item must have been bought in the i-th `locked_columns` stage.
    /// See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    locked_item_ids: Option<Vec<u32>>,
    /// Comma separated 0-based stage column indices for each `locked_item_ids` entry (time phase for
    /// `normal`, round for `street_brawl`). Must have the same length as `locked_item_ids`.
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    locked_columns: Option<Vec<u32>>,
}

impl_match_info!(ItemFlowStatsQuery);

/// Population-level totals for the (optionally locked) build path.
#[derive(Debug, Clone, Default, Row, Serialize, Deserialize, ToSchema)]
pub struct ItemFlowSummary {
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    pub players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
    /// Average final net worth of the population.
    pub avg_net_worth: f64,
    /// Average match duration (seconds) of the population.
    pub avg_duration_s: f64,
}

/// A single item, aggregated within one column of the flow graph.
#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ItemFlowNode {
    /// The phase column (0-based) the item was bought in.
    pub column: u8,
    /// See more: <https://api.deadlock-api.com/v1/assets/items>
    pub item_id: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    pub players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
    /// Win rate standardized to the stage's net-worth-at-buy distribution, removing the
    /// "richer buyers win more" confound. See the endpoint description.
    pub adjusted_win_rate: f64,
    /// Average net worth of buyers at the moment they bought this item (confound visibility).
    pub avg_net_worth_at_buy: f64,
}

/// A transition between an item in one column and an item in the next column,
/// counted across players who purchased both.
#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ItemFlowEdge {
    /// The column of the source item.
    pub from_column: u8,
    pub from_item_id: u32,
    pub to_item_id: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
}

/// The locked build path without one of its locked items: how the population changes when that
/// item's constraint is dropped and every other one kept.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ItemFlowLeaveOneOut {
    /// The locked item left out. See more: <https://api.deadlock-api.com/v1/assets/items>
    pub item_id: u32,
    /// Its locked stage column.
    pub column: u32,
    pub wins: u64,
    pub matches: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ItemFlowStats {
    pub nodes: Vec<ItemFlowNode>,
    pub edges: Vec<ItemFlowEdge>,
    /// Totals for the locked build-path population (all filters applied). Denominator for pick rate.
    pub summary: ItemFlowSummary,
    /// Totals ignoring the locked build path (item filters only). Denominator for chained pick rate.
    pub baseline: ItemFlowSummary,
    /// Distinct baseline games that bought any upgrade in each stage column (index = column).
    /// `reached / baseline.matches` shows how survivorship-selected a (late) stage is.
    pub reached_per_column: Vec<u64>,
    /// Of `reached_per_column`, the games that were won (index = column). `reached_wins / reached`
    /// is the win rate of games that got that far, the fair baseline for a build ending there.
    #[serde(default)]
    pub reached_wins_per_column: Vec<u64>,
    /// One entry per locked item, in request order: the totals of the locked build path without that
    /// item. `summary` against an entry is what that one item adds to the build. Empty without locks.
    pub leave_one_out: Vec<ItemFlowLeaveOneOut>,
}

/// Net-worth-at-buy bucket size (souls) for win-rate standardization.
const NW_BUCKET: u32 = 5000;

/// Normal-mode phase boundaries (seconds): 0-9m, 9-20m, 20-30m, 30m+ — aligned to the stats
/// time-series snapshots that `net_worth_at_buy` is derived from. A purchase at a boundary minute
/// falls into the later phase (`b <= buy_time`).
const TIME_PHASE_BOUNDARIES: &[u32] = &[540, 1200, 1800];
/// Number of normal-mode columns (`TIME_PHASE_BOUNDARIES.len() + 1`).
const TIME_PHASE_COLUMNS: u8 = 4;

/// `WITH` aliases for the upgrade purchases (upgrade-only, `buy_time > 0`, corrupted purchases
/// excluded; migration 42) and the settings that go with them.
///
/// Hero-filtered queries rebuild them from `items.*`/`stats.*`, which the
/// `item_stats_by_hero_mode_badge_v2` projection holds; the materialized `upgrades.*` columns rule
/// the projection out. Measured on one hero, 7 days: 1/3-1/10 the bytes and 1/3-1/6 the CPU. They
/// also count the few rows whose `upgrades.*` were materialized empty. Without a hero filter the
/// projection can't prune and the rebuild is 25-40% dearer, and street brawl never uses it
/// (`street_brawl_rounds.*` isn't in it), so those read `upgrades.*` from the base table.
fn upgrades_source(query: &ItemFlowStatsQuery, is_brawl: bool) -> (String, &'static str) {
    if is_brawl || !is_non_empty(query.hero_ids.as_deref()) {
        return (
            "WITH
        upgrades.item_id AS upgrade_item_ids,
        upgrades.game_time_s AS upgrade_buy_times,
        upgrades.net_worth_at_buy AS upgrade_net_worths"
                .to_owned(),
            ", optimize_use_projections = 0",
        );
    }
    let keep = format!(
        "dictHas('default.upgrade_items_dict', toUInt64(x)) AND t > 0 AND {}",
        not_corrupted_sql("u")
    );
    (
        format!(
            "WITH
        arrayFilter((x, t, u) -> {keep}, items.item_id, items.game_time_s, items.upgrade_info) AS upgrade_item_ids,
        arrayFilter((t, x, u) -> {keep}, items.game_time_s, items.item_id, items.upgrade_info) AS upgrade_buy_times,
        arrayMap(
            bt -> coalesce(arrayElementOrNull(stats.net_worth, arrayFirstIndex(ts -> ts >= bt, stats.time_stamp_s) - 1), net_worth),
            upgrade_buy_times
        ) AS upgrade_net_worths"
        ),
        "",
    )
}

struct QueryParts {
    match_filters: String,
    /// Player filters including the locked build path.
    player_filters: String,
    /// Player filters excluding the locked build path (for the baseline population).
    base_player_filters: String,
    /// Boolean predicate selecting the locked build-path population (`1` when nothing is locked).
    /// Combined with `base_player_filters` via conditional aggregation for the summary totals.
    locked_predicate: String,
    column_expr: String,
    /// Extra columns to carry into the per-purchase subquery (e.g. street brawl round durations).
    extra_select: String,
    /// `ARRAY JOIN` entry flagging each purchase that is the player's first of that item in its
    /// column (`first = 1`), among those the nodes query keeps; counts the distinct buyers.
    first_purchase: String,
    /// `[...] AS by_column`: per stage column, the distinct items the player bought in it.
    by_column_select: String,
    /// `WITH` entry: the columns of the player's purchases, for the totals query.
    bought_columns: String,
    /// `[countIf(...), ...] AS reached_per_column` over the baseline population for the totals query.
    reached_select: String,
    /// `loo_wins` / `loo_matches` arrays for the totals query: per locked item, the locked population
    /// with every lock but that one.
    leave_one_out_select: String,
    /// See [`upgrades_source`]; goes right before the `SELECT` that reads `match_player`.
    upgrades_with: String,
    /// Appended to the `SETTINGS` of every query.
    extra_settings: &'static str,
}

/// SQL fragment computing the 0-based street brawl round a purchase at `buy_time_expr` falls into.
/// Uses a strict `<` so a purchase made exactly at a round boundary stays in the ending round.
fn brawl_round_expr(buy_time_expr: &str, round_durations_expr: &str) -> String {
    format!("arrayCount(s -> s < {buy_time_expr}, arrayCumSum({round_durations_expr}))")
}

#[allow(clippy::too_many_lines)]
fn query_parts(query: &ItemFlowStatsQuery) -> QueryParts {
    let info_filters = query.match_info().build();
    let base_filter_vec = PlayerFilters {
        hero_ids: query.hero_ids.as_deref(),
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
        ability_order_prefix: query.ability_order_prefix.as_deref(),
        ability_unlock_order_prefix: query.ability_unlock_order_prefix.as_deref(),
        ..Default::default()
    }
    .build();
    // In street brawl, stages are rounds (variable per match) rather than fixed time phases.
    let is_brawl = query.game_mode == Some(GameMode::StreetBrawl);
    let count = if is_brawl {
        query.phase_count.unwrap_or(4).clamp(2, 12)
    } else {
        TIME_PHASE_COLUMNS
    };
    // The 0-based column (clamped) a purchase at `buy_time_expr` falls into, matching node placement.
    // `b <= buy_time` puts a boundary minute into the *later* phase (e.g. 9:00 → 9-20m), so a
    // 12-minute purchase lands in 9-20m, never in 0-9m. Normal mode sums one comparison per boundary
    // (never above `count - 1`) instead of a lambda: it runs once per purchase, ~100M times a week.
    let column_of = |buy_time_expr: &str, round_durations_expr: &str| -> String {
        if is_brawl {
            format!(
                "toUInt8(least({}, {}))",
                brawl_round_expr(buy_time_expr, round_durations_expr),
                count - 1
            )
        } else {
            let raw = TIME_PHASE_BOUNDARIES
                .iter()
                .map(|b| format!("({buy_time_expr} >= {b})"))
                .join(" + ");
            format!("toUInt8({raw})")
        }
    };

    // Locked build path: each item must have been bought *in* its locked stage column (not merely
    // by that point), so the population matches exactly where the item is shown in the graph.
    let purchase_col = column_of("gt", "`street_brawl_rounds.round_duration_s`");
    let locked_clauses = query
        .locked_item_ids
        .iter()
        .flatten()
        .zip(query.locked_columns.iter().flatten())
        .map(|(id, col)| {
            format!(
                "arrayExists((iid, gt) -> iid = {id} AND gt > 0 AND {purchase_col} = {col}, upgrade_item_ids, upgrade_buy_times)"
            )
        })
        .collect_vec();
    // Per locked item, the predicate of all the other locks (`1` when it is the only one).
    let others = (0..locked_clauses.len())
        .map(|skip| {
            let rest = locked_clauses
                .iter()
                .enumerate()
                .filter(|(i, _)| *i != skip)
                .map(|(_, clause)| clause.as_str())
                .collect_vec();
            if rest.is_empty() {
                "1".to_owned()
            } else {
                rest.join(" AND ")
            }
        })
        .collect_vec();
    let leave_one_out_select = if others.is_empty() {
        "CAST([], 'Array(UInt64)') AS loo_wins, CAST([], 'Array(UInt64)') AS loo_matches".to_owned()
    } else {
        format!(
            "[{}] AS loo_wins, [{}] AS loo_matches",
            others
                .iter()
                .map(|p| format!("countIf(won AND ({p}))"))
                .join(", "),
            others.iter().map(|p| format!("countIf({p})")).join(", "),
        )
    };
    let locked_predicate = if locked_clauses.is_empty() {
        "1".to_owned()
    } else {
        locked_clauses.join(" AND ")
    };
    let base_player_filters = join_filters(&base_filter_vec);
    let player_filters = base_player_filters.clone() + &join_filters(&locked_clauses);
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    let match_filters = format!("{match_mode_filter} AND {game_mode_filter} {info_filters}");

    let column_expr = column_of("e.buy_time", "e.round_durations");
    let extra_select = if is_brawl {
        ",\n            `street_brawl_rounds.round_duration_s` AS round_durations".to_owned()
    } else {
        String::new()
    };

    // Purchases the nodes query drops (`buy_time > 0 AND nw > 0`) go to a column of their own, so
    // they never take the first slot of a kept purchase.
    let first_purchase = format!(
        "arrayEnumerateUniq(arrayMap((gt, bnw) -> if(gt > 0 AND bnw > 0, {purchase_col}, 255), upgrade_buy_times, upgrade_net_worths), upgrade_item_ids)"
    );
    let by_column_select = format!(
        "[{}] AS by_column",
        (0..count)
            .map(|c| {
                format!(
                    "arrayDistinct(arrayFilter((iid, gt) -> gt > 0 AND {purchase_col} = {c}, upgrade_item_ids, upgrade_buy_times))"
                )
            })
            .join(", ")
    );
    let bought_columns =
        format!("arrayMap(gt -> {purchase_col}, arrayFilter(gt -> gt > 0, upgrade_buy_times))");
    // Baseline games that bought any upgrade in each stage column, as one Array(UInt64). A row is one
    // player in one match, so a count is the number of games.
    let reached_cols = (0..count)
        .map(|c| format!("countIf(has(bought_columns, {c}))"))
        .join(", ");
    let reached_win_cols = (0..count)
        .map(|c| format!("countIf(won AND has(bought_columns, {c}))"))
        .join(", ");
    let reached_select = format!(
        "[{reached_cols}] AS reached_per_column, [{reached_win_cols}] AS reached_wins_per_column"
    );
    let (upgrades_with, extra_settings) = upgrades_source(query, is_brawl);

    QueryParts {
        match_filters,
        player_filters,
        base_player_filters,
        locked_predicate,
        column_expr,
        extra_select,
        first_purchase,
        by_column_select,
        bought_columns,
        reached_select,
        leave_one_out_select,
        upgrades_with,
        extra_settings,
    }
}

/// Locked-path (`summary`) and baseline totals in a single scan via conditional aggregation.
/// `base_player_filters` restricts the baseline population; `locked_predicate` (a boolean) further
/// restricts it to the locked build path for the `s_*` columns.
fn build_totals_query(parts: &QueryParts) -> String {
    let QueryParts {
        match_filters,
        base_player_filters,
        locked_predicate: lp,
        bought_columns,
        reached_select,
        leave_one_out_select,
        upgrades_with,
        extra_settings,
        ..
    } = parts;
    format!(
        "
    {upgrades_with},
        {bought_columns} AS bought_columns
    SELECT
        countIf(won AND ({lp}))      AS s_wins,
        countIf((not won) AND ({lp})) AS s_losses,
        s_wins + s_losses             AS s_matches,
        uniqIf(account_id, {lp})      AS s_players,
        sumIf(kills, {lp})            AS s_total_kills,
        sumIf(deaths, {lp})           AS s_total_deaths,
        sumIf(assists, {lp})          AS s_total_assists,
        countIf(won)                  AS b_wins,
        countIf(not won)              AS b_losses,
        b_wins + b_losses             AS b_matches,
        uniq(account_id)              AS b_players,
        sum(kills)                    AS b_total_kills,
        sum(deaths)                   AS b_total_deaths,
        sum(assists)                  AS b_total_assists,
        avgIf(net_worth, {lp})        AS s_avg_net_worth,
        avgIf(duration_s, {lp})       AS s_avg_duration_s,
        avg(net_worth)                AS b_avg_net_worth,
        avg(duration_s)               AS b_avg_duration_s,
        {reached_select},
        {leave_one_out_select}
    FROM match_player
    WHERE {match_filters} {base_player_filters}
    SETTINGS log_comment = 'item_flow_stats_totals', apply_patch_parts = 0{extra_settings}
    "
    )
}

fn build_nodes_query(query: &ItemFlowStatsQuery, parts: &QueryParts) -> String {
    let QueryParts {
        match_filters,
        player_filters,
        column_expr,
        extra_select,
        first_purchase,
        upgrades_with,
        extra_settings,
        ..
    } = parts;
    let min_matches = query.min_matches.unwrap_or(20);
    // Net worth resets each round in street brawl, so net-worth-at-buy is not a meaningful
    // "ahead-ness" measure there — fall back to the raw win rate for the adjusted field.
    let adjusted_win_rate_expr = if query.game_mode == Some(GameMode::StreetBrawl) {
        "sum(cwins) / sum(cm)"
    } else {
        "sum(w * (cwins / cm)) / sum(w)"
    };
    // Per (column, item) stats plus a net-worth-standardized win rate: each item's win rate is
    // re-weighted across net-worth-at-buy buckets to the stage-wide net-worth distribution (`ref`),
    // so the "richer buyers win more" confound is removed. Raw wins/matches are kept for pick rate
    // and Wilson CIs. `ref` is a window over `cells`: a join with a second CTE reference would scan
    // `match_player` twice.
    format!(
        "
    WITH cells AS (
        SELECT
            column,
            item_id,
            intDiv(nw, {NW_BUCKET}) AS nb,
            countIf(won) AS cwins,
            count()      AS cm,
            countIf(first) AS cpl,
            sum(kills)   AS ck,
            sum(deaths)  AS cd,
            sum(assists) AS ca,
            sum(nw)      AS cnw
        FROM (
            SELECT
                match_id,
                account_id,
                won,
                kills,
                deaths,
                assists,
                item_id,
                nw,
                first,
                toUInt8(assumeNotNull({column_expr})) AS column
            FROM (
                {upgrades_with}
                SELECT match_id, account_id, won, kills, deaths, assists, item_id, buy_time, nw, first = 1 AS first{extra_select}
                FROM match_player
                ARRAY JOIN
                    upgrade_item_ids AS item_id,
                    upgrade_buy_times AS buy_time,
                    upgrade_net_worths AS nw,
                    {first_purchase} AS first
                WHERE {match_filters} {player_filters}
                    AND buy_time > 0 AND nw > 0
            ) e
        )
        GROUP BY column, item_id, nb
    )
    SELECT
        column,
        item_id,
        sum(cwins)                  AS wins,
        toUInt64(sum(cm) - sum(cwins)) AS losses,
        sum(cm)                     AS matches,
        sum(cpl)              AS players,
        sum(ck)               AS total_kills,
        sum(cd)               AS total_deaths,
        sum(ca)               AS total_assists,
        {adjusted_win_rate_expr}       AS adjusted_win_rate,
        sum(cnw) / sum(cm)             AS avg_net_worth_at_buy
    FROM (SELECT *, sum(cm) OVER (PARTITION BY column, nb) AS w FROM cells)
    GROUP BY column, item_id
    HAVING matches >= {min_matches}
    ORDER BY column ASC, matches DESC
    SETTINGS log_comment = 'item_flow_stats_nodes', apply_patch_parts = 0{extra_settings}
    "
    )
}

fn build_edges_query(query: &ItemFlowStatsQuery, parts: &QueryParts) -> String {
    let QueryParts {
        match_filters,
        player_filters,
        by_column_select,
        upgrades_with,
        extra_settings,
        ..
    } = parts;
    let min_matches = query.min_matches.unwrap_or(20);
    // Per player, the distinct items of each column; one transition per item in column c and item
    // in column c+1, so each counts at most once per match. Read straight off the player's row: an
    // ARRAY JOIN regrouped by player held every purchase in one hash table (~20 GiB for a season).
    format!(
        "
    SELECT
        from_column,
        from_item_id,
        to_item_id,
        countIf(won)     AS wins,
        countIf(not won) AS losses,
        wins + losses    AS matches
    FROM (
        {upgrades_with}
        SELECT won, {by_column_select}
        FROM match_player
        WHERE {match_filters} {player_filters}
    )
    ARRAY JOIN arrayPopBack(arrayEnumerate(by_column)) AS i
    ARRAY JOIN by_column[i] AS from_item_id
    ARRAY JOIN by_column[i + 1] AS to_item_id
    GROUP BY toUInt8(i - 1) AS from_column, from_item_id, to_item_id
    HAVING matches >= {min_matches}
    ORDER BY matches DESC
    SETTINGS log_comment = 'item_flow_stats_edges', apply_patch_parts = 0{extra_settings}
    "
    )
}

cached_ch_query! {
    fn run_nodes_query(5_000, 21600) -> Vec<ItemFlowNode>;
}

cached_ch_query! {
    fn run_edges_query(5_000, 21600) -> Vec<ItemFlowEdge>;
}

/// Combined locked-path + baseline totals, one row.
#[derive(Debug, Clone, Default, Row, Deserialize)]
struct ItemFlowTotalsRow {
    s_wins: u64,
    s_losses: u64,
    s_matches: u64,
    s_players: u64,
    s_total_kills: u64,
    s_total_deaths: u64,
    s_total_assists: u64,
    b_wins: u64,
    b_losses: u64,
    b_matches: u64,
    b_players: u64,
    b_total_kills: u64,
    b_total_deaths: u64,
    b_total_assists: u64,
    s_avg_net_worth: f64,
    s_avg_duration_s: f64,
    b_avg_net_worth: f64,
    b_avg_duration_s: f64,
    reached_per_column: Vec<u64>,
    #[serde(default)]
    reached_wins_per_column: Vec<u64>,
    loo_wins: Vec<u64>,
    loo_matches: Vec<u64>,
}

cached_ch_query! {
    fn run_totals_query(5_000, 21600) -> ItemFlowTotalsRow = fetch_totals;
}

async fn fetch_totals(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<ItemFlowTotalsRow> {
    Ok(ch_client
        .query(query_str)
        .fetch_all::<ItemFlowTotalsRow>()
        .await?
        .into_iter()
        .next()
        .unwrap_or_default())
}

async fn get_item_flow_stats(
    ch_client: &clickhouse::Client,
    mut query: ItemFlowStatsQuery,
) -> APIResult<ItemFlowStats> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let parts = query_parts(&query);
    // The locks in request order, which `leave_one_out` follows.
    let locked_ids = query.locked_item_ids.clone().unwrap_or_default();
    let locked_columns = query.locked_columns.clone().unwrap_or_default();
    let nodes_query = build_nodes_query(&query, &parts);
    let edges_query = build_edges_query(&query, &parts);
    let totals_query = build_totals_query(&parts);
    debug!(?nodes_query, ?edges_query, ?totals_query);
    let (nodes, edges, totals) = tokio::try_join!(
        run_nodes_query(ch_client, &nodes_query),
        run_edges_query(ch_client, &edges_query),
        run_totals_query(ch_client, &totals_query),
    )?;
    // avgIf over an empty population yields NaN; JSON can't represent it, so coalesce to 0.
    let finite = |v: f64| if v.is_finite() { v } else { 0.0 };
    Ok(ItemFlowStats {
        nodes: Arc::unwrap_or_clone(nodes),
        edges: Arc::unwrap_or_clone(edges),
        summary: ItemFlowSummary {
            wins: totals.s_wins,
            losses: totals.s_losses,
            matches: totals.s_matches,
            players: totals.s_players,
            total_kills: totals.s_total_kills,
            total_deaths: totals.s_total_deaths,
            total_assists: totals.s_total_assists,
            avg_net_worth: finite(totals.s_avg_net_worth),
            avg_duration_s: finite(totals.s_avg_duration_s),
        },
        baseline: ItemFlowSummary {
            wins: totals.b_wins,
            losses: totals.b_losses,
            matches: totals.b_matches,
            players: totals.b_players,
            total_kills: totals.b_total_kills,
            total_deaths: totals.b_total_deaths,
            total_assists: totals.b_total_assists,
            avg_net_worth: finite(totals.b_avg_net_worth),
            avg_duration_s: finite(totals.b_avg_duration_s),
        },
        leave_one_out: locked_ids
            .iter()
            .zip(&locked_columns)
            .zip(totals.loo_wins.iter().zip(&totals.loo_matches))
            .map(
                |((&item_id, &column), (&wins, &matches))| ItemFlowLeaveOneOut {
                    item_id,
                    column,
                    wins,
                    matches,
                },
            )
            .collect(),
        reached_per_column: totals.reached_per_column,
        reached_wins_per_column: totals.reached_wins_per_column,
    })
}

#[utoipa::path(
    get,
    path = "/item-flow-stats",
    params(ItemFlowStatsQuery),
    responses(
        (status = OK, description = "Item Flow Stats", body = ItemFlowStats),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch item flow stats")
    ),
    tags = ["Analytics"],
    summary = "Item Flow Stats",
    description = "
Retrieves item build-flow statistics: per-phase item win/pick rates and the transitions between them.

Items are grouped into columns by the in-match phase they were bought in (controlled by
`phase_interval_s` and `phase_count`). The response contains `nodes` (items aggregated within a phase)
and `edges` (transitions between an item and items in the next phase). A locked build path can be
supplied via `locked_item_ids` / `locked_columns` to restrict the population to players who bought
those items in the given stage columns.

Each node also carries `adjusted_win_rate`: the item's win rate standardized to the stage's
net-worth-at-buy distribution. Because players who are already ahead have more souls and buy items
sooner, raw win rate is heavily confounded by wealth; the adjusted figure re-weights each item's win
rate across net-worth buckets to the stage-wide distribution, isolating the item's contribution from
the buyer's lead. It is still observational, not a controlled/causal estimate. `reached_per_column`
gives the distinct baseline games that bought any upgrade in each column, so consumers can show how
survivorship-selected (e.g. long-game-only) a late stage is; `reached_wins_per_column` counts the won
ones among them, the win rate a build ending in that stage should be compared with.

Corrupted items (build 6712+, same item id as the normal item) are not counted as purchases; the
normal item they replaced still is.

Results are cached for **6 hours** based on the unique combination of query parameters provided.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(super) async fn item_flow_stats(
    Query(mut query): Query<ItemFlowStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    let locked_ids_len = query.locked_item_ids.as_ref().map_or(0, Vec::len);
    let locked_cols_len = query.locked_columns.as_ref().map_or(0, Vec::len);
    if locked_ids_len != locked_cols_len {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "locked_item_ids and locked_columns must have the same length",
        ));
    }
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_item_flow_stats(&state.ch_client_ro, query)
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
        fn item_flow_stats_build_nodes_query_is_valid_sql(query: ItemFlowStatsQuery) {
            assert_valid_sql(&build_nodes_query(&query, &query_parts(&query)));
        }

        #[test]
        fn item_flow_stats_build_edges_query_is_valid_sql(query: ItemFlowStatsQuery) {
            assert_valid_sql(&build_edges_query(&query, &query_parts(&query)));
        }

        #[test]
        fn item_flow_stats_build_totals_query_is_valid_sql(query: ItemFlowStatsQuery) {
            assert_valid_sql(&build_totals_query(&query_parts(&query)));
        }
    }
}
