use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, default_min_matches_u64, filter_protected_accounts, round_timestamps,
};
use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::{
    MIN_DEMO_PLAYER_TIMESTAMP, comma_separated_deserialize_option, default_last_month_timestamp,
    parse_steam_id_option,
};

fn default_min_matches() -> Option<u64> {
    default_min_matches_u64()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub(super) struct HeroBuildStatsPath {
    /// The hero ID to fetch build stats for. See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: u32,
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct HeroBuildStatsQuery {
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
    /// Filter results for a specific hero build.
    hero_build_id: Option<u64>,
    /// The minimum number of matches played for a build to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u64>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    #[deprecated]
    account_id: Option<u32>,
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
pub struct HeroBuildStats {
    /// The ID of the hero. See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_id: u32,
    /// The ID of the hero build. The `hero_build_id` is the first build the player had selected when the game started.
    pub hero_build_id: u64,
    /// The number of wins with this build.
    pub wins: u64,
    /// The number of losses with this build.
    pub losses: u64,
    /// The total number of matches played with this build (`wins + losses`).
    pub matches: u64,
    /// The number of unique players who used this build.
    pub players: u64,
}

fn build_query(hero_id: u32, valid_build_ids: &[i32], query: &HeroBuildStatsQuery) -> String {
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
    let mut player_filters = vec![format!("mp.hero_id = {hero_id}")];
    #[allow(deprecated)]
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("dp.account_id = {account_id}"));
    }
    if let Some(account_ids) = &query.account_ids {
        player_filters.push(format!(
            "dp.account_id IN ({})",
            account_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(hero_build_id) = query.hero_build_id {
        player_filters.push(format!("dp.hero_build_id = {hero_build_id}"));
    }
    if !valid_build_ids.is_empty() {
        player_filters.push(format!(
            "dp.hero_build_id IN ({})",
            valid_build_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    let player_filters = format!(" AND {}", player_filters.join(" AND "));
    let min_matches = query.min_matches.unwrap_or(20);
    format!(
        "
    WITH t_matches AS (
        SELECT match_id
        FROM match_info
        WHERE match_mode IN ('Ranked', 'Unranked') AND game_mode = 1 {info_filters}
    )
    SELECT
        mp.hero_id AS hero_id,
        dp.hero_build_id AS hero_build_id,
        countIf(mp.won) AS wins,
        countIf(NOT mp.won) AS losses,
        wins + losses AS matches,
        uniq(dp.account_id) AS players
    FROM demo_player dp
        INNER JOIN match_player mp ON dp.match_id = mp.match_id AND dp.account_id = mp.account_id
    WHERE dp.match_id IN t_matches AND dp.hero_build_id != 0 {player_filters}
    GROUP BY hero_id, hero_build_id
    HAVING matches >= {min_matches}
    ORDER BY matches DESC
    "
    )
}

async fn fetch_valid_build_ids(pg_client: &Pool<Postgres>, hero_id: u32) -> sqlx::Result<Vec<i32>> {
    sqlx::query_scalar::<_, i32>("SELECT DISTINCT build_id FROM hero_builds WHERE hero = $1")
        .bind(hero_id.cast_signed())
        .fetch_all(pg_client)
        .await
}

#[cached(
    ty = "TimedCache<String, Vec<HeroBuildStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<HeroBuildStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_hero_build_stats(
    ch_client: &clickhouse::Client,
    hero_id: u32,
    valid_build_ids: &[i32],
    mut query: HeroBuildStatsQuery,
) -> APIResult<Vec<HeroBuildStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    query.min_unix_timestamp = Some(
        query
            .min_unix_timestamp
            .unwrap_or(MIN_DEMO_PLAYER_TIMESTAMP)
            .max(MIN_DEMO_PLAYER_TIMESTAMP),
    );
    let query_str = build_query(hero_id, valid_build_ids, &query);
    debug!(
        hero_id,
        num_valid_builds = valid_build_ids.len(),
        "running hero build stats query"
    );
    Ok(run_query(ch_client, &query_str).await?)
}

#[utoipa::path(
    get,
    path = "/hero-build-stats/{hero_id}",
    params(HeroBuildStatsPath, HeroBuildStatsQuery),
    responses(
        (status = OK, description = "Hero Build Stats", body = [HeroBuildStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero build stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Build Stats",
    description = "
Retrieves performance statistics for hero builds based on historical match data from demo analysis.

Only includes builds that exist in the hero builds database.

The `hero_build_id` is the first build the player had selected when the game started. It does not reflect any build changes made during the match.

Results are cached for **1 hour** based on the combination of query parameters provided.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn hero_build_stats(
    Path(HeroBuildStatsPath { hero_id }): Path<HeroBuildStatsPath>,
    Query(mut query): Query<HeroBuildStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    #[allow(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    let valid_build_ids = fetch_valid_build_ids(&state.pg_client, hero_id).await?;
    get_hero_build_stats(&state.ch_client_ro, hero_id, &valid_build_ids, query)
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
        #[allow(deprecated)]
        fn hero_build_stats_build_query_is_valid_sql(
            hero_id in any::<u32>(),
            valid_build_ids in prop::collection::vec(any::<i32>(), 0..16),
            query: HeroBuildStatsQuery,
        ) {
            assert_valid_sql(&build_query(hero_id, &valid_build_ids, &query));
        }
    }
}
