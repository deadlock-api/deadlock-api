use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::parse_steam_id;
use crate::utils::types::AccountIdQuery;

pub const WINDOW_SIZE: usize = 50;
pub const SMOOTHING_FACTOR: f32 = 1.0;
pub const SOLO_MATCH_WEIGHT_FACTOR: f32 = 2.0;

fn default_limit() -> Option<u32> {
    100.into()
}

#[derive(Deserialize, IntoParams, Default, Clone, Copy, Eq, PartialEq, Hash)]
pub(super) struct MMRHistoryQuery {
    /// The index of the first match to return.
    start: Option<u32>,
    /// The maximum number of matches to return.
    #[serde(default = "default_limit")]
    #[param(inline, default = "100", maximum = 10000, minimum = 1)]
    limit: Option<u32>,
}

#[derive(Deserialize, IntoParams, Default, Clone, Copy, Eq, PartialEq, Hash)]
pub(super) struct HeroMMRHistoryPath {
    /// The players `SteamID3`
    #[serde(default)]
    #[serde(deserialize_with = "parse_steam_id")]
    account_id: u32,
    /// The hero ID to fetch the MMR history for. See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: u8,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct MMRHistory {
    account_id: u32,
    match_id: u64,
    /// Start time of the match
    pub start_time: u32,
    /// Player Score is the index for the rank array (internally used for the rank regression)
    player_score: f64,
    /// The Player Rank. See more: <https://assets.deadlock-api.com/v2/ranks>
    rank: u32,
    /// Extracted from the rank the division (rank // 10)
    division: u32,
    /// Extracted from the rank the division tier (rank % 10)
    division_tier: u32,
}

fn build_mmr_history_query(account_id: u32, start: u32, limit: u32) -> String {
    format!(
        "
    WITH
        {WINDOW_SIZE} as window_size,
        {SMOOTHING_FACTOR} as k,
        {SOLO_MATCH_WEIGHT_FACTOR} as solo_multiplier,
        player_history_arrays AS (
            SELECT
                account_id,
                match_id,
                start_time,
                assumeNotNull(if(team = 'Team1', average_badge_team1, average_badge_team0)) AS current_match_badge,
                row_number() OVER (PARTITION BY account_id ORDER BY start_time, match_id) AS rn,
                groupArray((intDiv(current_match_badge, 10) - 1) * 6 + (current_match_badge % 10)) OVER (PARTITION BY account_id ORDER BY start_time, match_id) AS all_mmrs,
                party = 0 as is_solo
            FROM match_player FINAL
                INNER JOIN match_info USING (match_id)
            WHERE current_match_badge > 0
            AND account_id = {account_id}
            AND match_mode IN ('Ranked', 'Unranked')
        ),
        mmr_data AS (
            SELECT
                account_id,
                match_id,
                start_time,
                arraySlice(all_mmrs, greatest(1, rn - window_size + 1), if(rn < window_size, rn, window_size)) AS mmr_window,
                arrayReverse(mmr_window) AS reversed_mmr_window, arrayMap(x -> if(is_solo, solo_multiplier, 1) * pow(x, -k), range(1, length(reversed_mmr_window) + 1)) AS weights,
                dotProduct(reversed_mmr_window, weights) / arraySum(weights) AS player_score, toUInt32(if(clamp(player_score, 0, 66) = 0, 0, 10 * intDiv(clamp(player_score, 0, 66) - 1, 6) + 11 + modulo(clamp(player_score, 0, 66) - 1, 6))) AS rank,
                toUInt32(floor(rank / 10)) AS division,
                toUInt32(rank % 10) AS division_tier
            FROM player_history_arrays
        )
    SELECT
        account_id,
        match_id,
        start_time,
        player_score,
        rank,
        division,
        division_tier
    FROM mmr_data
    ORDER BY match_id DESC
    LIMIT {limit}
    OFFSET {start}
    "
    )
}

fn build_hero_mmr_history_query(account_id: u32, hero_id: u8, start: u32, limit: u32) -> String {
    format!(
        "
    WITH
        {WINDOW_SIZE} as window_size,
        {SMOOTHING_FACTOR} as k,
        {SOLO_MATCH_WEIGHT_FACTOR} as solo_multiplier,
        player_history_arrays AS (
            SELECT
                account_id,
                match_id,
                start_time,
                assumeNotNull(if(team = 'Team1', average_badge_team1, average_badge_team0)) AS current_match_badge,
                row_number() OVER (PARTITION BY account_id ORDER BY start_time, match_id) AS rn,
                groupArray((intDiv(current_match_badge, 10) - 1) * 6 + (current_match_badge % 10)) OVER (PARTITION BY account_id ORDER BY start_time, match_id) AS all_mmrs,
                party = 0 as is_solo
            FROM match_player FINAL
                INNER JOIN match_info USING (match_id)
            WHERE current_match_badge > 0
            AND account_id = {account_id}
            AND hero_id = {hero_id}
            AND match_mode IN ('Ranked', 'Unranked')
        ),
        mmr_data AS (
            SELECT
                account_id,
                match_id,
                start_time,
                arraySlice(all_mmrs, greatest(1, rn - window_size + 1), if(rn < window_size, rn, window_size)) AS mmr_window,
                arrayReverse(mmr_window) AS reversed_mmr_window, arrayMap(x -> if(is_solo, solo_multiplier, 1) * pow(x, -k), range(1, length(reversed_mmr_window) + 1)) AS weights,
                dotProduct(reversed_mmr_window, weights) / arraySum(weights) AS player_score, toUInt32(if(clamp(player_score, 0, 66) = 0, 0, 10 * intDiv(clamp(player_score, 0, 66) - 1, 6) + 11 + modulo(clamp(player_score, 0, 66) - 1, 6))) AS rank,
                toUInt32(floor(rank / 10)) AS division,
                toUInt32(rank % 10) AS division_tier
            FROM player_history_arrays
        )
    SELECT
        account_id,
        match_id,
        start_time,
        player_score,
        rank,
        division,
        division_tier
    FROM mmr_data
    ORDER BY match_id DESC
    LIMIT {limit}
    OFFSET {start}
    "
    )
}

#[utoipa::path(
    get,
    path = "/{account_id}/mmr-history",
    params(AccountIdQuery, MMRHistoryQuery),
    responses(
        (status = OK, description = "MMR History", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch mmr history")
    ),
    tags = ["MMR"],
    summary = "MMR History",
    description = "Player MMR History",
)]
pub(super) async fn mmr_history(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(MMRHistoryQuery { limit, start }): Query<MMRHistoryQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let query = build_mmr_history_query(
        account_id,
        start.unwrap_or_default(),
        limit.or_else(default_limit).unwrap_or(100),
    );
    debug!(?query);
    Ok(state
        .ch_client_ro
        .query(&query)
        .fetch_all::<MMRHistory>()
        .await
        .map(Json)?)
}

#[utoipa::path(
    get,
    path = "/{account_id}/mmr-history/{hero_id}",
    params(HeroMMRHistoryPath, MMRHistoryQuery),
    responses(
        (status = OK, description = "Hero MMR History", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero mmr history")
    ),
    tags = ["MMR"],
    summary = "Hero MMR History",
    description = "Player Hero MMR History",
)]
pub(super) async fn hero_mmr_history(
    Path(HeroMMRHistoryPath {
        account_id,
        hero_id,
    }): Path<HeroMMRHistoryPath>,
    Query(MMRHistoryQuery { limit, start }): Query<MMRHistoryQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let query = build_hero_mmr_history_query(
        account_id,
        hero_id,
        start.unwrap_or_default(),
        limit.or_else(default_limit).unwrap_or(100),
    );
    debug!(?query);
    Ok(state
        .ch_client_ro
        .query(&query)
        .fetch_all::<MMRHistory>()
        .await
        .map(Json)?)
}
