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
pub(super) struct HeroBanStatsQuery {
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

impl_match_info!(HeroBanStatsQuery);

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroBanStats {
    /// The ID of the banned hero. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_id: u8,
    /// The bucket value (depends on the bucket query parameter).
    pub bucket: u32,
    /// The number of matches in which this hero was banned.
    pub bans: u64,
    /// The number of matches with ban data in this bucket. A hero's ban rate is `bans / matches`; a ranked match has 3
    /// bans and an unranked match 2, so the bans of all heroes do not divide into matches by a fixed count.
    pub matches: u64,
}

fn build_query(query: &HeroBanStatsQuery) -> String {
    let info_filters = query.match_info().build();
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    let bucket_expr = query.bucket.base_expr();
    format!(
        "
    SELECT arrayJoin(banned) AS hero_id,
           bucket,
           count() AS bans,
           any(matches) AS matches
    FROM (
        SELECT banned, bucket, count() OVER (PARTITION BY bucket) AS matches
        FROM (
            SELECT any(banned_hero_ids) AS banned, any({bucket_expr}) AS bucket
            FROM match_player
            WHERE notEmpty(banned_hero_ids)
              AND {match_mode_filter} AND game_mode = 1 {info_filters}
            GROUP BY match_id
        )
    )
    GROUP BY hero_id, bucket
    ORDER BY hero_id, bucket
    SETTINGS log_comment = 'hero_ban_stats', apply_patch_parts = 0
    "
    )
}

cached_ch_query! {
    fn run_query(3600) -> Vec<HeroBanStats>;
}

async fn get_hero_ban_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroBanStatsQuery,
) -> APIResult<Arc<Vec<HeroBanStats>>> {
    round_demo_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
}

#[utoipa::path(
    get,
    path = "/hero-ban-stats",
    params(HeroBanStatsQuery),
    responses(
        (status = OK, description = "Hero Ban Stats", body = [HeroBanStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero ban stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Ban Stats",
    description = super::describe("
Retrieves ban statistics for each hero based on historical match data from demo analysis.

Only matches with successfully extracted ban data are included. `matches` counts them per bucket, so a hero's ban rate
is `bans / matches`. Matches where ban extraction failed (empty `banned_hero_ids`) are excluded entirely.

Results are cached for **1 hour** based on the combination of query parameters provided.

    ")
)]
pub(super) async fn hero_ban_stats(
    Query(query): Query<HeroBanStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_ban_stats(&state.ch_client_ro, query)
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
        fn hero_ban_stats_build_query_is_valid_sql(query: HeroBanStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
