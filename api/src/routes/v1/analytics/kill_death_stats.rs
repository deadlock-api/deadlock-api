#![allow(clippy::large_stack_arrays)]

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub(crate) struct KillDeathStatsQuery {
    /// Filter by team number.
    #[param(minimum = 0, maximum = 1)]
    team: Option<u8>,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. If not specified, both are included.
    #[serde(default)]
    #[param(inline)]
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
    account_ids: Option<Vec<u32>>,
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
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
    let mut death_filters = vec![];
    if let Some(min_game_time_s) = query.min_game_time_s {
        death_filters.push(format!("dd.game_time_s >= {min_game_time_s}"));
    }
    if let Some(max_game_time_s) = query.max_game_time_s {
        death_filters.push(format!("dd.game_time_s <= {max_game_time_s}"));
    }
    let death_filters = if death_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", death_filters.join(" AND "))
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
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    format!(
        "
    WITH t_matches AS (SELECT match_id FROM match_info WHERE start_time > now() - interval 2 MONTH AND {game_mode_filter} {info_filters}),
         t_events AS (SELECT toInt32(round(tupleElement(dd.death_pos, 1), -2)) as position_x,
                             toInt32(round(tupleElement(dd.death_pos, 2), -2)) as position_y,
                             if(team = 'Team0', 1, 0) as killer_team,
                             'death' as type
                      FROM match_player
                               ARRAY JOIN death_details as dd
                      WHERE match_id IN t_matches {death_filters} {player_filters}
                      UNION ALL
                      SELECT toInt32(round(tupleElement(dd.killer_pos, 1), -2)) as position_x,
                             toInt32(round(tupleElement(dd.killer_pos, 2), -2)) as position_y,
                             if(team = 'Team0', 1, 0) as killer_team,
                             'kill' as type
                      FROM match_player
                               ARRAY JOIN death_details as dd
                      WHERE match_id IN t_matches {death_filters} {})
    SELECT position_x, position_y, killer_team, countIf(type = 'death') as deaths, countIf(type = 'kill') as kills
    FROM t_events
    GROUP BY position_x, position_y, killer_team
    HAVING TRUE {min_deaths_per_raster} {min_kills_per_raster} {max_deaths_per_raster} {max_kills_per_raster}
    ",
        if player_filters.is_empty() {
            String::new()
        } else {
            format!("AND (match_id, dd.killer_player_slot) in (SELECT match_id, player_slot FROM match_player WHERE match_id IN t_matches {player_filters})")
        },
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
This endpoint returns the kill-death statistics across a 100x100 pixel raster.

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
    get_kill_death_stats(&state.ch_client_ro, query)
        .await
        .map(Json)
}
