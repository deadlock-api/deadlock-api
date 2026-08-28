use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::routes::v1::players::rank::badge_from_flat_progress_sql;
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct BadgeDistributionQuery {
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
    /// Filter matches based on their start time (Unix timestamp). Values below the start of the
    /// first ranked season (1785430800) are clamped to it. **Default:** 30 days ago.
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

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub(crate) struct BadgeDistribution {
    /// The badge level (tier = first digits, subtier = last digit). See more: <https://api.deadlock-api.com/v1/assets/ranks>
    badge_level: u32,
    /// The total number of matches.
    total_matches: u64,
    /// The number of unique players whose rank on their latest ranked match in the filtered range is this badge level.
    unique_players: u64,
}

/// Start of the first ranked season. No match before it carries a player rank.
const FIRST_RANKED_SEASON_START: i64 = 1785430800;

fn build_query(query: &BadgeDistributionQuery) -> String {
    let min_unix_timestamp = query
        .min_unix_timestamp
        .map_or(FIRST_RANKED_SEASON_START, |t| {
            t.max(FIRST_RANKED_SEASON_START)
        });
    let mut info_filters = vec![format!("start_time >= {min_unix_timestamp}")];
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        info_filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {max_match_id}"));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        info_filters.push(format!("duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {max_duration_s}"));
    }
    if let Some(is_high_skill_range_parties) = query.is_high_skill_range_parties {
        info_filters.push(format!(
            "is_high_skill_range_parties = {is_high_skill_range_parties}"
        ));
    }
    if let Some(is_low_pri_pool) = query.is_low_pri_pool {
        info_filters.push(format!("low_pri_pool = {is_low_pri_pool}"));
    }
    if let Some(is_new_player_pool) = query.is_new_player_pool {
        info_filters.push(format!("new_player_pool = {is_new_player_pool}"));
    }
    let filters = format!(" AND {}", info_filters.join(" AND "));
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    let player_badge = badge_from_flat_progress_sql(
        "assumeNotNull(argMax(player_rank_final_flat_progress, match_id))",
        "assumeNotNull(argMax(player_rank_initial_display_rank, match_id))",
    );
    // The only projection covering these columns is ordered by hero_id and carries no skip indexes,
    // so ClickHouse picks it and then can't prune by start_time: ~70x more rows read.
    format!(
        "
    SELECT
        badge_level,
        sum(total_matches) as total_matches,
        sum(unique_players) as unique_players
    FROM (
        SELECT
            toUInt32(assumeNotNull(average_badge)) as badge_level,
            uniqExact(match_id) as total_matches,
            toUInt64(0) as unique_players
        FROM match_player
        WHERE {match_mode_filter} AND {game_mode_filter} AND average_badge > 0 {filters}
        GROUP BY average_badge
        UNION ALL
        SELECT
            badge_level,
            toUInt64(0) as total_matches,
            COUNT() as unique_players
        FROM (
            SELECT {player_badge} AS badge_level
            FROM match_player
            WHERE match_mode = 'Ranked' AND {game_mode_filter} AND player_rank_initial_display_rank > 0
              AND player_rank_final_flat_progress IS NOT NULL {filters}
            GROUP BY account_id
        )
        GROUP BY badge_level
    )
    GROUP BY badge_level
    ORDER BY badge_level
    SETTINGS log_comment = 'badge_distribution', apply_patch_parts = 0, optimize_use_projections = 0
    "
    )
}

async fn get_badge_distribution(
    ch_client: &clickhouse::Client,
    query: BadgeDistributionQuery,
) -> APIResult<Vec<BadgeDistribution>> {
    let query = build_query(&query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/badge-distribution",
    params(BadgeDistributionQuery),
    responses(
        (status = OK, description = "Badge Distribution", body = [BadgeDistribution]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch badge distribution")
    ),
    tags = ["Analytics"],
    summary = "Badge Distribution",
    description = "
This endpoint returns the player badge distribution.

`total_matches` counts matches by their average badge, while `unique_players` counts players by the
rank Valve reported at the end of their latest ranked match within the filtered range. Since only
ranked matches carry a rank, `unique_players` ignores the `match_mode` filter and always looks at
ranked matches.

Ranks exist only from the first ranked season on, so `min_unix_timestamp` is clamped to its start.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(crate) async fn badge_distribution(
    Query(query): Query<BadgeDistributionQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_badge_distribution(&state.ch_client_cached, query)
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
        fn badge_distribution_build_query_is_valid_sql(query: BadgeDistributionQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
