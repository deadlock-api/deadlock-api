use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::players::mmr::batch::HeroMMRPath;
use crate::routes::v1::players::mmr::mmr_history::{SMOOTHING_FACTOR, WINDOW_SIZE};
use crate::utils::parse::default_last_month_timestamp;

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct MMRDistributionQuery {
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
    /// Filter matches based on whether they are in the high skill range.
    is_high_skill_range_parties: Option<bool>,
    /// Filter matches based on whether they are in the low priority pool.
    is_low_pri_pool: Option<bool>,
    /// Filter matches based on whether they are in the new player pool.
    is_new_player_pool: Option<bool>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
}

#[derive(Debug, Clone, Copy, Row, Serialize, Deserialize, ToSchema)]
pub(super) struct DistributionEntry {
    rank: u8,
    players: u64,
}

/// Filters that live on `match_info` columns and must be applied via a
/// `match_id IN (...)` subquery against `match_info` (or in the original JOIN).
fn build_info_only_filters(query: &MMRDistributionQuery) -> Vec<String> {
    let mut filters = vec![];
    if let Some(max_duration_s) = query.max_duration_s {
        filters.push(format!("duration_s <= {max_duration_s}"));
    }
    if let Some(is_high_skill_range_parties) = query.is_high_skill_range_parties {
        filters.push(format!(
            "is_high_skill_range_parties = {is_high_skill_range_parties}"
        ));
    }
    if let Some(is_low_pri_pool) = query.is_low_pri_pool {
        filters.push(format!("low_pri_pool = {is_low_pri_pool}"));
    }
    if let Some(is_new_player_pool) = query.is_new_player_pool {
        filters.push(format!("new_player_pool = {is_new_player_pool}"));
    }
    filters
}

/// Filters that exist on both tables (or on `player_match_history` directly)
/// and can be applied to `player_match_history` for partition/PK pruning.
fn build_history_filters(query: &MMRDistributionQuery) -> Vec<String> {
    let mut filters = vec![
        "game_mode = 'Normal'".to_owned(),
        "match_mode IN ('Ranked', 'Unranked')".to_owned(),
    ];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        filters.push(format!("match_id <= {max_match_id}"));
    }
    filters
}

fn build_mmr_distribution_query(hero_id: Option<u8>, query: &MMRDistributionQuery) -> String {
    let mut history_filters = build_history_filters(query);
    if let Some(id) = hero_id {
        history_filters.push(format!("hero_id = {id}"));
    }
    let history_where = history_filters.join(" AND ");

    let info_only_filters = build_info_only_filters(query);
    let info_subfilter = if info_only_filters.is_empty() {
        String::new()
    } else {
        // Pre-filter `match_id` via an `IN (...)` subquery against `match_info`.
        // Re-apply the history filters here too (start_time/match_mode/match_id
        // are present in both tables and partition-prune match_info as well).
        let mut info_sq_filters = build_history_filters(query);
        info_sq_filters.extend(info_only_filters);
        format!(
            "AND match_id IN (SELECT match_id FROM match_info WHERE {})",
            info_sq_filters.join(" AND ")
        )
    };

    let min_window = if hero_id.is_some() {
        "window_size"
    } else {
        "window_size / 2"
    };
    let rank_filter = if hero_id.is_none() {
        "WHERE rank BETWEEN 11 AND 116"
    } else {
        ""
    };
    let log_comment = if hero_id.is_some() {
        "mmr_distribution_hero"
    } else {
        "mmr_distribution"
    };

    format!(
        "
    WITH
        {WINDOW_SIZE} AS window_size,
        {SMOOTHING_FACTOR} AS k
    SELECT toUInt8(if(player_score <= 0, 0, 10 * intDiv(player_score - 1, 6) + 11 + modulo(player_score - 1, 6))) AS rank,
           players
    FROM (
        SELECT toUInt32(clamp(
                   dotProduct(mmr_window, arrayMap(t -> pow(k, date_diff('hour', t, latest_start_time)), time_window)) /
                   arraySum(arrayMap(t -> pow(k, date_diff('hour', t, latest_start_time)), time_window)),
                   0, 66
               )) AS player_score,
               uniq(account_id) AS players
        FROM (
            SELECT
                account_id,
                arrayMap(x -> x.2, recent_matches) AS mmr_window,
                arrayMap(x -> x.3, recent_matches) AS time_window,
                arrayMax(time_window) AS latest_start_time
            FROM (
                SELECT
                    account_id,
                    arraySlice(arraySort(x -> -x.1, groupArray((match_id, mmr, start_time))), 1, window_size) AS recent_matches
                FROM (
                    SELECT
                        account_id,
                        match_id,
                        dictGet('match_info_dict', ('start_time', 'average_badge_team0', 'average_badge_team1'), match_id) AS info,
                        info.1 AS start_time,
                        assumeNotNull(if(player_team = 'Team1', info.3, info.2)) AS current_match_badge,
                        (intDiv(current_match_badge, 10) - 1) * 6 + (current_match_badge % 10) AS mmr
                    FROM (
                        SELECT account_id, match_id, player_team
                        FROM player_match_history
                        WHERE {history_where}
                          {info_subfilter}
                    )
                )
                GROUP BY account_id
                HAVING length(recent_matches) >= {min_window}
            )
        )
        GROUP BY player_score
    )
    {rank_filter}
    ORDER BY rank
    SETTINGS log_comment = '{log_comment}'
    "
    )
}

#[utoipa::path(
    get,
    path = "/mmr/distribution",
    params(MMRDistributionQuery),
    responses(
        (status = OK, description = "MMR", body = [DistributionEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch mmr")
    ),
    tags = ["MMR"],
    summary = "MMR Distribution",
    description = "
Player MMR Distribution
",
)]
pub(super) async fn mmr_distribution(
    State(state): State<AppState>,
    Query(query): Query<MMRDistributionQuery>,
) -> APIResult<impl IntoResponse> {
    let query = build_mmr_distribution_query(None, &query);
    debug!(?query);
    Ok(state
        .ch_client_ro
        .query(&query)
        .fetch_all::<DistributionEntry>()
        .await
        .map(Json)?)
}

#[utoipa::path(
    get,
    path = "/mmr/distribution/{hero_id}",
    params(MMRDistributionQuery, HeroMMRPath),
    responses(
        (status = OK, description = "Hero MMR", body = [DistributionEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero mmr")
    ),
    tags = ["MMR"],
    summary = "Hero MMR Distribution",
    description = "
Player Hero MMR Distribution
",
)]
pub(super) async fn hero_mmr_distribution(
    Path(HeroMMRPath { hero_id }): Path<HeroMMRPath>,
    Query(query): Query<MMRDistributionQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let query = build_mmr_distribution_query(Some(hero_id), &query);
    debug!(?query);
    Ok(state
        .ch_client_ro
        .query(&query)
        .fetch_all::<DistributionEntry>()
        .await
        .map(Json)?)
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn mmr_distribution_build_query_is_valid_sql(
            hero_id in any::<Option<u8>>(),
            query: MMRDistributionQuery,
        ) {
            assert_valid_sql(&build_mmr_distribution_query(hero_id, &query));
        }
    }
}
