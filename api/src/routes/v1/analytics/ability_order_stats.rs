use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, PlayerFilters, filter_protected_accounts, join_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

#[allow(clippy::unnecessary_wraps)]
fn default_min_matches() -> Option<u32> {
    10.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct AbilityOrderStatsQuery {
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: u32,
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
    /// Filter players based on their minimum number of ability upgrades over the whole match.
    #[param(minimum = 0, maximum = 16)]
    min_ability_upgrades: Option<u64>,
    /// Filter players based on their maximum number of ability upgrades over the whole match.
    #[param(minimum = 1, maximum = 16)]
    max_ability_upgrades: Option<u64>,
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
    /// The minimum number of matches played for an ability order to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
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
    /// Comma separated list of item ids to include (only players who have purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only players who have not purchased these items). See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    exclude_item_ids: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct AnalyticsAbilityOrderStats {
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub abilities: Vec<u32>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &AbilityOrderStatsQuery) -> String {
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
    #[allow(deprecated)]
    let mut player_filters = PlayerFilters {
        hero_id: Some(query.hero_id),
        account_id: query.account_id,
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
        ..Default::default()
    }
    .build();
    if let Some(min_ability_upgrades) = query.min_ability_upgrades {
        player_filters.push(format!("length(abilities) >= {min_ability_upgrades}"));
    }
    if let Some(max_ability_upgrades) = query.max_ability_upgrades {
        player_filters.push(format!("length(abilities) <= {max_ability_upgrades}"));
    }
    let player_filters = join_filters(&player_filters);
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    format!(
        "
    WITH
        (SELECT groupArray(id) FROM items WHERE type = 'ability') AS ability_ids_array
    SELECT
        arrayFilter(x -> has(ability_ids_array, x), items.item_id) as abilities,
        countIf(won) AS wins,
        countIf(not won) AS losses,
        wins + losses AS matches,
        uniq(account_id) AS players,
        sum(kills) AS total_kills,
        sum(deaths) AS total_deaths,
        sum(assists) AS total_assists
    FROM match_player
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND {game_mode_filter}
        {info_filters}
        {player_filters}
    GROUP BY abilities
    HAVING matches >= {}
    ORDER BY matches DESC
    ",
        query.min_matches.unwrap_or_default()
    )
}

#[cached(
    ty = "TimedCache<String, Vec<AnalyticsAbilityOrderStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<AnalyticsAbilityOrderStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_ability_order_stats(
    ch_client: &clickhouse::Client,
    mut query: AbilityOrderStatsQuery,
) -> APIResult<Vec<AnalyticsAbilityOrderStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
}

#[utoipa::path(
    get,
    path = "/ability-order-stats",
    params(AbilityOrderStatsQuery),
    responses(
        (status = OK, description = "Ability Order Stats", body = [AnalyticsAbilityOrderStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch ability order stats")
    ),
    tags = ["Analytics"],
    summary = "Ability Order Stats",
    description = "
Retrieves statistics for the ability order of a hero.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn ability_order_stats(
    Query(mut query): Query<AbilityOrderStatsQuery>,
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
    #[allow(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    if !state.assets_client.validate_hero_id(query.hero_id).await {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Invalid hero_id: {}", query.hero_id),
        ));
    }
    get_ability_order_stats(&state.ch_client_ro, query)
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
        #[allow(deprecated)]
        fn ability_order_stats_build_query_is_valid_sql(query: AbilityOrderStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
