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
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

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

/// How purchases are grouped into the columns of the flow graph.
#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
pub(super) enum FlowGroupBy {
    /// Group items by their shop tier (1-4). Column = item tier.
    #[default]
    Tier,
    /// Group items by the in-match phase they were bought in. Column = phase index.
    Time,
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct ItemFlowStatsQuery {
    /// How to group item purchases into columns. Valid values: `tier`, `time`. **Default:** `tier`.
    #[serde(default)]
    #[param(inline, default = "tier")]
    group_by: FlowGroupBy,
    /// For `group_by=time`: the length of each phase in seconds. **Default:** 600 (10 minutes).
    #[serde(default = "default_phase_interval_s")]
    #[param(minimum = 1, default = 600)]
    phase_interval_s: Option<u32>,
    /// For `group_by=time`: the number of phases (columns). Purchases beyond the last phase are
    /// clamped into it. **Default:** 4.
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
}

/// A single item, aggregated within one column of the flow graph.
#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ItemFlowNode {
    /// The column the item belongs to: its tier (`group_by=tier`) or phase index (`group_by=time`).
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
}

struct QueryParts {
    match_filters: String,
    player_filters: String,
    upgrade_join: String,
    column_expr: String,
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
    #[allow(deprecated)]
    let player_filters = join_filters(
        &PlayerFilters {
            hero_ids: query.hero_ids.as_deref(),
            account_id: query.account_id,
            account_ids: query.account_ids.as_deref(),
            min_networth: query.min_networth,
            max_networth: query.max_networth,
            include_item_ids: query.include_item_ids.as_deref(),
            exclude_item_ids: query.exclude_item_ids.as_deref(),
            ..Default::default()
        }
        .build(),
    );
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_filters =
        format!("match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters}");

    let (upgrade_join, column_expr) = match query.group_by {
        FlowGroupBy::Tier => (
            "INNER JOIN (SELECT id, toUInt8(tier) AS tier FROM items WHERE type = 'upgrade' AND tier IS NOT NULL) t_up ON t_up.id = e.item_id"
                .to_owned(),
            "t_up.tier".to_owned(),
        ),
        FlowGroupBy::Time => {
            let interval = query.phase_interval_s.unwrap_or(600).max(1);
            let count = query.phase_count.unwrap_or(4).clamp(2, 12);
            (
                "INNER JOIN (SELECT id FROM items WHERE type = 'upgrade') t_up ON t_up.id = e.item_id"
                    .to_owned(),
                format!("toUInt8(least(intDiv(e.buy_time, {interval}), {}))", count - 1),
            )
        }
    };

    QueryParts {
        match_filters,
        player_filters,
        upgrade_join,
        column_expr,
    }
}

/// Per-purchase rows: one row per (player, upgrade purchased) with its column assigned.
fn purchases_subquery(parts: &QueryParts) -> String {
    let QueryParts {
        match_filters,
        player_filters,
        upgrade_join,
        column_expr,
    } = parts;
    format!(
        "
        SELECT
            e.match_id    AS match_id,
            e.account_id  AS account_id,
            e.won         AS won,
            e.kills       AS kills,
            e.deaths      AS deaths,
            e.assists     AS assists,
            e.item_id     AS item_id,
            {column_expr} AS column
        FROM (
            SELECT match_id, account_id, won, kills, deaths, assists, item_id, buy_time
            FROM match_player
            ARRAY JOIN items.item_id AS item_id, items.game_time_s AS buy_time
            WHERE {match_filters} {player_filters}
                AND buy_time > 0
        ) e
        {upgrade_join}
    "
    )
}

fn build_nodes_query(query: &ItemFlowStatsQuery) -> String {
    let parts = query_parts(query);
    let purchases = purchases_subquery(&parts);
    let min_matches = query.min_matches.unwrap_or(20);
    format!(
        "
    SELECT
        column,
        item_id,
        countIf(won)     AS wins,
        countIf(not won) AS losses,
        wins + losses    AS matches,
        uniq(account_id) AS players,
        sum(kills)       AS total_kills,
        sum(deaths)      AS total_deaths,
        sum(assists)     AS total_assists
    FROM ({purchases})
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

async fn get_item_flow_stats(
    ch_client: &clickhouse::Client,
    mut query: ItemFlowStatsQuery,
) -> APIResult<ItemFlowStats> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let nodes_query = build_nodes_query(&query);
    let edges_query = build_edges_query(&query);
    debug!(?nodes_query, ?edges_query);
    let (nodes, edges) = tokio::try_join!(
        run_nodes_query(ch_client, &nodes_query),
        run_edges_query(ch_client, &edges_query),
    )?;
    Ok(ItemFlowStats { nodes, edges })
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
Retrieves item build-flow statistics: per-column item win/pick rates and the transitions between them.

Items are grouped into columns either by their shop tier (`group_by=tier`, the default) or by the
in-match phase they were bought in (`group_by=time`). The response contains `nodes` (items aggregated
within a column) and `edges` (transitions between an item and items in the next column).

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
    #[allow(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
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
        #[allow(deprecated)]
        fn item_flow_stats_build_nodes_query_is_valid_sql(query: ItemFlowStatsQuery) {
            assert_valid_sql(&build_nodes_query(&query));
        }

        #[test]
        #[allow(deprecated)]
        fn item_flow_stats_build_edges_query_is_valid_sql(query: ItemFlowStatsQuery) {
            assert_valid_sql(&build_edges_query(&query));
        }
    }
}
