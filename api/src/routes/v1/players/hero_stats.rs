use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{comma_separated_deserialize, comma_separated_deserialize_option};
use crate::utils::types::AccountIdQuery;

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct HeroStatsQuery {
    /// Comma separated list of account ids, Account IDs are in `SteamID3` format.
    #[param(inline, min_items = 1, max_items = 1000)]
    #[serde(deserialize_with = "comma_separated_deserialize")]
    pub(crate) account_ids: Vec<u32>,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Filter matches based on their start time (Unix timestamp).
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
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroStats {
    account_id: u32,
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_id: u32,
    matches_played: u64,
    last_played: u32,
    time_played: u64,
    wins: u64,
    ending_level: f64,
    kills: u64,
    deaths: u64,
    assists: u64,
    total_player_damage: u64,
    total_player_damage_taken: u64,
    total_boss_damage: u64,
    total_creep_damage: u64,
    total_neutral_damage: u64,
    denies_per_match: f64,
    kills_per_min: f64,
    deaths_per_min: f64,
    assists_per_min: f64,
    denies_per_min: f64,
    networth_per_min: f64,
    last_hits_per_min: f64,
    damage_per_min: f64,
    damage_per_soul: f64,
    #[deprecated(
        note = "This field is deprecated and will be removed in the future. Use `damage_per_min` \
                instead."
    )]
    damage_mitigated_per_min: f64,
    damage_taken_per_min: f64,
    damage_taken_per_soul: f64,
    creeps_per_min: f64,
    obj_damage_per_min: f64,
    obj_damage_per_soul: f64,
    accuracy: f64,
    crit_shot_rate: f64,
    matches: Vec<u64>,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &HeroStatsQuery) -> String {
    let account_ids = query.account_ids.iter().map(ToString::to_string).join(",");
    let hero_ids_in = query
        .hero_ids
        .as_ref()
        .map(|heroes| heroes.iter().map(ToString::to_string).join(","));

    // account_id/hero_id/net_worth are columns in the `hero_stats_by_account` projection,
    // so ClickHouse can serve this read from the projection.
    let mut mp_filters = vec![
        format!("account_id IN ({account_ids})"),
        MatchMode::sql_filter(None),
        GameMode::sql_filter(query.game_mode),
    ];
    if let Some(ref ids) = hero_ids_in {
        mp_filters.push(format!("hero_id IN ({ids})"));
    }
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        mp_filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        mp_filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        mp_filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        mp_filters.push(format!("match_id <= {max_match_id}"));
    }
    if let Some(min_networth) = query.min_networth {
        mp_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        mp_filters.push(format!("net_worth <= {max_networth}"));
    }
    let mp_where = mp_filters.join(" AND ");

    let mut outer_filters: Vec<String> = vec![];
    if let Some(min_duration_s) = query.min_duration_s {
        outer_filters.push(format!("duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        outer_filters.push(format!("duration_s <= {max_duration_s}"));
    }
    if let Some(min_badge_level) = query.min_average_badge
        && min_badge_level > 11
    {
        outer_filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= \
             {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge
        && max_badge_level < 116
    {
        outer_filters.push(format!(
            "average_badge_team0 <= {max_badge_level} AND average_badge_team1 <= \
             {max_badge_level}"
        ));
    }
    let outer_where = if outer_filters.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", outer_filters.join(" AND "))
    };

    format!(
        "
    WITH mp AS (
        SELECT account_id, match_id, hero_id, won, kills, deaths, assists, denies,
               net_worth, last_hits, max_level, max_player_damage, max_player_damage_taken,
               max_creep_kills, max_boss_damage, max_creep_damage, max_neutral_damage,
               max_shots_hit, max_shots_missed,
               max_hero_bullets_hit, max_hero_bullets_hit_crit,
               duration_s, start_time, average_badge_team0, average_badge_team1
        FROM match_player
        WHERE {mp_where}
        LIMIT 1 BY match_id, account_id
    )
    SELECT
        account_id,
        hero_id,
        COUNT() AS matches_played,
        max(start_time) AS last_played,
        sum(duration_s) AS time_played,
        countIf(won) AS wins,
        avg(max_level) AS ending_level,
        sum(kills) AS kills,
        sum(deaths) AS deaths,
        sum(assists) AS assists,
        sum(max_player_damage) AS total_player_damage,
        sum(max_player_damage_taken) AS total_player_damage_taken,
        sum(max_boss_damage) AS total_boss_damage,
        sum(max_creep_damage) AS total_creep_damage,
        sum(max_neutral_damage) AS total_neutral_damage,
        avg(denies) AS denies_per_match,
        60 * avg(mp.kills / duration_s) AS kills_per_min,
        60 * avg(mp.deaths / duration_s) AS deaths_per_min,
        60 * avg(mp.assists / duration_s) AS assists_per_min,
        60 * avg(denies / duration_s) AS denies_per_min,
        60 * avg(net_worth / duration_s) AS networth_per_min,
        60 * avg(last_hits / duration_s) AS last_hits_per_min,
        60 * avg(max_player_damage / duration_s) AS damage_per_min,
        avg(max_player_damage / net_worth) AS damage_per_soul,
        60 * avg(max_player_damage / duration_s) AS damage_mitigated_per_min,
        60 * avg(max_player_damage_taken / duration_s) AS damage_taken_per_min,
        avg(max_player_damage_taken / net_worth) AS damage_taken_per_soul,
        60 * avg(max_creep_kills / duration_s) AS creeps_per_min,
        60 * avg(max_boss_damage / duration_s) AS obj_damage_per_min,
        avg(max_boss_damage / net_worth) AS obj_damage_per_soul,
        avg(max_shots_hit / greatest(1, max_shots_hit + max_shots_missed)) AS accuracy,
        avg(max_hero_bullets_hit_crit / greatest(1, max_hero_bullets_hit_crit + \
         max_hero_bullets_hit)) AS crit_shot_rate,
        groupUniqArray(match_id) as matches
    FROM mp
    {outer_where}
    GROUP BY account_id, hero_id
    ORDER BY account_id, hero_id
    SETTINGS log_comment = 'player_hero_stats'
    "
    )
}

async fn get_hero_stats(
    ch_client: &clickhouse::Client,
    query: HeroStatsQuery,
) -> APIResult<Vec<HeroStats>> {
    if query.account_ids.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "No account IDs provided.",
        ));
    }
    if query.account_ids.len() > 1000 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Too many account IDs provided.",
        ));
    }
    let query = build_query(&query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/hero-stats",
    params(HeroStatsQuery),
    responses(
        (status = OK, description = "Hero Stats", body = [HeroStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero stats")
    ),
    tags = ["Players"],
    summary = "Hero Stats",
    description = "
This endpoint returns statistics for each hero played by a given player account.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn player_hero_stats(
    Query(query): Query<HeroStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if query.game_mode.is_some_and(|g| g == GameMode::StreetBrawl)
        && (query.min_average_badge.is_some() || query.max_average_badge.is_some())
    {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Cannot filter by average badge for street brawl game mode".to_string(),
        });
    }
    get_hero_stats(&state.ch_client_ro, query).await.map(Json)
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct HeroStatsQueryOld {
    /// Filter matches based on their start time (Unix timestamp).
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
}

pub(crate) async fn hero_stats_single(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<HeroStatsQueryOld>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }
    let query = HeroStatsQuery {
        account_ids: vec![account_id],
        min_unix_timestamp: query.min_unix_timestamp,
        max_unix_timestamp: query.max_unix_timestamp,
        min_duration_s: query.min_duration_s,
        max_duration_s: query.max_duration_s,
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        min_average_badge: query.min_average_badge,
        max_average_badge: query.max_average_badge,
        min_match_id: query.min_match_id,
        max_match_id: query.max_match_id,
        ..Default::default()
    };
    get_hero_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn player_hero_stats_build_query_is_valid_sql(query: HeroStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
