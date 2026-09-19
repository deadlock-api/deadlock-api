use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::players::mmr::apply_mmr_distribution_rate_limits;
use crate::routes::v1::players::rank::badge_from_flat_progress_sql;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::parse::default_last_month_timestamp;

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct RankDistributionQuery {
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
pub(crate) struct RankDistributionEntry {
    /// Rank badge, `tier * 10 + subrank`. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    badge: u32,
    /// Rank tier.
    rank: u32,
    /// Sub-rank within the tier.
    subrank: u32,
    /// Number of players whose rank at the end of their latest ranked match in the filtered range is this badge.
    players: u64,
}

fn build_query(query: &RankDistributionQuery) -> String {
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
    if let Some(min_duration_s) = query.min_duration_s {
        filters.push(format!("duration_s >= {min_duration_s}"));
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
    let where_clause = filters.join(" AND ");

    let badge = badge_from_flat_progress_sql(
        "assumeNotNull(argMax(player_rank_final_flat_progress, match_id))",
        "assumeNotNull(argMax(player_rank_initial_display_rank, match_id))",
    );

    format!(
        "
    SELECT
        badge,
        intDiv(badge, 10) AS rank,
        badge % 10 AS subrank,
        count() AS players
    FROM (
        SELECT {badge} AS badge
        FROM match_player
        WHERE {where_clause}
        GROUP BY account_id
    )
    GROUP BY badge
    ORDER BY badge
    SETTINGS log_comment = 'rank_distribution', apply_patch_parts = 0, max_threads = 32
    "
    )
}

#[cached(
    max_size = 1_000,
    ttl_secs = 600,
    convert = "{ query_str.to_string() }",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<RankDistributionEntry>> {
    ch_client.query(query_str).fetch_all().await
}

#[utoipa::path(
    get,
    path = "/rank/distribution",
    params(RankDistributionQuery),
    responses(
        (status = OK, body = [RankDistributionEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch rank distribution")
    ),
    tags = ["Players"],
    summary = "Rank Distribution",
    description = "
Counts players by the rank Valve reported at the end of their latest ranked match within the
filtered range, i.e. the rank `/v1/players/{account_id}/rank` would return for them. Only ranked
matches carry a rank, so the filters only ever select ranked matches, and players still in
placement games are not counted.

`/v1/analytics/badge-distribution` reports the same player counts as `unique_players` next to the
match counts by average badge; use this endpoint when you only need the players.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 5req/min |
| Key | 25req/min |
| Global | 50req/min |
"
)]
pub(super) async fn rank_distribution(
    Query(query): Query<RankDistributionQuery>,
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
) -> APIResult<impl IntoResponse> {
    apply_mmr_distribution_rate_limits(&state, &rate_limit_key).await?;
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(&state.ch_client_ro, &query_str).await.map(Json)?)
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn rank_distribution_build_query_is_valid_sql(query: RankDistributionQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
