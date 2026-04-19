use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use strum::Display;
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

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum BucketQuery {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket Hero Stats By Max Average Badge Level (tier = first digits, subtier = last digit) of both teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    AvgBadge,
    /// Bucket Hero Stats By Start Time (Hour)
    StartTimeHour,
    /// Bucket Hero Stats By Start Time (Day)
    StartTimeDay,
    /// Bucket Hero Stats By Start Time (Week)
    StartTimeWeek,
    /// Bucket Hero Stats By Start Time (Month)
    StartTimeMonth,
}

impl BucketQuery {
    fn get_select_clause(self) -> &'static str {
        match self {
            Self::NoBucket => "toUInt32(0)",
            Self::AvgBadge => "toUInt32(max_avg_badge)",
            Self::StartTimeHour => "toStartOfHour(start_time)",
            Self::StartTimeDay => "toStartOfDay(start_time)",
            Self::StartTimeWeek => "toDateTime(toStartOfWeek(start_time))",
            Self::StartTimeMonth => "toDateTime(toStartOfMonth(start_time))",
        }
    }

    fn get_info_select_clause(self) -> &'static str {
        match self {
            Self::StartTimeHour
            | Self::StartTimeDay
            | Self::StartTimeWeek
            | Self::StartTimeMonth => ", start_time",
            Self::AvgBadge => {
                ", assumeNotNull(coalesce(greatest(average_badge_team0, average_badge_team1), 0)) as max_avg_badge"
            }
            Self::NoBucket => "",
        }
    }
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct HeroStatsQuery {
    /// Bucket allows you to group the stats by a specific field.
    #[serde(default)]
    #[param(inline)]
    bucket: BucketQuery,
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
    /// Filter players based on the number of matches they have played with a specific hero within the filtered time range.
    min_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero within the filtered time range.
    max_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero in their entire history.
    min_hero_matches_total: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero in their entire history.
    max_hero_matches_total: Option<u64>,
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
pub struct AnalyticsHeroStats {
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_id: u32,
    bucket: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    matches_per_bucket: u64,
    players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
    total_net_worth: u64,
    total_last_hits: u64,
    total_denies: u64,
    total_player_damage: u64,
    total_player_damage_taken: u64,
    total_boss_damage: u64,
    total_creep_damage: u64,
    total_neutral_damage: u64,
    total_max_health: u64,
    total_shots_hit: u64,
    total_shots_missed: u64,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &HeroStatsQuery) -> String {
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
        account_id: query.account_id,
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
        ..Default::default()
    }
    .build();
    if query.bucket == BucketQuery::NoBucket {
        player_filters.push("match_id IN t_matches".to_owned());
    }
    let player_filters = join_filters(&player_filters);
    let mut player_hero_filters = vec![];
    if let Some(min_hero_matches) = query.min_hero_matches {
        player_hero_filters.push(format!("uniq(match_id) >= {min_hero_matches}"));
    }
    if let Some(max_hero_matches) = query.max_hero_matches {
        player_hero_filters.push(format!("uniq(match_id) <= {max_hero_matches}"));
    }
    let player_hero_filters = if player_hero_filters.is_empty() {
        "TRUE".to_owned()
    } else {
        player_hero_filters.join(" AND ")
    };
    let mut player_hero_total_filters = vec![];
    if let Some(min_hero_matches) = query.min_hero_matches_total {
        player_hero_total_filters.push(format!("count() >= {min_hero_matches}"));
    }
    if let Some(max_hero_matches) = query.max_hero_matches_total {
        player_hero_total_filters.push(format!("count() <= {max_hero_matches}"));
    }
    let player_hero_total_filters = if player_hero_total_filters.is_empty() {
        "TRUE".to_owned()
    } else {
        player_hero_total_filters.join(" AND ")
    };
    let bucket = query.bucket.get_select_clause();
    let match_info_select = query.bucket.get_info_select_clause();
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    format!(
        "
    WITH t_matches AS (
            SELECT match_id {match_info_select}
            FROM match_info
            WHERE match_mode IN ('Ranked', 'Unranked')
                AND {game_mode_filter}
                {info_filters}
        )
        {}
        {}
    SELECT
        hero_id,
        {bucket} AS bucket,
        countIf(won) AS wins,
        countIf(not won) AS losses,
        wins + losses AS matches,
        {} AS matches_per_bucket,
        uniq(account_id) AS players,
        sum(kills) AS total_kills,
        sum(deaths) AS total_deaths,
        sum(assists) AS total_assists,
        sum(net_worth) AS total_net_worth,
        sum(last_hits) AS total_last_hits,
        sum(denies) AS total_denies,
        sum(max_player_damage) AS total_player_damage,
        sum(max_player_damage_taken) AS total_player_damage_taken,
        sum(max_boss_damage) AS total_boss_damage,
        sum(max_creep_damage) AS total_creep_damage,
        sum(max_neutral_damage) AS total_neutral_damage,
        sum(max_max_health) AS total_max_health,
        sum(max_shots_hit) AS total_shots_hit,
        sum(max_shots_missed) AS total_shots_missed
    FROM match_player FINAL
    {}
    WHERE TRUE {player_filters}
        {}
        {}
    GROUP BY hero_id, bucket
    ORDER BY hero_id, bucket
    ",
        if query
            .min_hero_matches
            .or(query.max_hero_matches)
            .is_some_and(|v| v > 1)
        {
            format!(
                ",
        t_players AS (
            SELECT account_id, hero_id
            FROM match_player
            WHERE match_id IN (SELECT match_id FROM t_matches)
                {player_filters}
            GROUP BY account_id, hero_id
            HAVING {player_hero_filters}
        )"
            )
        } else {
            String::new()
        },
        if query
            .min_hero_matches_total
            .or(query.max_hero_matches_total)
            .is_some_and(|v| v > 1)
        {
            format!(
                ",
        t_players2 AS (
            SELECT account_id, hero_id
            FROM player_match_history
            GROUP BY account_id, hero_id
            HAVING {player_hero_total_filters}
        )"
            )
        } else {
            String::new()
        },
        if query.bucket == BucketQuery::NoBucket {
            "matches".to_owned()
        } else {
            format!("sum(count(distinct match_id)) OVER (PARTITION BY {bucket})")
        },
        if query.bucket == BucketQuery::NoBucket {
            ""
        } else {
            "INNER JOIN t_matches USING (match_id)"
        },
        if query
            .min_hero_matches
            .or(query.max_hero_matches)
            .is_some_and(|v| v > 1)
        {
            "AND (account_id, hero_id) IN t_players"
        } else {
            ""
        },
        if query
            .min_hero_matches_total
            .or(query.max_hero_matches_total)
            .is_some_and(|v| v > 1)
        {
            "AND (account_id, hero_id) IN t_players2"
        } else {
            ""
        }
    )
}

#[cached(
    ty = "TimedCache<String, Vec<AnalyticsHeroStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<AnalyticsHeroStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_hero_stats(
    ch_client: &clickhouse::Client,
    mut query: HeroStatsQuery,
) -> APIResult<Vec<AnalyticsHeroStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(&query);
    debug!(?query_str);
    Ok(run_query(ch_client, &query_str).await?)
}

#[utoipa::path(
    get,
    path = "/hero-stats",
    params(HeroStatsQuery),
    responses(
        (status = OK, description = "Hero Stats", body = [AnalyticsHeroStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Stats",
    description = "
Retrieves performance statistics for each hero based on historical match data.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn hero_stats(
    Query(mut query): Query<HeroStatsQuery>,
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
    get_hero_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn hero_stats_build_query_is_valid_sql(query: HeroStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
