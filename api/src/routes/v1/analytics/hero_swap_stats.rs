use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{BucketQuery, round_demo_timestamps};
use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::MatchMode;
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};
use crate::utils::sql::{cached_ch_query, impl_match_info};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct HeroSwapStatsQuery {
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
    /// Bucket allows you to group the stats by a specific field.
    #[serde(default)]
    #[param(inline)]
    bucket: BucketQuery,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago. **Minimum:** March 1, 2026.
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
}

impl_match_info!(HeroSwapStatsQuery);

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroSwapStats {
    /// The ID of the hero. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_id: u32,
    /// The bucket value (depends on the bucket query parameter).
    pub bucket: u32,
    /// The number of players who played this hero, counting only players whose pre-game hero is known.
    pub matches: u64,
    /// The number of players who played this hero after swapping to it from another pre-game hero.
    pub swapped_in: u64,
    /// The number of `swapped_in` players who won the match.
    pub swapped_in_wins: u64,
    /// The number of players who had this hero locked before the pre-game swap window.
    pub pregame_picks: u64,
    /// The number of `pregame_picks` players who swapped away from this hero.
    pub swapped_away: u64,
}

fn build_query(query: &HeroSwapStatsQuery) -> String {
    let info_filters = query.match_info().build();
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    let bucket_expr = query.bucket.base_expr();
    // A pre-game hero of 0 (or NULL) is unknown: the demo did not carry it, for whole matches at
    // a time. Those players count in neither the numerator nor the denominator. The filter is in
    // PREWHERE because only ~1.5% of rows have one; `LIMIT 1 BY` instead of FINAL then dedups the
    // few rows left (FINAL cannot move it to PREWHERE: measured 2x the CPU, same result).
    // Each player row counts once for the hero played and once for the pre-game hero, when it
    // differs.
    format!(
        "
    SELECT h AS hero_id,
           bucket,
           countIf(hero_id = h) AS matches,
           countIf(hero_id = h AND swapped) AS swapped_in,
           countIf(hero_id = h AND swapped AND won) AS swapped_in_wins,
           countIf(pregame_hero_id = h) AS pregame_picks,
           countIf(pregame_hero_id = h AND swapped) AS swapped_away
    FROM (
        SELECT toUInt32(hero_id) AS hero_id,
               assumeNotNull(pregame_hero_id) AS pregame_hero_id,
               won,
               hero_id != pregame_hero_id AS swapped,
               {bucket_expr} AS bucket
        FROM match_player
        PREWHERE assumeNotNull(pregame_hero_id) > 0
          AND {match_mode_filter} AND game_mode = 1 {info_filters}
        LIMIT 1 BY match_id, account_id
    )
    ARRAY JOIN arrayDistinct([hero_id, pregame_hero_id]) AS h
    GROUP BY hero_id, bucket
    ORDER BY hero_id, bucket
    SETTINGS log_comment = 'hero_swap_stats', apply_patch_parts = 0
    "
    )
}

cached_ch_query! {
    fn run_query(5_000, 3600) -> Vec<HeroSwapStats>;
}

async fn get_hero_swap_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroSwapStatsQuery,
) -> APIResult<Arc<Vec<HeroSwapStats>>> {
    round_demo_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
}

#[utoipa::path(
    get,
    path = "/hero-swap-stats",
    params(HeroSwapStatsQuery),
    responses(
        (status = OK, description = "Hero Swap Stats", body = [HeroSwapStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero swap stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Swap Stats",
    description = "
Retrieves hero swap statistics for each hero based on historical match data from demo analysis.

A player swapped when the hero they had locked before the pre-game swap window (`pregame_hero_id`) differs from the hero they played. Only players whose pre-game hero was extracted from the demo are counted, so all fields share the same sample:

- **Swap-in rate:** `swapped_in / matches`, the share of this hero's players who swapped to it.
- **Swap-in win rate:** `swapped_in_wins / swapped_in`.
- **Swap-away rate:** `swapped_away / pregame_picks`, the share of players who had this hero locked and swapped away from it.

Results are cached for **6 hours** based on the combination of query parameters provided.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(super) async fn hero_swap_stats(
    Query(query): Query<HeroSwapStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_swap_stats(&state.ch_client_ro, query)
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
        fn hero_swap_stats_build_query_is_valid_sql(query: HeroSwapStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
