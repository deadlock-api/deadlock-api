use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::GameMode;
use crate::services::clickhouse_batcher::in_clause;
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

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct MateStats {
    pub mate_id: u32,
    wins: u64,
    matches_played: u64,
    matches: Vec<u64>,
}

fn build_query(account_id: u32, query: &MateStatsQuery, friend_ids: Option<&[u32]>) -> String {
    let mut history_filters = vec![];
    history_filters.push(format!("account_id = {account_id}"));
    history_filters.push("match_mode IN ('Ranked', 'Unranked')".to_owned());
    history_filters.push(GameMode::sql_filter(query.game_mode));
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        history_filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        history_filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        history_filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        history_filters.push(format!("match_id <= {max_match_id}"));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        history_filters.push(format!("duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        history_filters.push(format!("duration_s <= {max_duration_s}"));
    }
    let history_filters = if history_filters.is_empty() {
        String::new()
    } else {
        history_filters.join(" AND ")
    };

    let mut having_filters = vec![];
    if let Some(min_matches_played) = query.min_matches_played {
        having_filters.push(format!("matches_played >= {min_matches_played}"));
    }
    if let Some(max_matches_played) = query.max_matches_played {
        having_filters.push(format!("matches_played <= {max_matches_played}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };

    let friend_filter = match friend_ids {
        Some(ids) => format!(" AND account_id IN ({})", in_clause(ids)),
        None => String::new(),
    };

    format!(
        "
        WITH t_histories AS (SELECT match_id, player_team FROM player_match_history WHERE {history_filters})
        SELECT
            account_id as mate_id,
            countIf(won) as wins,
            uniq(match_id) as matches_played,
            groupUniqArray(match_id) as matches
        FROM (
            SELECT account_id, match_id, won
            FROM player_match_by_match
            WHERE (match_id, player_team) IN t_histories AND account_id != {account_id}{friend_filter}
            LIMIT 1 BY match_id, account_id
        )
        GROUP BY account_id
        {having_clause}
        ORDER BY matches_played DESC
        SETTINGS log_comment = 'mate_stats'
            "
    )
}

async fn fetch_friend_account_ids(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> APIResult<Vec<u32>> {
    let query = format!(
        "
        SELECT friends.account_id
        FROM steam_profiles FINAL
        WHERE account_id = {account_id}
        SETTINGS log_comment = 'mate_stats_friends'
        "
    );
    debug!(?query);
    let rows: Vec<Vec<u32>> = ch_client.query(&query).fetch_all().await?;
    Ok(rows.into_iter().next().unwrap_or_default())
}

async fn get_mate_stats(
    ch_client: &clickhouse::Client,
    account_id: u32,
    query: MateStatsQuery,
) -> APIResult<Vec<MateStats>> {
    let friend_ids = if query.same_party {
        let ids = fetch_friend_account_ids(ch_client, account_id).await?;
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        Some(ids)
    } else {
        None
    };
    let sql = build_query(account_id, &query, friend_ids.as_deref());
    debug!(?sql);
    Ok(ch_client.query(&sql).fetch_all().await?)
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
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }
    get_mate_stats(&state.ch_client_ro, account_id, query)
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
        fn mate_stats_build_query_is_valid_sql(
            account_id in any::<u32>(),
            query: MateStatsQuery,
        ) {
            assert_valid_sql(&build_query(account_id, &query, None));
            assert_valid_sql(&build_query(account_id, &query, Some(&[1, 2, 3])));
        }
    }
}
