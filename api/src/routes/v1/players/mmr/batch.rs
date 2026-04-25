use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::Deserialize;
use tracing::debug;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::players::mmr::mmr_history::{MMRHistory, SMOOTHING_FACTOR, WINDOW_SIZE};
use crate::utils::parse::comma_separated_deserialize;

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
pub(super) struct HeroMMRPath {
    /// The hero ID to fetch the MMR history for. See more: <https://assets.deadlock-api.com/v2/heroes>
    pub(super) hero_id: u8,
}

fn build_mmr_query(account_ids: &[u32], max_match_id: Option<u64>) -> String {
    build_mmr_query_inner(account_ids, None, max_match_id)
}

fn build_hero_mmr_query(account_ids: &[u32], hero_id: u8, max_match_id: Option<u64>) -> String {
    build_mmr_query_inner(account_ids, Some(hero_id), max_match_id)
}

fn build_mmr_query_inner(
    account_ids: &[u32],
    hero_id: Option<u8>,
    max_match_id: Option<u64>,
) -> String {
    let account_ids = account_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let match_id_filter = max_match_id
        .map(|m| format!("AND match_id <= {m}"))
        .unwrap_or_default();
    let hero_filter = hero_id
        .map(|id| format!("AND hero_id = {id}"))
        .unwrap_or_default();
    format!(
        "
    WITH
        {WINDOW_SIZE} AS window_size,
        {SMOOTHING_FACTOR} AS k
    SELECT
        account_id,
        latest_match_id AS match_id,
        latest_start_time AS start_time,
        clamp(
            dotProduct(mmr_window, arrayMap(t -> pow(k, date_diff('hour', t, latest_start_time)), time_window)) /
            arraySum(arrayMap(t -> pow(k, date_diff('hour', t, latest_start_time)), time_window)),
            0, 66
        ) AS player_score,
        toUInt32(if(toUInt32(round(player_score)) = 0, 0, 10 * intDiv(toUInt32(round(player_score)) - 1, 6) + 11 + modulo(toUInt32(round(player_score)) - 1, 6))) AS rank,
        toUInt32(floor(rank / 10)) AS division,
        toUInt32(rank % 10) AS division_tier
    FROM (
        SELECT
            account_id,
            max(match_id) AS latest_match_id,
            argMax(start_time, match_id) AS latest_start_time,
            groupArray(mmr) AS mmr_window,
            groupArray(start_time) AS time_window
        FROM (
            SELECT
                account_id,
                match_id,
                dictGet('match_info_dict', ('start_time', 'average_badge_team0', 'average_badge_team1'), match_id) AS info,
                info.1 AS start_time,
                assumeNotNull(if(player_team = 'Team1', info.3, info.2)) AS current_match_badge,
                (intDiv(current_match_badge, 10) - 1) * 6 + (current_match_badge % 10) AS mmr
            FROM (
                SELECT account_id, match_id, player_team
                FROM player_match_history
                WHERE account_id IN ({account_ids})
                  AND game_mode = 'Normal'
                  AND match_mode IN ('Ranked', 'Unranked')
                  {hero_filter}
                  {match_id_filter}
                ORDER BY account_id, match_id DESC
                LIMIT window_size BY account_id
            )
        )
        GROUP BY account_id
    )
    WHERE length(mmr_window) > 0
    "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<MMRHistory>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60)) }",
    result = true,
    convert = r#"{ format!("{account_ids:?}-{max_match_id:?}") }"#,
    sync_writes = "by_key",
    key = "String"
)]
pub(crate) async fn get_mmr(
    ch_client: &clickhouse::Client,
    account_ids: &[u32],
    max_match_id: Option<u64>,
) -> clickhouse::error::Result<Vec<MMRHistory>> {
    let query = build_mmr_query(account_ids, max_match_id);
    debug!(?query);
    ch_client.query(&query).fetch_all::<MMRHistory>().await
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
    summary = "Batch MMR",
    description = "
Batch Player MMR
",
)]
pub(super) async fn mmr(
    Query(MMRBatchQuery {
        account_ids,
        max_match_id,
    }): Query<MMRBatchQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let protected_users = state
        .steam_client
        .get_protected_users(&state.pg_client)
        .await?;
    let account_ids = account_ids
        .into_iter()
        .filter(|id| !protected_users.contains(id))
        .collect::<Vec<_>>();
    if account_ids.len() > 1_000 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Too many account ids provided.",
        ));
    }
    Ok(get_mmr(&state.ch_client_ro, &account_ids, max_match_id)
        .await
        .map(Json)?)
}

#[utoipa::path(
    get,
    path = "/mmr/{hero_id}",
    params(MMRBatchQuery, HeroMMRPath),
    responses(
        (status = OK, description = "Hero MMR", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero mmr")
    ),
    tags = ["MMR"],
    summary = "Batch Hero MMR",
    description = "
Batch Player Hero MMR
",
)]
pub(super) async fn hero_mmr(
    Path(HeroMMRPath { hero_id }): Path<HeroMMRPath>,
    Query(MMRBatchQuery {
        account_ids,
        max_match_id,
    }): Query<MMRBatchQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let protected_users = state
        .steam_client
        .get_protected_users(&state.pg_client)
        .await?;
    let account_ids = account_ids
        .into_iter()
        .filter(|id| !protected_users.contains(id))
        .collect::<Vec<_>>();
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

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn mmr_batch_build_mmr_query_is_valid_sql(
            account_ids in prop::collection::vec(any::<u32>(), 0..=4),
            max_match_id in any::<Option<u64>>(),
        ) {
            assert_valid_sql(&build_mmr_query(&account_ids, max_match_id));
        }

        #[test]
        fn mmr_batch_build_hero_mmr_query_is_valid_sql(
            account_ids in prop::collection::vec(any::<u32>(), 0..=4),
            hero_id in any::<u8>(),
            max_match_id in any::<Option<u64>>(),
        ) {
            assert_valid_sql(&build_hero_mmr_query(&account_ids, hero_id, max_match_id));
        }
    }
}
