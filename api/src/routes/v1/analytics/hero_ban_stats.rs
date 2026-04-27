use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use strum::Display;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{MatchInfoFilters, round_timestamps};
use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::{MIN_DEMO_PLAYER_TIMESTAMP, default_last_month_timestamp};

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum BucketQuery {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket Hero Ban Stats By Max Average Badge Level (tier = first digits, subtier = last digit) of both teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    AvgBadge,
    /// Bucket Hero Ban Stats By Start Time (Hour)
    StartTimeHour,
    /// Bucket Hero Ban Stats By Start Time (Day)
    StartTimeDay,
    /// Bucket Hero Ban Stats By Start Time (Week)
    StartTimeWeek,
    /// Bucket Hero Ban Stats By Start Time (Month)
    StartTimeMonth,
}

impl BucketQuery {
    fn get_select_clause(self) -> &'static str {
        match self {
            Self::NoBucket => "toUInt32(0)",
            Self::AvgBadge => "toUInt32(max_avg_badge)",
            Self::StartTimeHour => "toStartOfHour(start_time)",
            Self::StartTimeDay => "toStartOfDay(start_time)",
            Self::StartTimeWeek => "toDateTime(toStartOfWeek(start_time))",
            Self::StartTimeMonth => "toDateTime(toStartOfMonth(start_time))",
        }
    }

    fn get_info_select_clause(self) -> &'static str {
        match self {
            Self::StartTimeHour
            | Self::StartTimeDay
            | Self::StartTimeWeek
            | Self::StartTimeMonth => ", any(start_time) as start_time",
            Self::AvgBadge => {
                ", assumeNotNull(coalesce(greatest(any(average_badge_team0), any(average_badge_team1)), 0)) as max_avg_badge"
            }
            Self::NoBucket => "",
        }
    }
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct HeroBanStatsQuery {
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
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroBanStats {
    /// The ID of the banned hero. See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_id: u32,
    /// The bucket value (depends on the bucket query parameter).
    pub bucket: u32,
    /// The number of matches in which this hero was banned.
    pub bans: u64,
}

fn build_query(query: &HeroBanStatsQuery) -> String {
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
    let bucket = query.bucket.get_select_clause();
    let match_info_select = query.bucket.get_info_select_clause();
    format!(
        "
    WITH t_matches AS (
        SELECT match_id {match_info_select}
        FROM match_player
        WHERE match_mode IN ('Ranked', 'Unranked') AND game_mode = 1 {info_filters}
        GROUP BY match_id
    ),
    t_bans AS (
        SELECT dp.match_id, any(dp.banned_hero_ids) AS banned_hero_ids
        FROM demo_player dp
        WHERE dp.match_id IN (SELECT match_id FROM t_matches) AND notEmpty(dp.banned_hero_ids)
        GROUP BY dp.match_id
    )
    SELECT arrayJoin(banned_hero_ids) AS hero_id, {bucket} AS bucket, uniq(t_bans.match_id) AS bans
    FROM t_bans
    {join}
    GROUP BY hero_id, bucket
    ORDER BY hero_id, bucket
    SETTINGS log_comment = 'hero_ban_stats'
    ",
        join = if query.bucket == BucketQuery::NoBucket {
            ""
        } else {
            "INNER JOIN t_matches USING (match_id)"
        },
    )
}

#[cached(
    ty = "TimedCache<String, Vec<HeroBanStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<HeroBanStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_hero_ban_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroBanStatsQuery,
) -> APIResult<Vec<HeroBanStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    query.min_unix_timestamp = Some(
        query
            .min_unix_timestamp
            .unwrap_or(MIN_DEMO_PLAYER_TIMESTAMP)
            .max(MIN_DEMO_PLAYER_TIMESTAMP),
    );
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
    description = "
Retrieves ban statistics for each hero based on historical match data from demo analysis.

Only matches with successfully extracted ban data are included. Matches where ban extraction failed (empty `banned_hero_ids`) are excluded entirely.

Results are cached for **1 hour** based on the combination of query parameters provided.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
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
