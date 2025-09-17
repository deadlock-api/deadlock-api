use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::parse_steam_id;
use crate::utils::types::AccountIdQuery;

pub const WINDOW_SIZE: usize = 50;
pub const SMOOTHING_FACTOR: f32 = 0.2;
pub const WIN_BOOST: f32 = 0.1;

#[derive(Deserialize, IntoParams, Default, Clone, Copy, Eq, PartialEq, Hash)]
pub(super) struct HeroMMRHistoryQuery {
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
    pub(crate) division: u32,
    /// Extracted from the rank the division tier (rank % 10)
    pub(crate) division_tier: u32,
}

fn build_mmr_history_query(account_id: u32) -> String {
    format!(
        "
    WITH
        {WINDOW_SIZE} as window_size,
        {SMOOTHING_FACTOR} as k,
        {WIN_BOOST} as win_boost,
        arrayMap(x -> pow(x, -k), range(1, window_size + 1)) AS exp_weights,
        t_matches AS (
            SELECT
                account_id,
                match_id,
                start_time,
                assumeNotNull(if(player_team = 'Team1', average_badge_team1, average_badge_team0)) AS current_match_badge,
                ((intDiv(current_match_badge, 10) - 1) * 6 + (current_match_badge % 10)) * (1 + (player_team == winning_team) * win_boost) AS mmr
            FROM player_match_history
                INNER JOIN match_info USING (match_id)
            WHERE current_match_badge > 0
            AND (not_scored is NULL OR not_scored != true)
            AND account_id = {account_id}
            AND match_mode IN ('Ranked', 'Unranked')
            ORDER BY account_id, match_id DESC
        ),
        mmr_data AS (
            SELECT
                account_id,
                match_id,
                start_time,
                groupArray(mmr) OVER (PARTITION BY account_id ORDER BY match_id DESC ROWS BETWEEN CURRENT ROW AND window_size - 1 FOLLOWING) AS mmr_window,
                arraySlice(exp_weights, 1, length(mmr_window)) AS weights,
                dotProduct(mmr_window, weights) / arraySum(weights) AS player_score,
                toUInt32(if(clamp(player_score, 0, 66) = 0, 0, 10 * intDiv(clamp(player_score, 0, 66) - 1, 6) + 11 + modulo(clamp(player_score, 0, 66) - 1, 6))) AS rank,
                toUInt32(floor(rank / 10)) AS division,
                toUInt32(rank % 10) AS division_tier
            FROM t_matches
            ORDER BY match_id
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
    "
    )
}

fn build_hero_mmr_history_query(account_id: u32, hero_id: u8) -> String {
    format!(
        "
    WITH
        {WINDOW_SIZE} as window_size,
        {SMOOTHING_FACTOR} as k,
        {WIN_BOOST} AS win_boost,
        arrayMap(x -> pow(x, -k), range(1, window_size + 1)) AS exp_weights,
        t_matches AS (
            SELECT
                account_id,
                match_id,
                start_time,
                assumeNotNull(if(player_team = 'Team1', average_badge_team1, average_badge_team0)) AS current_match_badge,
                ((intDiv(current_match_badge, 10) - 1) * 6 + (current_match_badge % 10)) * (1 + (player_team == winning_team) * win_boost) AS mmr
            FROM player_match_history
                INNER JOIN match_info USING (match_id)
            WHERE current_match_badge > 0
            AND (not_scored is NULL OR not_scored != true)
            AND account_id = {account_id}
            AND hero_id = {hero_id}
            AND match_mode IN ('Ranked', 'Unranked')
            ORDER BY account_id, match_id DESC
        ),
        mmr_data AS (
            SELECT
                account_id,
                match_id,
                start_time,
                groupArray(mmr) OVER (PARTITION BY account_id ORDER BY match_id DESC ROWS BETWEEN CURRENT ROW AND window_size - 1 FOLLOWING) AS mmr_window,
                arraySlice(exp_weights, 1, length(mmr_window)) AS weights,
                dotProduct(mmr_window, weights) / arraySum(weights) AS player_score,
                toUInt32(if(clamp(player_score, 0, 66) = 0, 0, 10 * intDiv(clamp(player_score, 0, 66) - 1, 6) + 11 + modulo(clamp(player_score, 0, 66) - 1, 6))) AS rank,
                toUInt32(floor(rank / 10)) AS division,
                toUInt32(rank % 10) AS division_tier
            FROM t_matches
            ORDER BY match_id
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
    "
    )
}

async fn get_mmr_history(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> APIResult<Vec<MMRHistory>> {
    let query = build_mmr_history_query(account_id);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

async fn get_hero_mmr_history(
    ch_client: &clickhouse::Client,
    account_id: u32,
    hero_id: u8,
) -> APIResult<Vec<MMRHistory>> {
    let query = build_hero_mmr_history_query(account_id, hero_id);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/{account_id}/mmr-history",
    params(AccountIdQuery),
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
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_mmr_history(&state.ch_client_ro, account_id)
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/{account_id}/mmr-history/{hero_id}",
    params(HeroMMRHistoryQuery),
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
    Path(HeroMMRHistoryQuery {
        account_id,
        hero_id,
    }): Path<HeroMMRHistoryQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_mmr_history(&state.ch_client_ro, account_id, hero_id)
        .await
        .map(Json)
}
