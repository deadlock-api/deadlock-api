use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    LaneDuoFilterSql, LaneDuoFilters, MatchInfoFilters, default_min_matches_u64,
    filter_protected_accounts, id_list, round_timestamps,
};
use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};

/// `stats.time_stamp_s` is recorded every 180s only up to 900, then coarsens to 300s steps, so any
/// other offset matches no sample at all.
const SAMPLE_TIMES_S: [u32; 5] = [180, 360, 540, 720, 900];

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct LaneSoulCurveQuery {
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
pub struct LaneSoulCurve {
    /// The lane the matchup was played in. See the `lane_info` array of <https://api.deadlock-api.com/v1/assets/generic-data>.
    pub assigned_lane: u32,
    /// The ascending hero id pair that shared the lane. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_ids: Vec<u32>,
    /// The ascending hero id pair they laned against.
    pub enemy_hero_ids: Vec<u32>,
    /// Seconds into the match each entry of `net_worth_diff` was sampled at, ascending.
    pub sample_times_s: Vec<u32>,
    /// Mean souls the duo is ahead by at the matching entry of `sample_times_s`. Negative means
    /// behind. Same length as `sample_times_s`.
    pub net_worth_diff: Vec<f64>,
    /// Population standard deviation of the lead across the counted matchups, at the matching entry
    /// of `sample_times_s`. Same length as `sample_times_s`.
    ///
    /// Spread between individual games, not uncertainty about the mean: it stays wide however many
    /// matchups are counted, because lane outcomes genuinely differ that much.
    pub net_worth_diff_std: Vec<f64>,
    /// Lane matchups behind the curve, counted at its *least* covered sample. A match that ended
    /// before 900s still contributes to the earlier points, so the earlier points rest on at least
    /// this many matchups and never fewer.
    pub matches_played: u64,
}

fn build_query(query: &LaneSoulCurveQuery) -> String {
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
    let sample_times = id_list(&SAMPLE_TIMES_S);

    let LaneDuoFilterSql {
        account_prefilter,
        hero_prefilter,
        duo_filters,
    } = LaneDuoFilters {
        accounts: query.account_ids.as_deref(),
        heroes: query.hero_ids.as_deref(),
        enemy_heroes: query.enemy_hero_ids.as_deref(),
    }
    .build();

    let having_clause = query
        .min_matches
        .map_or_else(String::new, |min| format!("HAVING matches_played >= {min}"));

    // `groupUniqArrayIf` rather than `groupArrayIf`: without FINAL an unmerged replica row would
    // duplicate a hero and push the duo past the `length = 2` check.
    format!(
        "
WITH lane_samples AS (
    SELECT
        assigned_lane,
        time_stamp_s AS t,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team0')) AS team0,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team1')) AS team1,
        toFloat64(sumIf(sample_net_worth, team = 'Team0')) - toFloat64(sumIf(sample_net_worth, team = 'Team1')) AS lead
    FROM match_player
    ARRAY JOIN stats.net_worth AS sample_net_worth, stats.time_stamp_s AS time_stamp_s
    WHERE {match_mode_filter} AND {game_mode_filter}{info_filters} AND team IN ('Team0', 'Team1') AND assigned_lane > 0 AND time_stamp_s IN ({sample_times}){account_prefilter}{hero_prefilter}
    GROUP BY match_id, assigned_lane, time_stamp_s
    HAVING length(team0) = 2 AND length(team1) = 2
),
per_time AS (
    SELECT
        assigned_lane,
        arrayMap(h -> toUInt32(h), duo) AS hero_ids,
        arrayMap(h -> toUInt32(h), enemy_duo) AS enemy_hero_ids,
        t,
        round(avg(net_worth_diff), 1) AS mean_diff,
        round(stddevPop(net_worth_diff), 1) AS std_diff,
        COUNT() AS sample_matches
    FROM lane_samples
    ARRAY JOIN
        [team0, team1] AS duo,
        [team1, team0] AS enemy_duo,
        [lead, -lead] AS net_worth_diff
    WHERE true{duo_filters}
    GROUP BY assigned_lane, hero_ids, enemy_hero_ids, t
)
SELECT
    assigned_lane,
    hero_ids,
    enemy_hero_ids,
    arrayMap(x -> x.1, arraySort(groupArray((t, mean_diff, std_diff))) AS curve) AS sample_times_s,
    arrayMap(x -> x.2, curve) AS net_worth_diff,
    arrayMap(x -> x.3, curve) AS net_worth_diff_std,
    min(sample_matches) AS matches_played
FROM per_time
GROUP BY assigned_lane, hero_ids, enemy_hero_ids
{having_clause}
ORDER BY matches_played DESC
SETTINGS log_comment = 'lane_soul_curve', apply_patch_parts = 0
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
) -> clickhouse::error::Result<Vec<LaneSoulCurve>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_lane_soul_curve(
    ch_client: &clickhouse::Client,
    mut query: LaneSoulCurveQuery,
) -> APIResult<Vec<LaneSoulCurve>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let ch_query = build_query(&query);
    debug!(?ch_query);
    Ok(run_query(ch_client, &ch_query).await?)
}

#[utoipa::path(
    get,
    path = "/lane-soul-curve",
    params(LaneSoulCurveQuery),
    responses(
        (status = OK, description = "Lane Soul Curve", body = [LaneSoulCurve]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch lane soul curve")
    ),
    tags = ["Analytics"],
    summary = "Lane Soul Curve",
    description = "
Retrieves how a duo's soul lead over the duo they laned against develops through the first 15 minutes.

The curve is sampled at 180, 360, 540, 720 and 900 seconds and is not interpolated; its last point is the `net_worth_diff_15min` of `/lane-matchup-stats`. Only lanes where *both* sides fielded exactly two players are counted, and each lane contributes one row per side, so every matchup appears twice with the two sides swapped.

Pass `hero_ids` and `enemy_hero_ids` to scope the response to the duos you care about. Without them the full duo-versus-duo matrix is computed, which is a considerably more expensive query.

Results are cached for **1 hour** based on the combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(super) async fn lane_soul_curve(
    Query(mut query): Query<LaneSoulCurveQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_lane_soul_curve(&state.ch_client_cached, query)
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
        fn lane_soul_curve_build_query_is_valid_sql(query: LaneSoulCurveQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
