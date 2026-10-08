use std::sync::Arc;

use crate::routes::v1::players::ensure_not_protected;
use crate::utils::sql::impl_match_info;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::GameMode;
use crate::routes::v1::players::roster_stats::{RosterSide, RosterStatsQuery};
use crate::routes::v1::players::steam::route::SteamProfileBatcher;
use crate::utils::sql::cached_ch_query;
use crate::utils::types::AccountIdQuery;

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct MateStatsQuery {
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(
        default = "GameMode::default_option",
        deserialize_with = "GameMode::deserialize_option"
    )]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on their start time (Unix timestamp).
    min_unix_timestamp: Option<i64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<i64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// Filter based on the number of matches played.
    #[serde(default)]
    min_matches_played: Option<u64>,
    /// Filter based on the number of matches played.
    #[serde(default)]
    max_matches_played: Option<u64>,
    /// Filter based on whether the mates were on the same party.
    /// Two players are considered to be in the same party if they were on the same team and are
    /// Steam friends as of the match start time (per the `steam_profiles` friends list).
    #[serde(default)]
    #[param(default = false)]
    same_party: bool,
}

impl_match_info!(MateStatsQuery, without_badge);

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct MateStats {
    pub mate_id: u32,
    wins: u64,
    matches_played: u64,
    matches: Vec<u64>,
}

fn build_query(account_id: u32, query: &MateStatsQuery, friend_ids: Option<&[u32]>) -> String {
    // The same-party filter restricts mates to the account's Steam friends.
    RosterStatsQuery {
        side: RosterSide::Mate,
        account_id,
        game_mode: query.game_mode,
        match_info: query.match_info(),
        min_matches_played: query.min_matches_played,
        max_matches_played: query.max_matches_played,
        other_ids: friend_ids,
    }
    .build()
}

cached_ch_query! {
    /// Short-lived: an account's roster changes with every new match.
    fn run_query(1_000, 60) -> Vec<MateStats>;
}

async fn fetch_friend_account_ids(
    steam_profile_batcher: &SteamProfileBatcher,
    account_id: u32,
) -> APIResult<Vec<u32>> {
    // Reuse the shared steam_profile batcher, which already projects `friends.account_id`,
    // instead of issuing a dedicated per-request query.
    match steam_profile_batcher.load(account_id).await {
        Ok(profile) => Ok(profile.friends_account_id),
        // A missing steam profile simply means there is no friends list to filter on.
        Err(APIError::StatusMsg { status, .. }) if status == StatusCode::NOT_FOUND => {
            Ok(Vec::new())
        }
        Err(e) => Err(e),
    }
}

async fn get_mate_stats(
    ch_client: &clickhouse::Client,
    steam_profile_batcher: &SteamProfileBatcher,
    account_id: u32,
    query: MateStatsQuery,
) -> APIResult<Arc<Vec<MateStats>>> {
    let friend_ids = if query.same_party {
        let ids = fetch_friend_account_ids(steam_profile_batcher, account_id).await?;
        if ids.is_empty() {
            return Ok(Arc::default());
        }
        Some(ids)
    } else {
        None
    };
    let sql = build_query(account_id, &query, friend_ids.as_deref());
    debug!(?sql);
    Ok(run_query(ch_client, &sql).await?)
}

#[utoipa::path(
    get,
    path = "/{account_id}/mate-stats",
    params(AccountIdQuery, MateStatsQuery),
    responses(
        (status = OK, description = "Mate Stats", body = [MateStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch mate stats")
    ),
    tags = ["Players"],
    summary = "Mate Stats",
    description = "
This endpoint returns the mate stats.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn mate_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<MateStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    ensure_not_protected(&state, &[account_id]).await?;
    get_mate_stats(
        &state.ch_client_ro,
        &state.batchers.steam_profile,
        account_id,
        query,
    )
    .await
    .map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roster_filters_are_prewhere_and_friend_filter_stays_in_where() {
        let sql = build_query(7, &MateStatsQuery::default(), Some(&[1, 2]));
        let (_, after_prewhere) = sql.split_once("PREWHERE").expect("has PREWHERE");
        let (prewhere, where_clause) = after_prewhere.split_once("WHERE").expect("has WHERE");
        assert!(prewhere.contains("account_id = 7"));
        assert!(!prewhere.contains("mate_id"));
        assert!(where_clause.contains("mate_id IN"));

        let sql = build_query(7, &MateStatsQuery::default(), None);
        assert!(!sql.replace("PREWHERE", "").contains("WHERE"));
    }
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn mate_stats_build_query_is_valid_sql(
            account_id in any::<u32>(),
            query: MateStatsQuery,
        ) {
            assert_valid_sql(&build_query(account_id, &query, None));
            assert_valid_sql(&build_query(account_id, &query, Some(&[1, 2, 3])));
        }
    }
}
