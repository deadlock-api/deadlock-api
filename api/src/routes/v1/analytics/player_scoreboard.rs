use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, default_min_matches_u32, filter_protected_accounts, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::analytics::scoreboard_types::ScoreboardQuerySortBy;
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::comma_separated_deserialize_option;
use crate::utils::types::SortDirectionDesc;

#[allow(clippy::unnecessary_wraps)]
fn default_limit() -> Option<u32> {
    100.into()
}

#[derive(Eq, Hash, PartialEq, Debug, Clone, Deserialize, IntoParams, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct PlayerScoreboardQuery {
    /// The field to sort by.
    #[param(inline)]
    sort_by: ScoreboardQuerySortBy,
    /// The direction to sort players in.
    #[serde(default)]
    #[param(inline)]
    sort_direction: SortDirectionDesc,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on the hero ID. See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: Option<u32>,
    /// The minimum number of matches played for a player to be included in the scoreboard.
    #[serde(default = "default_min_matches_u32")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
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
    /// Filter players based on their final net worth.
    min_networth: Option<u64>,
    /// Filter players based on their final net worth.
    max_networth: Option<u64>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// The offset to start fetching players from.
    start: Option<u32>,
    /// The maximum number of players to fetch.
    #[serde(default = "default_limit")]
    #[param(inline, default = "100", maximum = 10000, minimum = 1)]
    limit: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct PlayerEntry {
    rank: u64,
    account_id: u32,
    pub value: f64,
    pub matches: u64,
}

fn build_query(query: &PlayerScoreboardQuery) -> String {
    let mut inner_filters = vec!["account_id > 0".to_owned()];
    let needs_match_info_filter = query.min_unix_timestamp.is_some()
        || query.max_unix_timestamp.is_some()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some()
        || query.min_average_badge.is_some_and(|v| v > 11)
        || query.max_average_badge.is_some_and(|v| v < 116)
        || query.min_duration_s.is_some()
        || query.max_duration_s.is_some()
        || query.game_mode.is_some_and(|g| g != GameMode::Normal);
    if needs_match_info_filter {
        let match_info_filters = MatchInfoFilters {
            min_unix_timestamp: query.min_unix_timestamp,
            max_unix_timestamp: query.max_unix_timestamp,
            min_match_id: query.min_match_id,
            max_match_id: query.max_match_id,
            min_average_badge: query.min_average_badge,
            max_average_badge: query.max_average_badge,
            min_duration_s: query.min_duration_s,
            max_duration_s: query.max_duration_s,
        }
        .build();
        let game_mode_filter = GameMode::sql_filter(query.game_mode);
        inner_filters.push(format!(
            "match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {match_info_filters}"
        ));
    }
    if let Some(hero_id) = query.hero_id {
        inner_filters.push(format!("hero_id = {hero_id}"));
    }
    if let Some(min_networth) = query.min_networth {
        inner_filters.push(format!("net_worth >= {min_networth}"));
    }
    if let Some(max_networth) = query.max_networth {
        inner_filters.push(format!("net_worth <= {max_networth}"));
    }
    if let Some(account_ids) = &query.account_ids {
        inner_filters.push(format!(
            "has([{}], account_id)",
            account_ids.iter().map(|i| (*i).to_string()).join(", ")
        ));
    }
    let where_clause = format!(" WHERE {} ", inner_filters.join(" AND "));

    // FINAL streams the ReplacingMergeTree merge during read and beats the
    // hand-rolled (account_id, match_id) GROUP BY dedup 3-7x, but blocks the
    // planner from picking hero_stats_by_hero or the account_id bloom-filter
    // index — so when hero_id or account_ids is set, the inline dedup wins.
    let use_final = query.hero_id.is_none() && query.account_ids.is_none();

    let (from_clause, outer_where, matches_expr) = if use_final {
        (
            String::from(" FROM match_player FINAL "),
            where_clause.as_str(),
            "count()",
        )
    } else {
        let inner_projection = query
            .sort_by
            .inner_column()
            .map_or(String::new(), |col| format!(", any({col}) as {col}"));
        (
            format!(
                "
FROM (
    SELECT account_id, match_id{inner_projection}
    FROM match_player
    {where_clause}
    GROUP BY account_id, match_id
)"
            ),
            "",
            "uniq(match_id)",
        )
    };

    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("{matches_expr} >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("{matches_expr} <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!(" HAVING {} ", having_filters.join(" AND "))
    };
    let offset = query.start.unwrap_or(1).max(1) - 1;
    let select_clause = query.sort_by.get_select_clause();
    let sort_direction = query.sort_direction;
    let limit = query.limit.unwrap_or_default();

    format!(
        "
SELECT rowNumberInAllBlocks() + {offset} as rank, account_id, toFloat64({select_clause}) as \
         value, {matches_expr} as matches
{from_clause}
{outer_where}
GROUP BY account_id
{having_clause}
ORDER BY value {sort_direction}
LIMIT {limit} OFFSET {offset}
    "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<PlayerEntry>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<PlayerEntry>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_player_scoreboard(
    ch_client: &clickhouse::Client,
    mut query: PlayerScoreboardQuery,
) -> APIResult<Vec<PlayerEntry>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query = build_query(&query);
    debug!(?query);
    Ok(run_query(ch_client, &query).await?)
}

#[utoipa::path(
    get,
    path = "/players",
    params(PlayerScoreboardQuery),
    responses(
        (status = OK, description = "Player Scoreboard", body = [PlayerEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch player scoreboard")
    ),
    tags = ["Analytics"],
    summary = "Player Scoreboard",
    description = "
This endpoint returns the player scoreboard.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn player_scoreboard(
    Query(mut query): Query<PlayerScoreboardQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if query.game_mode.is_some_and(|g| g == GameMode::StreetBrawl)
        && (query.min_average_badge.is_some() || query.max_average_badge.is_some())
    {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Cannot filter by average badge for street brawl game mode".to_string(),
        });
    }
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_player_scoreboard(&state.ch_client_ro, query)
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
        fn player_scoreboard_build_query_is_valid_sql(query: PlayerScoreboardQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
