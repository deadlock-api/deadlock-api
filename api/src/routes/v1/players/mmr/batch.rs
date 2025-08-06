use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use serde::Deserialize;
use tracing::debug;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::players::mmr::mmr_history::MMRHistory;
use crate::utils::parse::comma_separated_deserialize;

#[derive(Deserialize, IntoParams, Clone)]
pub(crate) struct AccountIdsQuery {
    /// Comma separated list of account ids, Account IDs are in `SteamID3` format.
    #[param(inline, min_items = 1, max_items = 10_000)]
    #[serde(deserialize_with = "comma_separated_deserialize")]
    pub(crate) account_ids: Vec<u32>,
}

#[derive(Deserialize, IntoParams, Default, Clone, Eq, PartialEq, Hash)]
pub(super) struct HeroMMRQuery {
    /// The hero ID to fetch the MMR history for. See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: u8,
}

fn build_mmr_query(account_ids: &[u32]) -> String {
    let account_ids = account_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "
    SELECT account_id, match_id, start_time, player_score, rank, division, division_tier
    FROM mmr_history
    WHERE account_id IN ({account_ids})
    ORDER BY match_id DESC
    LIMIT 1 BY account_id
    "
    )
}

fn build_hero_mmr_query(account_ids: &[u32], hero_id: u8) -> String {
    let account_ids = account_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "
    SELECT account_id, match_id, start_time, player_score, rank, division, division_tier
    FROM hero_mmr_history
    WHERE hero_id = {hero_id} AND account_id IN ({account_ids})
    ORDER BY match_id DESC
    LIMIT 1 BY account_id
    "
    )
}

async fn get_mmr(
    ch_client: &clickhouse::Client,
    account_ids: &[u32],
) -> APIResult<Vec<MMRHistory>> {
    let query = build_mmr_query(account_ids);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

async fn get_hero_mmr(
    ch_client: &clickhouse::Client,
    account_ids: &[u32],
    hero_id: u8,
) -> APIResult<Vec<MMRHistory>> {
    let query = build_hero_mmr_query(account_ids, hero_id);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/mmr",
    params(AccountIdsQuery),
    responses(
        (status = OK, description = "MMR", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch mmr")
    ),
    tags = ["MMR"],
    summary = "MMR",
    description = "Batch Player MMR",
)]
pub(super) async fn mmr(
    Query(AccountIdsQuery { account_ids }): Query<AccountIdsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_mmr(&state.ch_client_ro, &account_ids).await.map(Json)
}

#[utoipa::path(
    get,
    path = "/mmr/{hero_id}",
    params(AccountIdsQuery, HeroMMRQuery),
    responses(
        (status = OK, description = "Hero MMR", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero mmr")
    ),
    tags = ["MMR"],
    summary = "Hero MMR",
    description = "Batch Player Hero MMR",
)]
pub(super) async fn hero_mmr(
    Path(HeroMMRQuery { hero_id }): Path<HeroMMRQuery>,
    Query(AccountIdsQuery { account_ids }): Query<AccountIdsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_mmr(&state.ch_client_ro, &account_ids, hero_id)
        .await
        .map(Json)
}
