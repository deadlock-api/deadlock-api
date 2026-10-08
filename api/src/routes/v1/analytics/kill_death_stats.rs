use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    PlayerFilters, filter_protected_accounts, range_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};
use crate::utils::sql::{
    DURATION_COLUMN, MatchPoolFilters, cached_ch_query, impl_match_info, join_filters,
};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct KillDeathStatsQuery {
    /// Filter by team number.
    #[param(minimum = 0, maximum = 1)]
    team: Option<u8>,
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
    /// Filter matches based on the hero IDs. See more: <https://api.deadlock-api.com/v1/assets/heroes>
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
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
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

impl_match_info!(KillDeathStatsQuery);

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub(crate) struct KillDeathStats {
    position_x: i32,
    position_y: i32,
    killer_team: u8,
    deaths: u64,
    kills: u64,
}

fn build_query(query: &KillDeathStatsQuery) -> String {
    let mut info_filters = query.match_info().predicates("", DURATION_COLUMN);
    info_filters.extend(
        MatchPoolFilters {
            is_high_skill_range_parties: query.is_high_skill_range_parties,
            is_low_pri_pool: query.is_low_pri_pool,
            is_new_player_pool: query.is_new_player_pool,
        }
        .predicates(),
    );
    let info_filters = join_filters(&info_filters);
    let mut player_filters = PlayerFilters {
        account_ids: query.account_ids.as_deref(),
        hero_ids: query.hero_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        ..Default::default()
    }
    .build();
    // The handler rejects any other team.
    if let Some(team) = query.team.filter(|&team| team <= 1) {
        player_filters.push(format!("team = 'Team{team}'"));
    }
    let player_filters = join_filters(&player_filters);
    let game_time_filters = join_filters(&range_filters(
        "g_time",
        query.min_game_time_s,
        query.max_game_time_s,
    ));
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
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    let match_filters = format!(
        "start_time > now() - interval 2 MONTH AND {match_mode_filter} AND {game_mode_filter} {info_filters}"
    );
    let kill_player_filter = if player_filters.is_empty() {
        String::new()
    } else {
        format!(
            "AND (match_id, killer_player_slot) IN (SELECT match_id, player_slot FROM match_player WHERE {match_filters} {player_filters})"
        )
    };
    let mut raster_filters = range_filters(
        "deaths",
        query.min_deaths_per_raster,
        query.max_deaths_per_raster,
    );
    raster_filters.extend(range_filters(
        "kills",
        query.min_kills_per_raster,
        query.max_kills_per_raster,
    ));
    let raster_filters = join_filters(&raster_filters);
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
    HAVING TRUE{raster_filters}
    SETTINGS log_comment = 'kill_death_stats', apply_patch_parts = 0
    "
    )
}

cached_ch_query! {
    fn run_query(1_000, 1800) -> Vec<KillDeathStats>;
}

async fn get_kill_death_stats(
    ch_client: &clickhouse::Client,
    mut query: KillDeathStatsQuery,
) -> APIResult<Arc<Vec<KillDeathStats>>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
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
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(crate) async fn kill_death_stats(
    Query(mut query): Query<KillDeathStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if query.team.is_some_and(|t| t > 1) {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "team must be 0 or 1",
        ));
    }
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
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
