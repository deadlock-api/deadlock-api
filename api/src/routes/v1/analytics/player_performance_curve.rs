use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
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
fn default_resolution() -> Option<u8> {
    10.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct PlayerPerformanceCurveQuery {
    /// Resolution for relative game times in percent (0-100).
    /// **Default:** 10 (buckets of 10%).
    /// Set to **0** to use absolute game time (seconds).
    #[param(minimum = 0, maximum = 100, default = 10)]
    #[serde(default = "default_resolution")]
    resolution: Option<u8>,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(
        default = "GameMode::default_option",
        deserialize_with = "GameMode::deserialize_option"
    )]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
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
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to include (only players who have purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only players who have not purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    exclude_item_ids: Option<Vec<u32>>,
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
pub struct PlayerPerformanceCurvePoint {
    /// The time point of the data.
    /// If `resolution` (default 10) is > 0, this is a percentage (0, 10, ..., 100).
    /// If `resolution` is 0, this is the match time in seconds.
    pub game_time: u32,
    /// Average net worth at this time point
    pub net_worth_avg: f64,
    /// Standard deviation of net worth at this time point
    pub net_worth_std: f64,
    /// Average kills at this time point
    pub kills_avg: f64,
    /// Standard deviation of kills at this time point
    pub kills_std: f64,
    /// Average deaths at this time point
    pub deaths_avg: f64,
    /// Standard deviation of deaths at this time point
    pub deaths_std: f64,
    /// Average assists at this time point
    pub assists_avg: f64,
    /// Standard deviation of assists at this time point
    pub assists_std: f64,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &PlayerPerformanceCurveQuery) -> String {
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
    let player_filters = join_filters(
        &PlayerFilters {
            hero_ids: query.hero_ids.as_deref(),
            account_ids: query.account_ids.as_deref(),
            min_networth: query.min_networth,
            max_networth: query.max_networth,
            include_item_ids: query.include_item_ids.as_deref(),
            exclude_item_ids: query.exclude_item_ids.as_deref(),
            ..Default::default()
        }
        .build(),
    );

    let resolution = query.resolution.unwrap_or(10);
    let (game_time_selection, additional_filter) = if resolution == 0 {
        (
            "toUInt32(timestamp_s)".to_string(),
            "WHERE (timestamp_s >= 180) AND ((timestamp_s <= 900 AND timestamp_s % 180 = 0) OR (timestamp_s > 900 AND timestamp_s % 300 = 0))",
        )
    } else {
        (
            format!(
                "toUInt32(floor((timestamp_s / duration_s) * (100 / {resolution})) * {resolution})"
            ),
            "",
        )
    };

    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    format!(
        "
    WITH t_players AS (
            SELECT stats.time_stamp_s as timestamp_s, stats.net_worth as net_worths, stats.kills as kills_arr, stats.deaths as deaths_arr, stats.assists as assists_arr, duration_s
            FROM match_player
            WHERE match_mode IN ('Ranked', 'Unranked')
                AND {game_mode_filter}
                {info_filters}
                {player_filters}
        ),
        t_data AS (
            SELECT timestamp_s, net_worths as net_worth, kills_arr as kills, deaths_arr as deaths, assists_arr as assists, duration_s
            FROM t_players
            ARRAY JOIN timestamp_s, net_worths, kills_arr, deaths_arr, assists_arr
        )
    SELECT
        {game_time_selection} AS game_time,
        avg(net_worth) AS net_worth_avg,
        std(net_worth) AS net_worth_std,
        avg(kills) AS kills_avg,
        std(kills) AS kills_std,
        avg(deaths) AS deaths_avg,
        std(deaths) AS deaths_std,
        avg(assists) AS assists_avg,
        std(assists) AS assists_std
    FROM t_data
    {additional_filter}
    GROUP BY game_time
    ORDER BY game_time
    SETTINGS log_comment = 'player_performance_curve'
    "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<PlayerPerformanceCurvePoint>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<PlayerPerformanceCurvePoint>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_player_performance_curve(
    ch_client: &clickhouse::Client,
    mut query: PlayerPerformanceCurveQuery,
) -> APIResult<Vec<PlayerPerformanceCurvePoint>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    let rows = run_query(ch_client, &query_str).await?;
    Ok(rows)
}

#[utoipa::path(
    get,
    path = "/player-performance-curve",
    params(PlayerPerformanceCurveQuery),
    responses(
        (status = OK, description = "Player Performance Curve", body = [PlayerPerformanceCurvePoint]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch player performance curve")
    ),
    tags = ["Analytics"],
    summary = "Player Performance Curve",
    description = "
Retrieves player performance statistics (net worth, kills, deaths, assists) over time throughout matches.

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
pub(crate) async fn player_performance_curve(
    Query(mut query): Query<PlayerPerformanceCurveQuery>,
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
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_player_performance_curve(&state.ch_client_ro, query)
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
        fn player_performance_curve_build_query_is_valid_sql(query: PlayerPerformanceCurveQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
