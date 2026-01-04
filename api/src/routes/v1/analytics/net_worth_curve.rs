use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct NetWorthCurveQuery {
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
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    hero_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to include (only heroes who have purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only heroes who have not purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    exclude_item_ids: Option<Vec<u32>>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    account_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct NetWorthCurvePoint {
    /// Percentage interval of match duration (0%, 5%, 10%, ..., 100%)
    pub relative_timestamp: u8,
    /// Average net worth at this timestamp
    pub avg: f64,
    /// Standard deviation of net worth at this timestamp
    pub std: f64,
    /// 1st percentile net worth
    pub percentile1: f64,
    /// 5th percentile net worth
    pub percentile5: f64,
    /// 10th percentile net worth
    pub percentile10: f64,
    /// 25th percentile net worth
    pub percentile25: f64,
    /// 50th percentile net worth
    pub percentile50: f64,
    /// 75th percentile net worth
    pub percentile75: f64,
    /// 90th percentile net worth
    pub percentile90: f64,
    /// 95th percentile net worth
    pub percentile95: f64,
    /// 99th percentile net worth
    pub percentile99: f64,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &NetWorthCurveQuery) -> String {
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
    if let Some(min_badge_level) = query.min_average_badge
        && min_badge_level > 11
    {
        info_filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge
        && max_badge_level < 116
    {
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
    if let Some(hero_ids) = query.hero_ids.as_ref() {
        player_filters.push(format!(
            "hero_id IN ({})",
            hero_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(account_ids) = query.account_ids.as_ref() {
        player_filters.push(format!(
            "account_id IN ({})",
            account_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("net_worth <= {max_networth}"));
    }
    if let Some(include_item_ids) = &query.include_item_ids {
        player_filters.push(format!(
            "hasAll(items.item_id, [{}])",
            include_item_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    if let Some(exclude_item_ids) = &query.exclude_item_ids {
        player_filters.push(format!(
            "not hasAny(items.item_id, [{}])",
            exclude_item_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    let player_filters = if player_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    format!(
        "
    WITH t_matches AS (
            SELECT match_id, duration_s
            FROM match_info
            WHERE match_mode IN ('Ranked', 'Unranked')
                {info_filters}
        ),
        t_players AS (
            SELECT match_id, stats.time_stamp_s as timestamp_s, stats.net_worth as net_worth
            FROM match_player
            WHERE match_id IN (SELECT match_id FROM t_matches)
                {player_filters}
        ),
        t_data AS (
            SELECT tp.timestamp_s as timestamp_s, tp.net_worth as net_worth, tm.duration_s as duration_s
            FROM t_players tp
            JOIN t_matches tm ON tp.match_id = tm.match_id
            ARRAY JOIN timestamp_s, net_worth
        )
    SELECT
        toUInt8(floor((timestamp_s / duration_s) * 20) * 5) AS relative_timestamp,
        avg(net_worth) AS avg,
        std(net_worth) AS std,
        quantilesDD(0.01, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99)(net_worth) AS percentiles
    FROM t_data
    GROUP BY relative_timestamp
    ORDER BY relative_timestamp
    "
    )
}

#[derive(Debug, Clone, Row, Serialize, Deserialize)]
struct NetWorthCurveRow {
    relative_timestamp: u8,
    avg: f64,
    std: f64,
    percentiles: Vec<f64>,
}

#[cached(
    ty = "TimedCache<String, Vec<NetWorthCurveRow>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<NetWorthCurveRow>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_net_worth_curve(
    ch_client: &clickhouse::Client,
    mut query: NetWorthCurveQuery,
) -> APIResult<Vec<NetWorthCurvePoint>> {
    query.min_unix_timestamp = query.min_unix_timestamp.map(|v| v - v % 3600);
    query.max_unix_timestamp = query.max_unix_timestamp.map(|v| v + 3600 - v % 3600);
    let query_str = build_query(&query);
    debug!(?query_str);
    let rows = run_query(ch_client, &query_str).await?;
    Ok(rows
        .into_iter()
        .map(|row| NetWorthCurvePoint {
            relative_timestamp: row.relative_timestamp,
            avg: row.avg,
            std: row.std,
            percentile1: row.percentiles[0],
            percentile5: row.percentiles[1],
            percentile10: row.percentiles[2],
            percentile25: row.percentiles[3],
            percentile50: row.percentiles[4],
            percentile75: row.percentiles[5],
            percentile90: row.percentiles[6],
            percentile95: row.percentiles[7],
            percentile99: row.percentiles[8],
        })
        .collect())
}

#[utoipa::path(
    get,
    path = "/net-worth-curve",
    params(NetWorthCurveQuery),
    responses(
        (status = OK, description = "Net Worth Curve", body = [NetWorthCurvePoint]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch net worth curve")
    ),
    tags = ["Analytics"],
    summary = "Net Worth Curve",
    description = "
Retrieves the net worth distribution over time throughout matches.

Results are cached for **1 hour** based on the unique combination of query parameters provided.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn net_worth_curve(
    Query(mut query): Query<NetWorthCurveQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if let Some(account_ids) = query.account_ids {
        let protected_users = state
            .steam_client
            .get_protected_users(&state.pg_client)
            .await?;
        let filtered_account_ids = account_ids
            .into_iter()
            .filter(|id| !protected_users.contains(id))
            .collect::<Vec<_>>();
        if filtered_account_ids.is_empty() {
            return Err(APIError::protected_user());
        }
        query.account_ids = Some(filtered_account_ids);
    }
    get_net_worth_curve(&state.ch_client_ro, query)
        .await
        .map(Json)
}
