use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{default_min_matches_u64, filter_protected_accounts, round_timestamps};
use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, default_true_option,
    parse_steam_id_option,
};

fn default_min_matches() -> Option<u64> {
    default_min_matches_u64()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct HeroSynergyStatsQuery {
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
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
    /// When `true`, only considers matchups where both `hero_id1` and `hero_id2` were assigned to the same lane (e.g., both Mid Lane). When `false`, considers all matchups regardless of assigned lane.
    #[serde(default = "default_true_option")]
    #[param(default = true)]
    same_lane_filter: Option<bool>,
    /// The minimum number of matches played for a hero combination to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u64>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
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
pub struct HeroSynergyStats {
    /// The ID of the first hero in the pair.
    pub hero_id1: u32,
    /// The ID of the second hero in the pair.
    pub hero_id2: u32,
    /// The number of times the team won when both `hero_id1` and `hero_id2` were on the same team.
    pub wins: u64,
    /// The total number of matches played where `hero_id1` and `hero_id2` were on the same team, meeting the filter criteria.
    pub matches_played: u64,
    /// The number of kills by `hero_id1` when playing with `hero_id2`.
    pub kills1: u64,
    /// The number of kills by `hero_id2` when playing with `hero_id1`.
    pub kills2: u64,
    /// The number of deaths by `hero_id1` when playing with `hero_id2`.
    pub deaths1: u64,
    /// The number of deaths by `hero_id2` when playing with `hero_id1`.
    pub deaths2: u64,
    /// The number of assists by `hero_id1` when playing with `hero_id2`.
    pub assists1: u64,
    /// The number of assists by `hero_id2` when playing with `hero_id1`.
    pub assists2: u64,
    /// The number of denies by `hero_id1` when playing with `hero_id2`.
    pub denies1: u64,
    /// The number of denies by `hero_id2` when playing with `hero_id1`.
    pub denies2: u64,
    /// The number of last hits by `hero_id1` when playing with `hero_id2`.
    pub last_hits1: u64,
    /// The number of last hits by `hero_id2` when playing with `hero_id1`.
    pub last_hits2: u64,
    /// The net worth of `hero_id1` when playing with `hero_id2`.
    pub networth1: u64,
    /// The net worth of `hero_id2` when playing with `hero_id1`.
    pub networth2: u64,
    /// The amount of objective damage dealt by `hero_id1` when playing with `hero_id2`.
    pub obj_damage1: u64,
    /// The amount of objective damage dealt by `hero_id2` when playing with `hero_id1`.
    pub obj_damage2: u64,
    /// The number of creeps killed by `hero_id1` when playing with `hero_id2`.
    pub creeps1: u64,
    /// The number of creeps killed by `hero_id2` when playing with `hero_id1`.
    pub creeps2: u64,
}

fn build_query(query: &HeroSynergyStatsQuery) -> String {
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    // Filters applied only to p1: match_id and account filters propagate to p2
    // through the equi-join (match_id) and produce no extra rows, so duplicating
    // them on p2 just forces a second wide scan of match_player.
    let mut p1_filters = vec![
        "p1.team IN ('Team0', 'Team1')".to_owned(),
        "p1.match_mode IN ('Ranked', 'Unranked')".to_owned(),
        game_mode_filter.replace("game_mode", "p1.game_mode"),
    ];
    if let Some(v) = query.min_unix_timestamp {
        p1_filters.push(format!("p1.start_time >= {v}"));
    }
    if let Some(v) = query.max_unix_timestamp {
        p1_filters.push(format!("p1.start_time <= {v}"));
    }
    if let Some(v) = query.min_match_id {
        p1_filters.push(format!("p1.match_id >= {v}"));
    }
    if let Some(v) = query.max_match_id {
        p1_filters.push(format!("p1.match_id <= {v}"));
    }
    if let Some(v) = query.min_average_badge
        && v > 11
    {
        p1_filters.push(format!(
            "p1.average_badge_team0 >= {v} AND p1.average_badge_team1 >= {v}"
        ));
    }
    if let Some(v) = query.max_average_badge
        && v < 116
    {
        p1_filters.push(format!(
            "p1.average_badge_team0 <= {v} AND p1.average_badge_team1 <= {v}"
        ));
    }
    if let Some(v) = query.min_duration_s {
        p1_filters.push(format!("p1.duration_s >= {v}"));
    }
    if let Some(v) = query.max_duration_s {
        p1_filters.push(format!("p1.duration_s <= {v}"));
    }
    #[allow(deprecated)]
    if let Some(account_id) = query.account_id {
        p1_filters.push(format!("p1.account_id = {account_id}"));
    }
    if let Some(account_ids) = &query.account_ids {
        p1_filters.push(format!(
            "p1.account_id IN ({})",
            account_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    // net_worth is a per-player filter, so it must apply to both sides.
    if let Some(min_networth) = query.min_networth {
        p1_filters.push(format!("p1.net_worth >= {min_networth}"));
        p1_filters.push(format!("p2.net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        p1_filters.push(format!("p1.net_worth <= {max_networth}"));
        p1_filters.push(format!("p2.net_worth <= {max_networth}"));
    }
    let where_clause = p1_filters.join(" AND ");
    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("matches_played >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches_played <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };
    let lane_join = if query.same_lane_filter.unwrap_or(true) {
        " AND p1.assigned_lane = p2.assigned_lane"
    } else {
        ""
    };
    format!(
        "
    SELECT p1.hero_id AS hero_id1,
           p2.hero_id AS hero_id2,
           SUM(p1.won) AS wins,
           COUNT() AS matches_played,
           SUM(p1.kills) AS kills1,
           SUM(p2.kills) AS kills2,
           SUM(p1.deaths) AS deaths1,
           SUM(p2.deaths) AS deaths2,
           SUM(p1.assists) AS assists1,
           SUM(p2.assists) AS assists2,
           SUM(p1.denies) AS denies1,
           SUM(p2.denies) AS denies2,
           SUM(p1.last_hits) AS last_hits1,
           SUM(p2.last_hits) AS last_hits2,
           SUM(p1.net_worth) AS networth1,
           SUM(p2.net_worth) AS networth2,
           SUM(p1.max_boss_damage) AS obj_damage1,
           SUM(p2.max_boss_damage) AS obj_damage2,
           SUM(p1.max_creep_kills) AS creeps1,
           SUM(p2.max_creep_kills) AS creeps2
    FROM match_player p1
    INNER JOIN match_player p2
      ON p1.match_id = p2.match_id
     AND p1.team = p2.team{lane_join}
     AND p1.hero_id < p2.hero_id
    WHERE {where_clause}
    GROUP BY hero_id1, hero_id2
    {having_clause}
    "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<HeroSynergyStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<HeroSynergyStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_hero_synergy_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroSynergyStatsQuery,
) -> APIResult<Vec<HeroSynergyStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query = build_query(&query);
    debug!(?query);
    Ok(run_query(ch_client, &query).await?)
}

#[utoipa::path(
    get,
    path = "/hero-synergy-stats",
    params(HeroSynergyStatsQuery),
    responses(
        (status = OK, description = "Hero Synergy Stats", body = [HeroSynergyStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero synergy stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Synergy Stats",
    description = "
Retrieves hero pair synergy statistics based on historical match data.

This endpoint analyzes completed matches to calculate how often a specific pair of heroes (`hero_id1` and `hero_id2`) won when playing *together on the same team*, and the total number of times they have played together under the specified filter conditions.

Results are cached for **1 hour** based on the combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn hero_synergies_stats(
    Query(mut query): Query<HeroSynergyStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    #[allow(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    get_hero_synergy_stats(&state.ch_client_ro, query)
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
        fn hero_synergies_stats_build_query_is_valid_sql(query: HeroSynergyStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
