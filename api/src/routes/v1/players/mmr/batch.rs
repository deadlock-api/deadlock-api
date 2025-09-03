use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use serde::Deserialize;
use tracing::debug;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::players::mmr::mmr_history::MMRHistory;
use crate::utils::parse::comma_separated_deserialize;

use crate::routes::v1::players::mmr::mmr_history::SMOOTHING_FACTOR;
use crate::routes::v1::players::mmr::mmr_history::SOLO_MATCH_WEIGHT_FACTOR;
use crate::routes::v1::players::mmr::mmr_history::WINDOW_SIZE;

#[derive(Deserialize, IntoParams, Clone)]
pub(crate) struct MMRBatchQuery {
    /// Comma separated list of account ids, Account IDs are in `SteamID3` format.
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(deserialize_with = "comma_separated_deserialize")]
    pub(crate) account_ids: Vec<u32>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
}

#[derive(Deserialize, IntoParams, Default, Clone, Eq, PartialEq, Hash)]
pub(super) struct HeroMMRQuery {
    /// The hero ID to fetch the MMR history for. See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: u8,
}

fn build_mmr_query(account_ids: &[u32], max_match_id: Option<u64>) -> String {
    let account_ids = account_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let match_id_filter = max_match_id
        .map(|max_match_id| format!("AND match_id <= {max_match_id}"))
        .unwrap_or_default();
    format!(
        "
    WITH
        {WINDOW_SIZE} as window_size,
        {SMOOTHING_FACTOR} as k,
        {SOLO_MATCH_WEIGHT_FACTOR} as solo_multiplier,
        per_match_data AS (
            SELECT
                match_id,
                account_id,
                start_time,
                assumeNotNull(if(team = 'Team1', average_badge_team1, average_badge_team0))                  AS current_match_badge,
                (intDiv(current_match_badge, 10) - 1) * 6 + (current_match_badge % 10)                       AS current_match_mmr,
                if(party = 0, solo_multiplier, 1) * 1.0 / pow(row_number() OVER (PARTITION BY account_id ORDER BY match_id DESC), k) AS weight
            FROM match_player FINAL
                INNER JOIN match_info USING (match_id)
            WHERE current_match_badge > 0 AND account_id IN ({account_ids}) AND match_mode IN ('Ranked', 'Unranked') {match_id_filter}
        )
    SELECT
        account_id,
        match_id,
        start_time,
        sum(current_match_mmr * weight) OVER (PARTITION BY account_id ROWS BETWEEN window_size PRECEDING AND CURRENT ROW) /
            sum(weight) OVER (PARTITION BY account_id ROWS BETWEEN window_size PRECEDING AND CURRENT ROW)                             AS player_score,
        toUInt32(if(clamp(player_score, 0, 66) = 0, 0,
            10 * intDiv(clamp(player_score, 0, 66) - 1, 6) + 11 + modulo(clamp(player_score, 0, 66) - 1, 6))) AS rank,
        toUInt32(floor(rank / 10))                                                                             AS division,
        toUInt32(rank % 10)                                                                                    AS division_tier
    FROM per_match_data
    ORDER BY match_id DESC
    LIMIT 1 BY account_id
    "
    )
}

fn build_hero_mmr_query(account_ids: &[u32], hero_id: u8, max_match_id: Option<u64>) -> String {
    let account_ids = account_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let match_id_filter = max_match_id
        .map(|max_match_id| format!("AND match_id <= {max_match_id}"))
        .unwrap_or_default();
    format!(
        "
    WITH
        {WINDOW_SIZE} as window_size,
        {SMOOTHING_FACTOR} as k,
        {SOLO_MATCH_WEIGHT_FACTOR} as solo_multiplier,
        per_match_data AS (
            SELECT
                match_id,
                account_id,
                start_time,
                assumeNotNull(if(team = 'Team1', average_badge_team1, average_badge_team0))                  AS current_match_badge,
                (intDiv(current_match_badge, 10) - 1) * 6 + (current_match_badge % 10)                       AS current_match_mmr,
                if(party = 0, solo_multiplier, 1) * 1.0 / pow(row_number() OVER (PARTITION BY account_id ORDER BY match_id DESC), k) AS weight
            FROM match_player FINAL
                INNER JOIN match_info USING (match_id)
            WHERE current_match_badge > 0 AND account_id IN ({account_ids}) AND hero_id = {hero_id} AND match_mode IN ('Ranked', 'Unranked')
        )
    SELECT
        account_id,
        match_id,
        start_time,
        sum(current_match_mmr * weight) OVER (PARTITION BY account_id ROWS BETWEEN window_size PRECEDING AND CURRENT ROW) /
            sum(weight) OVER (PARTITION BY account_id ROWS BETWEEN window_size PRECEDING AND CURRENT ROW)                             AS player_score,
        toUInt32(if(clamp(player_score, 0, 66) = 0, 0,
            10 * intDiv(clamp(player_score, 0, 66) - 1, 6) + 11 + modulo(clamp(player_score, 0, 66) - 1, 6))) AS rank,
        toUInt32(floor(rank / 10))                                                                             AS division,
        toUInt32(rank % 10)                                                                                    AS division_tier
    FROM per_match_data
    WHERE TRUE {match_id_filter}
    ORDER BY match_id DESC
    LIMIT 1 BY account_id
    "
    )
}

#[utoipa::path(
    get,
    path = "/mmr",
    params(MMRBatchQuery),
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
    Query(MMRBatchQuery {
        account_ids,
        max_match_id,
    }): Query<MMRBatchQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if account_ids.len() > 1_000 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Too many account ids provided.",
        ));
    }
    let query = build_mmr_query(&account_ids, max_match_id);
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
    path = "/mmr/{hero_id}",
    params(MMRBatchQuery, HeroMMRQuery),
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
    Query(MMRBatchQuery {
        account_ids,
        max_match_id,
    }): Query<MMRBatchQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if account_ids.len() > 1_000 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Too many account ids provided.",
        ));
    }
    let query = build_hero_mmr_query(&account_ids, hero_id, max_match_id);
    debug!(?query);
    Ok(state
        .ch_client_ro
        .query(&query)
        .fetch_all::<MMRHistory>()
        .await
        .map(Json)?)
}
