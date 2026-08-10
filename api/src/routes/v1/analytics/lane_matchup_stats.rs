use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, PlayerFilters, default_min_matches_u64, filter_protected_accounts,
    join_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

/// End of the laning phase: late enough to separate duos, early enough to precede mid-game rotations.
const NET_WORTH_SAMPLE_S: u32 = 540;

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct LaneMatchupStatsQuery {
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(
        default = "GameMode::default_option",
        deserialize_with = "GameMode::deserialize_option"
    )]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on the match mode. Valid values: `unranked`, `private_lobby`, `coop_bot`, `ranked`, `server_test`, `tutorial`, `hero_labs`. **Default:** `ranked,unranked`.
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<crate::routes::v1::matches::types::MatchMode>(), 0..=4))"
        )
    )]
    match_mode: Option<Vec<MatchMode>>,
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
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// Comma separated list of hero ids the *ally* duo has to be drawn from. Omit to return every duo. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Comma separated list of hero ids the *enemy* duo has to be drawn from. Omit to return every duo. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    enemy_hero_ids: Option<Vec<u32>>,
    /// The minimum number of lane matchups played for a duo pairing to be included in the response.
    #[serde(default = "default_min_matches_u64")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u64>,
    /// The maximum number of lane matchups played for a duo pairing to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u64>,
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
pub struct LaneMatchupStats {
    /// The lane the matchup was played in. See the `lane_info` array of <https://api.deadlock-api.com/v1/assets/generic-data>.
    pub assigned_lane: u32,
    /// The ascending hero id pair that shared the lane. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_ids: Vec<u32>,
    /// The ascending hero id pair they laned against.
    pub enemy_hero_ids: Vec<u32>,
    /// The number of matches `hero_ids` won against `enemy_hero_ids` in this lane.
    pub wins: u64,
    /// The total number of lane matchups between `hero_ids` and `enemy_hero_ids` in this lane.
    pub matches_played: u64,
    /// Mean souls the duo is ahead by 9 minutes in, against that duo. Negative means behind.
    /// `0` when no counted matchup had net-worth samples for all four players.
    pub net_worth_diff_9min: f64,
    /// How many of `matches_played` carried net-worth samples for all four players.
    pub net_worth_matches: u64,
}

fn id_list(ids: &[u32]) -> String {
    ids.iter().map(ToString::to_string).join(", ")
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &LaneMatchupStatsQuery) -> String {
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
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());

    let account_prefilter = query.account_ids.as_ref().map_or_else(String::new, |ids| {
        format!(
            " AND match_id IN (SELECT match_id FROM match_player WHERE account_id IN ({}))",
            id_list(ids)
        )
    });

    // Sound only with both lists set: every player of a surviving lane is then in their union, so
    // dropping the rest before the GROUP BY cannot truncate a duo we still want.
    let hero_scope = match (&query.hero_ids, &query.enemy_hero_ids) {
        (Some(hero_ids), Some(enemy_hero_ids)) => {
            hero_ids.iter().chain(enemy_hero_ids).copied().collect_vec()
        }
        _ => vec![],
    };
    let hero_prefilter = join_filters(
        &PlayerFilters {
            hero_ids: Some(&hero_scope),
            ..Default::default()
        }
        .build(),
    );

    let mut duo_filters = vec![];
    if let Some(hero_ids) = &query.hero_ids {
        duo_filters.push(format!("hasAll([{}], hero_ids)", id_list(hero_ids)));
    }
    if let Some(enemy_hero_ids) = &query.enemy_hero_ids {
        duo_filters.push(format!(
            "hasAll([{}], enemy_hero_ids)",
            id_list(enemy_hero_ids)
        ));
    }
    let duo_filters = join_filters(&duo_filters);

    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("matches_played >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches_played <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };

    // `groupUniqArrayIf` rather than `groupArrayIf`: without FINAL an unmerged replica row
    // would duplicate a hero and push the duo past the `length = 2` check.
    format!(
        "
WITH lane_duos AS (
    WITH arrayFirst((nw, t) -> t >= {NET_WORTH_SAMPLE_S}, stats.net_worth, stats.time_stamp_s) AS sample_net_worth
    SELECT
        assigned_lane,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team0')) AS team0,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team1')) AS team1,
        anyIf(won, team = 'Team0') AS team0_won,
        anyIf(won, team = 'Team1') AS team1_won,
        toFloat64(sumIf(sample_net_worth, team = 'Team0')) - toFloat64(sumIf(sample_net_worth, team = 'Team1')) AS net_worth_lead,
        (countIf(sample_net_worth > 0, team = 'Team0') = 2 AND countIf(sample_net_worth > 0, team = 'Team1') = 2) AS both_sampled
    FROM match_player
    WHERE {match_mode_filter} AND {game_mode_filter}{info_filters} AND team IN ('Team0', 'Team1') AND assigned_lane > 0{account_prefilter}{hero_prefilter}
    GROUP BY match_id, assigned_lane
    HAVING length(team0) = 2 AND length(team1) = 2
)
SELECT
    assigned_lane,
    arrayMap(h -> toUInt32(h), duo) AS hero_ids,
    arrayMap(h -> toUInt32(h), enemy_duo) AS enemy_hero_ids,
    countIf(won) AS wins,
    COUNT() AS matches_played,
    round(avgIfOrDefault(net_worth_diff, both_sampled), 1) AS net_worth_diff_9min,
    countIf(both_sampled) AS net_worth_matches
FROM lane_duos
ARRAY JOIN
    [team0, team1] AS duo,
    [team1, team0] AS enemy_duo,
    [team0_won, team1_won] AS won,
    [net_worth_lead, -net_worth_lead] AS net_worth_diff
WHERE true{duo_filters}
GROUP BY assigned_lane, hero_ids, enemy_hero_ids
{having_clause}
ORDER BY matches_played DESC
SETTINGS log_comment = 'lane_matchup_stats', apply_patch_parts = 0
    "
    )
}

#[cached(
    ttl = 3600,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<LaneMatchupStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_lane_matchup_stats(
    ch_client: &clickhouse::Client,
    mut query: LaneMatchupStatsQuery,
) -> APIResult<Vec<LaneMatchupStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let ch_query = build_query(&query);
    debug!(?ch_query);
    Ok(run_query(ch_client, &ch_query).await?)
}

#[utoipa::path(
    get,
    path = "/lane-matchup-stats",
    params(LaneMatchupStatsQuery),
    responses(
        (status = OK, description = "Lane Matchup Stats", body = [LaneMatchupStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch lane matchup stats")
    ),
    tags = ["Analytics"],
    summary = "Lane Matchup Stats",
    description = "
Retrieves duo-versus-duo lane statistics: how a pair of heroes sharing a lane performed against the pair of heroes they laned against.

Only lanes where *both* sides fielded exactly two players are counted, and each lane contributes one row per side, so every matchup appears twice with the two sides swapped.

Pass `hero_ids` and `enemy_hero_ids` to scope the response to the duos you care about. Without them the full duo-versus-duo matrix is computed, which is a considerably more expensive query.

Results are cached for **1 hour**. The cache key is determined by the specific combination of filter parameters used in the query. Subsequent requests using the exact same filters within this timeframe will receive the cached response.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(super) async fn lane_matchup_stats(
    Query(mut query): Query<LaneMatchupStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_lane_matchup_stats(&state.ch_client_cached, query)
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
        fn lane_matchup_stats_build_query_is_valid_sql(query: LaneMatchupStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
