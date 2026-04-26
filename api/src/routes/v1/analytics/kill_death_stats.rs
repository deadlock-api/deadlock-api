#![allow(clippy::large_stack_arrays)]

use axum::Json;
use axum::extract::State;
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
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct KillDeathStatsQuery {
    /// Filter by team number.
    #[param(minimum = 0, maximum = 1)]
    team: Option<u8>,
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
    /// Filter matches by account IDs of players that participated in the match.
    #[serde(default)]
    #[serde(deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Filter players based on their final net worth.
    min_networth: Option<u64>,
    /// Filter players based on their final net worth.
    max_networth: Option<u64>,
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
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter Raster cells based on minimum kills.
    min_kills_per_raster: Option<u32>,
    /// Filter Raster cells based on maximum kills.
    max_kills_per_raster: Option<u32>,
    /// Filter Raster cells based on minimum deaths.
    min_deaths_per_raster: Option<u32>,
    /// Filter Raster cells based on maximum deaths.
    max_deaths_per_raster: Option<u32>,
    /// Filter kills based on their game time.
    #[param(maximum = 7000)]
    min_game_time_s: Option<u32>,
    /// Filter kills based on their game time.
    #[param(maximum = 7000)]
    max_game_time_s: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub(crate) struct KillDeathStats {
    position_x: i32,
    position_y: i32,
    killer_team: u8,
    deaths: u64,
    kills: u64,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &KillDeathStatsQuery) -> String {
    let mut info_filters = vec![];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        info_filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        info_filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {max_match_id}"));
    }
    if let Some(min_badge_level) = query.min_average_badge
        && min_badge_level > 11
    {
        info_filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge
        && max_badge_level < 116
    {
        info_filters.push(format!(
            "average_badge_team0 <= {max_badge_level} AND average_badge_team1 <= {max_badge_level}"
        ));
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
    let info_filters = if info_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", info_filters.join(" AND "))
    };
    let mut player_filters = vec![];
    if let Some(account_ids) = &query.account_ids {
        player_filters.push(format!(
            "account_id IN ({})",
            account_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(hero_ids) = query.hero_ids.as_ref() {
        player_filters.push(format!(
            "hero_id IN ({})",
            hero_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(min_networth) = query.min_networth {
        player_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        player_filters.push(format!("net_worth <= {max_networth}"));
    }
    if let Some(team) = query.team {
        if team == 0 {
            player_filters.push("team = 'Team0'".to_owned());
        } else if team == 1 {
            player_filters.push("team = 'Team1'".to_owned());
        }
    }
    let player_filters = if player_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    let mut game_time_filters = vec![];
    if let Some(min_game_time_s) = query.min_game_time_s {
        game_time_filters.push(format!("g_time >= {min_game_time_s}"));
    }
    if let Some(max_game_time_s) = query.max_game_time_s {
        game_time_filters.push(format!("g_time <= {max_game_time_s}"));
    }
    let game_time_filters = if game_time_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", game_time_filters.join(" AND "))
    };
    let mut death_join_cols = vec!["death_details.death_pos AS dpos"];
    if !game_time_filters.is_empty() {
        death_join_cols.push("death_details.game_time_s AS g_time");
    }
    let death_array_join = death_join_cols.join(", ");
    let mut kill_join_cols = vec!["death_details.killer_pos AS kpos"];
    if !game_time_filters.is_empty() {
        kill_join_cols.push("death_details.game_time_s AS g_time");
    }
    if !player_filters.is_empty() {
        kill_join_cols.push("death_details.killer_player_slot AS killer_player_slot");
    }
    let kill_array_join = kill_join_cols.join(", ");
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_filters =
        format!("start_time > now() - interval 2 MONTH AND {game_mode_filter} {info_filters}");
    let kill_player_filter = if player_filters.is_empty() {
        String::new()
    } else {
        format!(
            "AND (match_id, killer_player_slot) IN (SELECT match_id, player_slot FROM match_player WHERE {match_filters} {player_filters})"
        )
    };
    let min_kills_per_raster = query
        .min_kills_per_raster
        .map_or(String::new(), |v| format!(" AND kills >= {v}"));
    let min_deaths_per_raster = query
        .min_deaths_per_raster
        .map_or(String::new(), |v| format!(" AND deaths >= {v}"));
    let max_kills_per_raster = query
        .max_kills_per_raster
        .map_or(String::new(), |v| format!(" AND kills <= {v}"));
    let max_deaths_per_raster = query
        .max_deaths_per_raster
        .map_or(String::new(), |v| format!(" AND deaths <= {v}"));
    format!(
        "
    SELECT position_x, position_y, killer_team, sum(deaths) AS deaths, sum(kills) AS kills
    FROM (
        SELECT toInt32(floor(tupleElement(dpos, 1) / 128) * 128) AS position_x,
               toInt32(floor(tupleElement(dpos, 2) / 128) * 128) AS position_y,
               if(team = 'Team0', 1, 0) AS killer_team,
               count() AS deaths,
               0::UInt64 AS kills
        FROM match_player
                 ARRAY JOIN {death_array_join}
        WHERE {match_filters} {game_time_filters} {player_filters}
        GROUP BY position_x, position_y, killer_team
        UNION ALL
        SELECT toInt32(floor(tupleElement(kpos, 1) / 128) * 128) AS position_x,
               toInt32(floor(tupleElement(kpos, 2) / 128) * 128) AS position_y,
               if(team = 'Team0', 1, 0) AS killer_team,
               0::UInt64 AS deaths,
               count() AS kills
        FROM match_player
                 ARRAY JOIN {kill_array_join}
        WHERE {match_filters} {game_time_filters} {kill_player_filter}
        GROUP BY position_x, position_y, killer_team
    )
    GROUP BY position_x, position_y, killer_team
    HAVING TRUE {min_deaths_per_raster} {min_kills_per_raster} {max_deaths_per_raster} {max_kills_per_raster}
    SETTINGS log_comment = 'kill_death_stats'
    "
    )
}

async fn get_kill_death_stats(
    ch_client: &clickhouse::Client,
    query: KillDeathStatsQuery,
) -> APIResult<Vec<KillDeathStats>> {
    let query = build_query(&query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/kill-death-stats",
    params(KillDeathStatsQuery),
    responses(
        (status = OK, description = "Kill Death Stats", body = [KillDeathStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch kill death stats")
    ),
    tags = ["Analytics"],
    summary = "Kill Death Stats",
    description = "
This endpoint returns the kill-death statistics across a 128x128 pixel raster.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn kill_death_stats(
    Query(query): Query<KillDeathStatsQuery>,
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
    get_kill_death_stats(&state.ch_client_ro, query)
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
        fn kill_death_stats_build_query_is_valid_sql(query: KillDeathStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
