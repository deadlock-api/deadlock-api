use std::sync::Arc;

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
use crate::routes::v1::matches::types::GameMode;
use crate::routes::v1::players::ensure_not_protected;
use crate::routes::v1::players::roster_stats::{RosterSide, RosterStatsQuery};
use crate::utils::sql::{cached_ch_query, impl_match_info};
use crate::utils::types::AccountIdQuery;

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct EnemyStatsQuery {
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
}

impl_match_info!(EnemyStatsQuery, without_badge);

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct EnemyStats {
    pub enemy_id: u32,
    /// The amount of matches won against the enemy.
    wins: u64,
    matches_played: u64,
    matches: Vec<u64>,
}

fn build_query(account_id: u32, query: &EnemyStatsQuery) -> String {
    RosterStatsQuery {
        side: RosterSide::Enemy,
        account_id,
        game_mode: query.game_mode,
        match_info: query.match_info(),
        min_matches_played: query.min_matches_played,
        max_matches_played: query.max_matches_played,
        other_ids: None,
    }
    .build()
}

cached_ch_query! {
    /// Short-lived: an account's roster changes with every new match.
    fn run_query(1_000, 60) -> Vec<EnemyStats>;
}

async fn get_enemy_stats(
    ch_client: &clickhouse::Client,
    account_id: u32,
    query: EnemyStatsQuery,
) -> APIResult<Arc<Vec<EnemyStats>>> {
    let query = build_query(account_id, &query);
    debug!(?query);
    Ok(run_query(ch_client, &query).await?)
}

#[utoipa::path(
    get,
    path = "/{account_id}/enemy-stats",
    params(AccountIdQuery, EnemyStatsQuery),
    responses(
        (status = OK, description = "Enemy Stats", body = [EnemyStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch enemy stats")
    ),
    tags = ["Players"],
    summary = "Enemy Stats",
    description = "
This endpoint returns the enemy stats.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn enemy_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<EnemyStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    ensure_not_protected(&state, &[account_id]).await?;
    get_enemy_stats(&state.ch_client_ro, account_id, query)
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
        fn enemy_stats_build_query_is_valid_sql(
            account_id in any::<u32>(),
            query: EnemyStatsQuery,
        ) {
            assert_valid_sql(&build_query(account_id, &query));
        }
    }
}
