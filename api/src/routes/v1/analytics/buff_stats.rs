use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
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
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

/// `buff_type` of the synthetic per-player entry prepended to every row's buff list, whose
/// group carries the denominators (`matches`, `timed_matches`). Never a real buff type.
const ALL_BUFFS_SENTINEL: &str = "__all__";

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct BuffStatsQuery {
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
    /// Filter players based on their final net worth.
    min_networth: Option<u64>,
    /// Filter players based on their final net worth.
    max_networth: Option<u64>,
    /// Comma separated list of hero ids to include. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[param(inline)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
}

/// Per-buff-type aggregate as `ClickHouse` returns it. The sentinel row carries the
/// denominators in `matches_with_pickup` / `timed_matches_with_pickup`.
#[derive(Debug, Clone, Row, Serialize, Deserialize)]
struct BuffStatsRow {
    buff_type: String,
    is_permanent: bool,
    matches_with_pickup: u64,
    timed_matches_with_pickup: u64,
    pickups: u64,
    timed_pickups: u64,
    total_stat_value: f64,
    avg_pickup_time_s: Option<f64>,
    avg_first_pickup_time_s: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub(super) struct AnalyticsBuffStats {
    /// Buff type, e.g. `hp_permanent_pickup_lv2`. Display names, units and colors:
    /// <https://api.deadlock-api.com/v1/assets/misc-entities> (`buff_type_name`).
    buff_type: String,
    /// Whether the buff is permanent. Temporary power-ups never carry pickup timings.
    is_permanent: bool,
    /// Player-matches matching the filters (the same for every buff type). Average pickups
    /// per match: `pickups / matches`.
    matches: u64,
    /// Player-matches with at least one pickup of this buff type.
    matches_with_pickup: u64,
    /// Total pickups of this buff type.
    pickups: u64,
    /// Player-matches matching the filters that record pickup timings (the same for every buff
    /// type): matches since build 6712 (2026-09-29) with at least one timed permanent pickup.
    /// Average stat gained per match: `total_stat_value / timed_matches`.
    timed_matches: u64,
    /// Pickups of this buff type with a recorded game time and stat value (build 6712+).
    timed_pickups: u64,
    /// Sum of the stat values granted by the `timed_pickups`, in the buff type's unit
    /// (`buff_type_value_unit` in the assets).
    total_stat_value: f64,
    /// Average game time (seconds) of the `timed_pickups`, `null` without any.
    avg_pickup_time_s: Option<f64>,
    /// Average game time (seconds) of a player's first pickup of this buff type, over
    /// player-matches with timings, `null` without any.
    avg_first_pickup_time_s: Option<f64>,
}

fn build_query(query: &BuffStatsQuery) -> String {
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
            account_ids: query.account_ids.as_deref(),
            hero_ids: query.hero_ids.as_deref(),
            min_networth: query.min_networth,
            max_networth: query.max_networth,
            ..Default::default()
        }
        .build(),
    );
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    // One scan: every player row gets a sentinel buff entry prepended before the ARRAY JOIN,
    // so the sentinel group counts all player-matches (and those with timings) while the real
    // buff types aggregate alongside. The Nested arrays have one entry per buff type the player
    // picked up, so `count()` per type is the number of player-matches with a pickup.
    format!(
        "
    WITH t_players AS (
        SELECT
            power_up_buffs.type AS types,
            power_up_buffs.value AS vals,
            power_up_buffs.is_permanent AS perms,
            power_up_buffs.pickup_times_s AS times,
            power_up_buffs.pickup_stat_values AS stat_vals,
            first_permanent_buff_time_s IS NOT NULL AS has_timings
        FROM match_player
        WHERE {match_mode_filter}
            AND {game_mode_filter}
            {info_filters}
            {player_filters}
    )
    SELECT
        buff_type,
        any(is_permanent) AS is_permanent,
        count() AS matches_with_pickup,
        countIf(has_timings) AS timed_matches_with_pickup,
        sum(value) AS pickups,
        sum(length(ptimes)) AS timed_pickups,
        sum(arraySum(pstats)) AS total_stat_value,
        if(timed_pickups = 0, NULL, sum(arraySum(ptimes)) / timed_pickups) AS avg_pickup_time_s,
        avgOrNullIf(arrayMin(ptimes), notEmpty(ptimes)) AS avg_first_pickup_time_s
    FROM t_players
    ARRAY JOIN
        arrayConcat(['{ALL_BUFFS_SENTINEL}'], types) AS buff_type,
        arrayConcat([toUInt32(0)], vals) AS value,
        arrayConcat([false], perms) AS is_permanent,
        arrayConcat([emptyArrayUInt32()], times) AS ptimes,
        arrayConcat([emptyArrayFloat32()], stat_vals) AS pstats
    GROUP BY buff_type
    ORDER BY buff_type
    SETTINGS log_comment = 'buff_stats', apply_patch_parts = 0, optimize_use_projections = 0
    "
    )
}

/// Moves the sentinel row's counts into every real buff type row as the shared denominators.
fn into_response(rows: Vec<BuffStatsRow>) -> Vec<AnalyticsBuffStats> {
    let (totals, buffs): (Vec<_>, Vec<_>) = rows
        .into_iter()
        .partition(|r| r.buff_type == ALL_BUFFS_SENTINEL);
    let (matches, timed_matches) = totals.first().map_or((0, 0), |t| {
        (t.matches_with_pickup, t.timed_matches_with_pickup)
    });
    buffs
        .into_iter()
        .map(|r| AnalyticsBuffStats {
            buff_type: r.buff_type,
            is_permanent: r.is_permanent,
            matches,
            matches_with_pickup: r.matches_with_pickup,
            pickups: r.pickups,
            timed_matches,
            timed_pickups: r.timed_pickups,
            total_stat_value: r.total_stat_value,
            avg_pickup_time_s: r.avg_pickup_time_s,
            avg_first_pickup_time_s: r.avg_first_pickup_time_s,
        })
        .collect()
}

#[cached(
    max_size = 1_000,
    ttl_secs = 3600,
    convert = "{ query_str.to_string() }",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<BuffStatsRow>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_buff_stats(
    ch_client: &clickhouse::Client,
    mut query: BuffStatsQuery,
) -> APIResult<Vec<AnalyticsBuffStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(into_response(run_query(ch_client, &query_str).await?))
}

#[utoipa::path(
    get,
    path = "/buff-stats",
    params(BuffStatsQuery),
    responses(
        (status = OK, description = "Buff Stats", body = [AnalyticsBuffStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch buff stats")
    ),
    tags = ["Analytics"],
    summary = "Buff Stats",
    description = "
Retrieves pickup statistics per power-up buff type (e.g. `hp_permanent_pickup_lv2`): how often
players pick each one up and, for matches since build 6712 (2026-09-29), when they pick it up
and how much stat it grants.

Pickup counts cover every match. Pickup times and stat values are only recorded since build
6712, so `timed_matches`, `timed_pickups`, `total_stat_value` and the average times only cover
those matches. Temporary power-ups have no timings.

Buff display names, value units and graph colors: <https://api.deadlock-api.com/v1/assets/misc-entities>

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
pub(crate) async fn buff_stats(
    Query(mut query): Query<BuffStatsQuery>,
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
    get_buff_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    fn row(buff_type: &str, matches_with_pickup: u64, timed: u64) -> BuffStatsRow {
        BuffStatsRow {
            buff_type: buff_type.to_owned(),
            is_permanent: true,
            matches_with_pickup,
            timed_matches_with_pickup: timed,
            pickups: matches_with_pickup * 2,
            timed_pickups: timed,
            total_stat_value: 1.5,
            avg_pickup_time_s: None,
            avg_first_pickup_time_s: None,
        }
    }

    #[test]
    fn sentinel_row_becomes_the_shared_denominators() {
        let out = into_response(vec![
            row(ALL_BUFFS_SENTINEL, 10, 4),
            row("hp_permanent_pickup", 7, 3),
            row("spirit_permanent_pickup_lv2", 2, 0),
        ]);
        assert_eq!(out.len(), 2);
        assert!(out.iter().all(|r| r.matches == 10 && r.timed_matches == 4));
        assert_eq!(out[0].buff_type, "hp_permanent_pickup");
        assert_eq!(out[0].matches_with_pickup, 7);
    }

    #[test]
    fn query_reads_the_nested_buff_columns_in_one_scan() {
        let sql = build_query(&BuffStatsQuery {
            min_unix_timestamp: Some(1_790_121_600),
            hero_ids: Some(vec![15]),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert_eq!(sql.matches("FROM match_player").count(), 1);
        assert!(sql.contains("arrayConcat(['__all__'], types) AS buff_type"));
        assert!(sql.contains("hero_id IN (15)"));
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
        fn buff_stats_build_query_is_valid_sql(query: BuffStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
