use core::ops::AddAssign;
use std::collections::HashMap;

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
    MatchInfoFilters, PlayerFilters, default_min_matches_u32, filter_protected_accounts,
    join_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

#[allow(clippy::unnecessary_wraps)]
fn default_comb_size() -> Option<u8> {
    6.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct HeroCombStatsQuery {
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
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
    /// Comma separated list of hero ids to include. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_hero_ids: Option<Vec<u32>>,
    /// Comma separated list of hero ids to exclude. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    exclude_hero_ids: Option<Vec<u32>>,
    /// Comma separated list of enemy hero ids to include. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_enemy_hero_ids: Option<Vec<u32>>,
    /// Comma separated list of enemy hero ids to exclude. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    exclude_enemy_hero_ids: Option<Vec<u32>>,
    /// The minimum number of matches played for a hero combination to be included in the response.
    #[serde(default = "default_min_matches_u32")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
    /// The combination size to return.
    #[serde(default = "default_comb_size")]
    #[param(minimum = 2, maximum = 6, default = 6)]
    comb_size: Option<u8>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    #[deprecated]
    account_id: Option<u32>,
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
pub struct HeroCombStats {
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_ids: Vec<u32>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
}

impl AddAssign<&HeroCombStats> for HeroCombStats {
    fn add_assign(&mut self, rhs: &Self) {
        self.wins += rhs.wins;
        self.losses += rhs.losses;
        self.matches += rhs.matches;
    }
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &HeroCombStatsQuery) -> String {
    let team_size = if query.game_mode == Some(GameMode::StreetBrawl) {
        4
    } else {
        6
    };
    let info_filters = MatchInfoFilters {
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
    let player_filters = join_filters(
        &PlayerFilters {
            min_networth: query.min_networth,
            max_networth: query.max_networth,
            ..Default::default()
        }
        .build(),
    );
    let mut account_filter_values: Vec<u32> = Vec::new();
    #[allow(deprecated)]
    if let Some(account_id) = query.account_id {
        account_filter_values.push(account_id);
    }
    if let Some(account_ids) = &query.account_ids {
        account_filter_values.extend(account_ids.iter().copied());
    }
    let has_account_filter = !account_filter_values.is_empty();
    let account_list = account_filter_values
        .iter()
        .map(ToString::to_string)
        .join(", ");
    let account_prefilter = if has_account_filter {
        format!(
            " AND match_id IN (SELECT match_id FROM match_player WHERE account_id IN ({account_list}))"
        )
    } else {
        String::new()
    };

    let mut grouped_filters = vec![];
    if has_account_filter {
        grouped_filters.push(format!("hasAny(account_ids, [{account_list}])"));
    }
    if let Some(include_hero_ids) = &query.include_hero_ids {
        grouped_filters.push(format!(
            "hasAll(hero_ids, [{}])",
            include_hero_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    if let Some(exclude_hero_ids) = &query.exclude_hero_ids {
        grouped_filters.push(format!(
            "not hasAny(hero_ids, [{}])",
            exclude_hero_ids.iter().map(ToString::to_string).join(", ")
        ));
    }
    if let Some(include_enemy_hero_ids) = &query.include_enemy_hero_ids {
        grouped_filters.push(format!(
            "hasAll(enemy_hero_ids, [{}])",
            include_enemy_hero_ids
                .iter()
                .map(ToString::to_string)
                .join(", ")
        ));
    }
    if let Some(exclude_enemy_hero_ids) = &query.exclude_enemy_hero_ids {
        grouped_filters.push(format!(
            "not hasAny(enemy_hero_ids, [{}])",
            exclude_enemy_hero_ids
                .iter()
                .map(ToString::to_string)
                .join(", ")
        ));
    }
    let grouped_filters = if grouped_filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", grouped_filters.join(" AND "))
    };
    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!(
            "({} < 6 OR matches >= {min_matches})",
            query.comb_size.unwrap_or(6)
        ));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let (cte_account_select, array_join_account) = if has_account_filter {
        (
            ",\n        groupArrayIf(account_id, team = 'Team0') AS team0_account_ids,\n        \
             groupArrayIf(account_id, team = 'Team1') AS team1_account_ids",
            ",\n    [team0_account_ids, team1_account_ids] AS account_ids",
        )
    } else {
        ("", "")
    };
    format!(
        "
WITH hero_combinations AS (
    SELECT
        arraySort(groupUniqArrayIf({team_size})(hero_id, team = 'Team0')) AS team0_hero_ids,
        arraySort(groupUniqArrayIf({team_size})(hero_id, team = 'Team1')) AS team1_hero_ids,
        anyIf(won, team = 'Team0') AS team0_won,
        anyIf(won, team = 'Team1') AS team1_won{cte_account_select}
    FROM match_player
    WHERE match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters}{account_prefilter} {player_filters}
    GROUP BY match_id
    HAVING length(team0_hero_ids) = {team_size} AND length(team1_hero_ids) = {team_size}
)
SELECT
    hero_ids,
    countIf(won) AS wins,
    countIf(not won) AS losses,
    wins + losses AS matches
FROM hero_combinations
ARRAY JOIN
    [team0_hero_ids, team1_hero_ids] AS hero_ids,
    [team1_hero_ids, team0_hero_ids] AS enemy_hero_ids,
    [team0_won, team1_won] AS won{array_join_account}
WHERE true {grouped_filters}
GROUP BY hero_ids
{having_clause}
ORDER BY wins / greatest(1, matches) DESC
    "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<HeroCombStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<HeroCombStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_comb_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroCombStatsQuery,
) -> APIResult<Vec<HeroCombStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let ch_query = build_query(&query);
    debug!(?ch_query);
    let comb_stats: Vec<HeroCombStats> = run_query(ch_client, &ch_query).await?;
    let comb_size = match query.comb_size {
        Some(6) | None => return Ok(comb_stats),
        Some(x) if !(2..=6).contains(&x) => {
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                "Combination size must be between 2 and 6".to_owned(),
            ));
        }
        Some(x) => x,
    };
    let mut comb_stats_agg = HashMap::new();
    for comb_stat in &comb_stats {
        for comb_hero_ids in comb_stat.hero_ids.iter().combinations(comb_size as usize) {
            *comb_stats_agg
                .entry(comb_hero_ids.clone())
                .or_insert_with(|| HeroCombStats {
                    hero_ids: comb_hero_ids.into_iter().copied().collect_vec(),
                    wins: 0,
                    losses: 0,
                    matches: 0,
                }) += comb_stat;
        }
    }
    Ok(comb_stats_agg
        .into_values()
        .filter(|c| {
            c.matches
                >= u64::from(
                    query
                        .min_matches
                        .or(default_min_matches_u32())
                        .unwrap_or_default(),
                )
                && c.matches <= u64::from(query.max_matches.unwrap_or(u32::MAX))
        })
        .sorted_by_key(|c| c.wins / c.matches)
        .rev()
        .collect())
}

#[utoipa::path(
    get,
    path = "/hero-comb-stats",
    params(HeroCombStatsQuery),
    responses(
        (status = OK, description = "Hero Comb Stats", body = [HeroCombStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero comb stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Comb Stats",
    description = "
Retrieves overall statistics for each hero combination.

Results are cached for **1 hour**. The cache key is determined by the specific combination of filter parameters used in the query. Subsequent requests using the exact same filters within this timeframe will receive the cached response.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn hero_comb_stats(
    Query(mut query): Query<HeroCombStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    #[allow(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    get_comb_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        #[allow(deprecated)]
        fn hero_comb_stats_build_query_is_valid_sql(query: HeroCombStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
