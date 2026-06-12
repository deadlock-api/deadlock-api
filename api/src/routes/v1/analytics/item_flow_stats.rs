use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TtlCache;
use cached::macros::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, PlayerFilters, filter_protected_accounts, join_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

#[allow(clippy::unnecessary_wraps)]
fn default_min_matches() -> Option<u32> {
    20.into()
}

#[allow(clippy::unnecessary_wraps)]
fn default_phase_interval_s() -> Option<u32> {
    600.into()
}

#[allow(clippy::unnecessary_wraps)]
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
    #[serde(default = "default_min_matches")]
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
}

/// Net-worth-at-buy bucket size (souls) for win-rate standardization.
const NW_BUCKET: u32 = 5000;

/// Normal-mode phase boundaries (seconds): 0-9m, 9-20m, 20-30m, 30m+ — aligned to the stats
/// time-series snapshots that `net_worth_at_buy` is derived from. A purchase at a boundary minute
/// falls into the later phase (`b <= buy_time`).
const TIME_PHASE_BOUNDARIES: &[u32] = &[540, 1200, 1800];
/// Number of normal-mode columns (`TIME_PHASE_BOUNDARIES.len() + 1`).
const TIME_PHASE_COLUMNS: u8 = 4;

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
    /// `[uniqIf(...), ...] AS reached_per_column` over the baseline population for the totals query.
    reached_select: String,
}

/// SQL fragment computing the 0-based street brawl round a purchase at `buy_time_expr` falls into.
/// Uses a strict `<` so a purchase made exactly at a round boundary stays in the ending round.
fn brawl_round_expr(buy_time_expr: &str, round_durations_expr: &str) -> String {
    format!("arrayCount(s -> s < {buy_time_expr}, arrayCumSum({round_durations_expr}))")
}

fn query_parts(query: &ItemFlowStatsQuery) -> QueryParts {
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
    let base_filter_vec = PlayerFilters {
        hero_ids: query.hero_ids.as_deref(),
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
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
    let boundaries_literal = format!(
        "[{}]",
        TIME_PHASE_BOUNDARIES
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(", ")
    );
    // The 0-based column (clamped) a purchase at `buy_time_expr` falls into, matching node placement.
    // `b <= buy_time` puts a boundary minute into the *later* phase (e.g. 9:00 → 9-20m), so a
    // 12-minute purchase lands in 9-20m, never in 0-9m.
    let column_of = |buy_time_expr: &str, round_durations_expr: &str| -> String {
        let raw = if is_brawl {
            brawl_round_expr(buy_time_expr, round_durations_expr)
        } else {
            format!("arrayCount(b -> b <= {buy_time_expr}, {boundaries_literal})")
        };
        format!("toUInt8(least({raw}, {}))", count - 1)
    };

    // Locked build path: each item must have been bought *in* its locked stage column (not merely
    // by that point), so the population matches exactly where the item is shown in the graph.
    let mut locked_clauses = vec![];
    if let (Some(ids), Some(cols)) = (
        query.locked_item_ids.as_ref(),
        query.locked_columns.as_ref(),
    ) {
        for (id, col) in ids.iter().zip(cols.iter()) {
            let purchase_col = column_of("gt", "`street_brawl_rounds.round_duration_s`");
            locked_clauses.push(format!(
                "arrayExists((iid, gt) -> iid = {id} AND gt > 0 AND {purchase_col} = {col}, upgrades.item_id, upgrades.game_time_s)"
            ));
        }
    }
    let locked_predicate = if locked_clauses.is_empty() {
        "1".to_owned()
    } else {
        locked_clauses.join(" AND ")
    };
    let mut player_filter_vec = base_filter_vec.clone();
    player_filter_vec.extend(locked_clauses);

    let player_filters = join_filters(&player_filter_vec);
    let base_player_filters = join_filters(&base_filter_vec);
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_filters =
        format!("match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters}");

    let column_expr = column_of("e.buy_time", "e.round_durations");
    let extra_select = if is_brawl {
        ",\n            `street_brawl_rounds.round_duration_s` AS round_durations".to_owned()
    } else {
        String::new()
    };

    // Distinct baseline games that bought any upgrade in each stage column, as one Array(UInt64).
    let reached_cols = (0..count)
        .map(|c| {
            let purchase_col = column_of("gt", "`street_brawl_rounds.round_duration_s`");
            format!(
                "uniqIf(cityHash64(match_id, account_id), arrayExists(gt -> gt > 0 AND {purchase_col} = {c}, upgrades.game_time_s))"
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    let reached_select = format!("[{reached_cols}] AS reached_per_column");

    QueryParts {
        match_filters,
        player_filters,
        base_player_filters,
        locked_predicate,
        column_expr,
        extra_select,
        reached_select,
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
        reached_select,
        ..
    } = parts;
    format!(
        "
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
        {reached_select}
    FROM match_player
    WHERE {match_filters} {base_player_filters}
    SETTINGS log_comment = 'item_flow_stats_totals', apply_patch_parts = 0
    "
    )
}

/// Per-purchase rows: one row per (player, upgrade purchased) with its phase column assigned.
/// Reads the materialized `upgrades.*` arrays, which are upgrade-only with `buy_time > 0`.
fn purchases_subquery(parts: &QueryParts) -> String {
    let QueryParts {
        match_filters,
        player_filters,
        column_expr,
        extra_select,
        ..
    } = parts;
    format!(
        "
        SELECT
            match_id,
            account_id,
            won,
            kills,
            deaths,
            assists,
            item_id,
            toUInt8(assumeNotNull({column_expr})) AS column
        FROM (
            SELECT match_id, account_id, won, kills, deaths, assists, item_id, buy_time{extra_select}
            FROM match_player
            ARRAY JOIN upgrades.item_id AS item_id, upgrades.game_time_s AS buy_time
            WHERE {match_filters} {player_filters}
                AND buy_time > 0
        ) e
    "
    )
}

fn build_nodes_query(query: &ItemFlowStatsQuery) -> String {
    let parts = query_parts(query);
    let QueryParts {
        match_filters,
        player_filters,
        column_expr,
        extra_select,
        ..
    } = &parts;
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
    // and Wilson CIs.
    format!(
        "
    WITH cells AS (
        SELECT
            column,
            item_id,
            intDiv(nw, {NW_BUCKET}) AS nb,
            countIf(won) AS cwins,
            count()      AS cm,
            uniqState(cityHash64(match_id, account_id)) AS cpl,
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
                toUInt8(assumeNotNull({column_expr})) AS column
            FROM (
                SELECT match_id, account_id, won, kills, deaths, assists, item_id, buy_time, nw{extra_select}
                FROM match_player
                ARRAY JOIN
                    upgrades.item_id AS item_id,
                    upgrades.game_time_s AS buy_time,
                    upgrades.net_worth_at_buy AS nw
                WHERE {match_filters} {player_filters}
                    AND buy_time > 0 AND nw > 0
            ) e
        )
        GROUP BY column, item_id, nb
    ),
    ref AS (SELECT column, nb, sum(cm) AS w FROM cells GROUP BY column, nb)
    SELECT
        column,
        item_id,
        sum(cwins)                  AS wins,
        toUInt64(sum(cm) - sum(cwins)) AS losses,
        sum(cm)                     AS matches,
        uniqMerge(cpl)        AS players,
        sum(ck)               AS total_kills,
        sum(cd)               AS total_deaths,
        sum(ca)               AS total_assists,
        {adjusted_win_rate_expr}       AS adjusted_win_rate,
        sum(cnw) / sum(cm)             AS avg_net_worth_at_buy
    FROM cells INNER JOIN ref USING (column, nb)
    GROUP BY column, item_id
    HAVING matches >= {min_matches}
    ORDER BY column ASC, matches DESC
    SETTINGS log_comment = 'item_flow_stats_nodes', apply_patch_parts = 0
    "
    )
}

fn build_edges_query(query: &ItemFlowStatsQuery) -> String {
    let parts = query_parts(query);
    let purchases = purchases_subquery(&parts);
    let min_matches = query.min_matches.unwrap_or(20);
    // Per player, collect (column, item_id) pairs, then emit one transition per
    // distinct (item in column c) -> (item in column c+1). arrayDistinct dedups
    // within a player so each transition counts at most once per match.
    format!(
        "
    SELECT
        p.1 AS from_column,
        p.2 AS from_item_id,
        p.3 AS to_item_id,
        countIf(won)     AS wins,
        countIf(not won) AS losses,
        wins + losses    AS matches
    FROM (
        SELECT
            won,
            arrayDistinct(arrayFlatten(arrayMap(
                x -> arrayMap(y -> (x.1, x.2, y.2), arrayFilter(y -> y.1 = x.1 + 1, ci)),
                ci
            ))) AS pairs
        FROM (
            SELECT match_id, account_id, won, groupArray((column, item_id)) AS ci
            FROM ({purchases})
            GROUP BY match_id, account_id, won
        )
    )
    ARRAY JOIN pairs AS p
    GROUP BY from_column, from_item_id, to_item_id
    HAVING matches >= {min_matches}
    ORDER BY matches DESC
    SETTINGS log_comment = 'item_flow_stats_edges', apply_patch_parts = 0
    "
    )
}

#[cached(
    ty = "TtlCache<String, Vec<ItemFlowNode>>",
    create = "{ TtlCache::with_ttl(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_nodes_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<ItemFlowNode>> {
    ch_client.query(query_str).fetch_all().await
}

#[cached(
    ty = "TtlCache<String, Vec<ItemFlowEdge>>",
    create = "{ TtlCache::with_ttl(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_edges_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<ItemFlowEdge>> {
    ch_client.query(query_str).fetch_all().await
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
}

#[cached(
    ty = "TtlCache<String, ItemFlowTotalsRow>",
    create = "{ TtlCache::with_ttl(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_totals_query(
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
    let nodes_query = build_nodes_query(&query);
    let edges_query = build_edges_query(&query);
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
        nodes,
        edges,
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
        reached_per_column: totals.reached_per_column,
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
survivorship-selected (e.g. long-game-only) a late stage is.

Results are cached for **1 hour** based on the unique combination of query parameters provided.

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
    if query.game_mode.is_some_and(|g| g == GameMode::StreetBrawl)
        && (query.min_average_badge.is_some() || query.max_average_badge.is_some())
    {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Cannot filter by average badge for street brawl game mode".to_string(),
        });
    }
    let locked_ids_len = query.locked_item_ids.as_ref().map_or(0, Vec::len);
    let locked_cols_len = query.locked_columns.as_ref().map_or(0, Vec::len);
    if locked_ids_len != locked_cols_len {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "locked_item_ids and locked_columns must have the same length",
        ));
    }
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_item_flow_stats(&state.ch_client_cached, query)
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
            assert_valid_sql(&build_nodes_query(&query));
        }

        #[test]
        fn item_flow_stats_build_edges_query_is_valid_sql(query: ItemFlowStatsQuery) {
            assert_valid_sql(&build_edges_query(&query));
        }

        #[test]
        fn item_flow_stats_build_totals_query_is_valid_sql(query: ItemFlowStatsQuery) {
            assert_valid_sql(&build_totals_query(&query_parts(&query)));
        }
    }
}
