use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use serde::Deserialize;
use tracing::debug;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::players::mmr::apply_mmr_rate_limits;
use crate::routes::v1::players::mmr::mmr_history::MMRHistory;
use crate::routes::v1::players::rank::badge_from_flat_progress_sql;
use crate::services::rate_limiter::extractor::RateLimitKey;
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
    /// The hero ID to fetch the MMR history for. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub(super) hero_id: u8,
}

fn build_mmr_query(account_ids: &[u32], max_match_id: Option<u64>) -> String {
    build_mmr_query_inner(account_ids, None, max_match_id, "mmr_batch")
}

fn build_hero_mmr_query(account_ids: &[u32], hero_id: u8, max_match_id: Option<u64>) -> String {
    build_mmr_query_inner(account_ids, Some(hero_id), max_match_id, "mmr_batch_hero")
}

fn build_mmr_query_inner(
    account_ids: &[u32],
    hero_id: Option<u8>,
    max_match_id: Option<u64>,
    log_comment: &str,
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
    let badge = badge_from_flat_progress_sql(
        "assumeNotNull(argMax(player_rank_final_flat_progress, match_id))",
    );
    format!(
        "
    SELECT
        account_id,
        latest_match_id AS match_id,
        latest_start_time AS start_time,
        toFloat64((intDiv(rank, 10) - 1) * 6 + rank % 10) AS player_score,
        rank,
        toUInt32(intDiv(rank, 10)) AS division,
        toUInt32(rank % 10) AS division_tier
    FROM (
        SELECT
            account_id,
            max(match_id) AS latest_match_id,
            argMax(start_time, match_id) AS latest_start_time,
            {badge} AS rank
        FROM match_player
        WHERE account_id IN ({account_ids})
          AND match_mode = 'Ranked'
          AND player_rank_initial_display_rank > 0
          AND player_rank_final_flat_progress IS NOT NULL
          {hero_filter}
          {match_id_filter}
        GROUP BY account_id
    )
    SETTINGS log_comment = '{log_comment}', apply_patch_parts = 0
    "
    )
}

#[cached(
    ttl = 60,
    convert = r#"{ format!("{account_ids:?}-{max_match_id:?}") }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_mmr(
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
    summary = "Batch MMR (Deprecated)",
    description = "
Deprecated. The MMR estimate is gone, this now returns the rank Valve reported for each player at
the end of their latest ranked match. Players without a ranked match carrying a rank are left out.

Use `/v1/players/{account_id}/rank` instead.
",
)]
#[deprecated(note = "use `/v1/players/{account_id}/rank`")]
pub(super) async fn mmr(
    Query(MMRBatchQuery {
        account_ids,
        max_match_id,
    }): Query<MMRBatchQuery>,
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
) -> APIResult<impl IntoResponse> {
    apply_mmr_rate_limits(&state, &rate_limit_key).await?;
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
    summary = "Batch Hero MMR (Deprecated)",
    description = "
Deprecated. Valve reports a single account-wide rank, not a per-hero one, so this returns each
player's rank on their latest ranked match played on that hero.

Use `/v1/players/{account_id}/rank` instead.
",
)]
#[deprecated(note = "use `/v1/players/{account_id}/rank`")]
pub(super) async fn hero_mmr(
    Path(HeroMMRPath { hero_id }): Path<HeroMMRPath>,
    Query(MMRBatchQuery {
        account_ids,
        max_match_id,
    }): Query<MMRBatchQuery>,
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
) -> APIResult<impl IntoResponse> {
    apply_mmr_rate_limits(&state, &rate_limit_key).await?;
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
