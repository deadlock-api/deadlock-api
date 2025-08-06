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
    division: u32,
    /// Extracted from the rank the division tier (rank % 10)
    division_tier: u32,
}

fn build_mmr_history_query(account_id: u32) -> String {
    format!(
        "
    SELECT account_id, match_id, start_time, player_score, rank, division, division_tier
    FROM mmr_history FINAL
    WHERE account_id = {account_id}
    ORDER BY match_id
    "
    )
}

fn build_hero_mmr_history_query(account_id: u32, hero_id: u8) -> String {
    format!(
        "
    SELECT account_id, match_id, start_time, player_score, rank, division, division_tier
    FROM hero_mmr_history FINAL
    WHERE account_id = {account_id} AND hero_id = {hero_id}
    ORDER BY match_id
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
    params(AccountIdQuery, HeroMMRHistoryQuery),
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
