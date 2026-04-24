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

use super::common_filters::{
    MatchInfoFilters, default_min_matches_u64, filter_protected_accounts, round_timestamps,
};
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

#[allow(clippy::too_many_lines)]
fn build_query(query: &HeroSynergyStatsQuery) -> String {
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
    let mut p1_filters = vec!["match_id IN t_matches".to_owned()];
    let mut p2_filters = vec!["match_id IN t_matches".to_owned()];
    #[allow(deprecated)]
    if let Some(account_id) = query.account_id {
        p1_filters.push(format!("account_id = {account_id}"));
    }
    if let Some(account_ids) = &query.account_ids {
        p1_filters.push(format!(
            "account_id IN ({})",
            account_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(min_networth) = query.min_networth {
        p1_filters.push(format!("net_worth >= {min_networth}"));
        p2_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        p1_filters.push(format!("net_worth <= {max_networth}"));
        p2_filters.push(format!("net_worth <= {max_networth}"));
    }
    let p1_where = p1_filters.join(" AND ");
    let p2_where = p2_filters.join(" AND ");
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
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let join_keys = if query.same_lane_filter.unwrap_or(true) {
        "USING (match_id, team, assigned_lane)"
    } else {
        "USING (match_id, team)"
    };
    #[allow(deprecated)]
    let needs_account_id = query.account_id.is_some() || query.account_ids.is_some();
    let p1_account_col = if needs_account_id { "account_id, " } else { "" };
    let p1_cols = format!(
        "match_id, team, assigned_lane, hero_id, {p1_account_col}won, kills, deaths, assists, denies, last_hits, net_worth, max_boss_damage, max_creep_kills"
    );
    let p2_cols = "match_id, team, assigned_lane, hero_id, kills, deaths, assists, denies, last_hits, net_worth, max_boss_damage, max_creep_kills";
    let pair_select = "
            p1.hero_id AS hero_id1,
            p2.hero_id AS hero_id2,
            p1.won AS won,
            p1.kills AS kills1,
            p2.kills AS kills2,
            p1.deaths AS deaths1,
            p2.deaths AS deaths2,
            p1.assists AS assists1,
            p2.assists AS assists2,
            p1.denies AS denies1,
            p2.denies AS denies2,
            p1.last_hits AS last_hits1,
            p2.last_hits AS last_hits2,
            p1.net_worth AS networth1,
            p2.net_worth AS networth2,
            p1.max_boss_damage AS obj_damage1,
            p2.max_boss_damage AS obj_damage2,
            p1.max_creep_kills AS creeps1,
            p2.max_creep_kills AS creeps2";
    format!(
        "
    WITH t_matches AS (SELECT match_id
                 FROM match_info
                 WHERE match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters})
    SELECT hero_id1,
           hero_id2,
           SUM(won) AS wins,
           COUNT() AS matches_played,
           SUM(kills1) AS kills1,
           SUM(kills2) AS kills2,
           SUM(deaths1) AS deaths1,
           SUM(deaths2) AS deaths2,
           SUM(assists1) AS assists1,
           SUM(assists2) AS assists2,
           SUM(denies1) AS denies1,
           SUM(denies2) AS denies2,
           SUM(last_hits1) AS last_hits1,
           SUM(last_hits2) AS last_hits2,
           SUM(networth1) AS networth1,
           SUM(networth2) AS networth2,
           SUM(obj_damage1) AS obj_damage1,
           SUM(obj_damage2) AS obj_damage2,
           SUM(creeps1) AS creeps1,
           SUM(creeps2) AS creeps2
    FROM (
        SELECT {pair_select}
        FROM (SELECT {p1_cols} FROM match_player WHERE team IN ('Team0', 'Team1') AND {p1_where}) p1
        INNER JOIN (SELECT {p2_cols} FROM match_player WHERE team IN ('Team0', 'Team1') AND {p2_where}) p2 {join_keys}
        WHERE p1.hero_id < p2.hero_id
    )
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
