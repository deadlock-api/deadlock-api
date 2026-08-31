use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::players::mmr::apply_mmr_rate_limits;
use crate::routes::v1::players::rank::badge_from_flat_progress_sql;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::parse::parse_steam_id;
use crate::utils::types::AccountIdQuery;

#[derive(Deserialize, IntoParams, Default, Clone, Copy, Eq, PartialEq, Hash)]
pub(super) struct HeroMMRHistoryPath {
    /// The players `SteamID3`
    #[serde(default)]
    #[serde(deserialize_with = "parse_steam_id")]
    account_id: u32,
    /// The hero ID to fetch the MMR history for. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    hero_id: u8,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct MMRHistory {
    account_id: u32,
    match_id: u64,
    /// Start time of the match
    pub start_time: u32,
    /// Contiguous index of the rank (1-66), derived from `rank`
    player_score: f64,
    /// The Player Rank (tier = first digits, subtier = last digit). See more: <https://api.deadlock-api.com/v1/assets/ranks>
    rank: u32,
    /// Extracted from the rank the division (rank // 10)
    division: u32,
    /// Extracted from the rank the division tier (rank % 10)
    division_tier: u32,
}

fn build_mmr_history_query(account_id: u32) -> String {
    build_mmr_history_query_inner(account_id, None)
}

fn build_hero_mmr_history_query(account_id: u32, hero_id: u8) -> String {
    build_mmr_history_query_inner(account_id, Some(hero_id))
}

fn build_mmr_history_query_inner(account_id: u32, hero_id: Option<u8>) -> String {
    let hero_filter = hero_id
        .map(|id| format!("AND hero_id = {id}"))
        .unwrap_or_default();
    let log_comment = if hero_id.is_some() {
        "mmr_history_hero"
    } else {
        "mmr_history"
    };
    let badge = badge_from_flat_progress_sql(
        "assumeNotNull(player_rank_final_flat_progress)",
        "assumeNotNull(player_rank_initial_display_rank)",
    );
    format!(
        "
    SELECT
        account_id,
        match_id,
        start_time,
        toFloat64((intDiv(rank, 10) - 1) * 6 + rank % 10) AS player_score,
        rank,
        toUInt32(intDiv(rank, 10)) AS division,
        toUInt32(rank % 10) AS division_tier
    FROM (
        SELECT
            account_id,
            match_id,
            start_time,
            {badge} AS rank
        FROM match_player
        WHERE account_id = {account_id}
        {hero_filter}
        AND match_mode = 'Ranked'
        AND player_rank_initial_display_rank > 0
        AND player_rank_final_flat_progress IS NOT NULL
    )
    ORDER BY match_id
    SETTINGS log_comment = '{log_comment}', apply_patch_parts = 0, max_threads = 32
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
    summary = "MMR History (Deprecated)",
    description = "
Deprecated. The MMR estimate is gone, this now returns one entry per ranked match with the rank
Valve reported for the player at the end of that match.

Use the `ranked_display_badge` and `ranked_delta` fields of `/v1/players/{account_id}/match-history`
instead.
",
)]
#[deprecated(note = "use the ranked_* fields of `/v1/players/{account_id}/match-history`")]
pub(super) async fn mmr_history(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
) -> APIResult<impl IntoResponse> {
    apply_mmr_rate_limits(&state, &rate_limit_key).await?;
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }
    get_mmr_history(&state.ch_client_ro, account_id)
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/{account_id}/mmr-history/{hero_id}",
    params(HeroMMRHistoryPath),
    responses(
        (status = OK, description = "Hero MMR History", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero mmr history")
    ),
    tags = ["MMR"],
    summary = "Hero MMR History (Deprecated)",
    description = "
Deprecated. Valve reports a single account-wide rank, not a per-hero one, so this returns the
player's rank at the end of each ranked match they played on that hero.

Use the `ranked_display_badge` and `ranked_delta` fields of `/v1/players/{account_id}/match-history`
instead.
",
)]
#[deprecated(note = "use the ranked_* fields of `/v1/players/{account_id}/match-history`")]
pub(super) async fn hero_mmr_history(
    Path(HeroMMRHistoryPath {
        account_id,
        hero_id,
    }): Path<HeroMMRHistoryPath>,
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
) -> APIResult<impl IntoResponse> {
    apply_mmr_rate_limits(&state, &rate_limit_key).await?;
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }
    get_hero_mmr_history(&state.ch_client_ro, account_id, hero_id)
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
        fn mmr_history_build_query_is_valid_sql(account_id in any::<u32>()) {
            assert_valid_sql(&build_mmr_history_query(account_id));
        }

        #[test]
        fn mmr_history_build_hero_query_is_valid_sql(
            account_id in any::<u32>(),
            hero_id in any::<u8>(),
        ) {
            assert_valid_sql(&build_hero_mmr_history_query(account_id, hero_id));
        }
    }
}
