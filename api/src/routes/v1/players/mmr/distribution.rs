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
use crate::routes::v1::players::mmr::apply_mmr_distribution_rate_limits;
use crate::routes::v1::players::mmr::batch::HeroMMRPath;
use crate::routes::v1::players::rank::badge_from_flat_progress_sql;
use crate::services::rate_limiter::extractor::RateLimitKey;
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

fn build_filters(query: &MMRDistributionQuery) -> Vec<String> {
    let mut filters = vec![
        "game_mode = 'Normal'".to_owned(),
        "match_mode = 'Ranked'".to_owned(),
        "player_rank_initial_display_rank > 0".to_owned(),
        "player_rank_final_flat_progress IS NOT NULL".to_owned(),
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

fn build_mmr_distribution_query(hero_id: Option<u8>, query: &MMRDistributionQuery) -> String {
    let mut filters = build_filters(query);
    if let Some(id) = hero_id {
        filters.push(format!("hero_id = {id}"));
    }
    let where_clause = filters.join(" AND ");

    let log_comment = if hero_id.is_some() {
        "mmr_distribution_hero"
    } else {
        "mmr_distribution"
    };

    let badge = badge_from_flat_progress_sql(
        "assumeNotNull(argMax(player_rank_final_flat_progress, match_id))",
        "assumeNotNull(argMax(player_rank_initial_display_rank, match_id))",
    );

    format!(
        "
    SELECT rank, count() AS players
    FROM (
        SELECT toUInt8({badge}) AS rank
        FROM match_player
        WHERE {where_clause}
        GROUP BY account_id
    )
    GROUP BY rank
    ORDER BY rank
    SETTINGS log_comment = '{log_comment}', apply_patch_parts = 0, max_threads = 32
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
    summary = "MMR Distribution (Deprecated)",
    description = "
Deprecated. The MMR estimate is gone, this now counts players by the rank Valve reported at the end
of their latest ranked match within the filtered range.

Use `/v1/analytics/badge-distribution` instead.
",
)]
#[deprecated(note = "use `/v1/analytics/badge-distribution`")]
pub(super) async fn mmr_distribution(
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
    Query(query): Query<MMRDistributionQuery>,
) -> APIResult<impl IntoResponse> {
    apply_mmr_distribution_rate_limits(&state, &rate_limit_key).await?;
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
    summary = "Hero MMR Distribution (Deprecated)",
    description = "
Deprecated. Valve reports a single account-wide rank, not a per-hero one, so this counts players by
the rank they had on their latest ranked match played on that hero.

Use `/v1/analytics/badge-distribution` instead.
",
)]
#[deprecated(note = "use `/v1/analytics/badge-distribution`")]
pub(super) async fn hero_mmr_distribution(
    Path(HeroMMRPath { hero_id }): Path<HeroMMRPath>,
    Query(query): Query<MMRDistributionQuery>,
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
) -> APIResult<impl IntoResponse> {
    apply_mmr_distribution_rate_limits(&state, &rate_limit_key).await?;
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
