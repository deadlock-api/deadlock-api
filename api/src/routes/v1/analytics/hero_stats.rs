use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TtlCache;
use cached::macros::cached;
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
    /// Bucket Hero Stats By Max Average Badge Level (tier = first digits, subtier = last digit) of both teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
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
            Self::AvgBadge => {
                "toUInt32(assumeNotNull(coalesce(greatest(average_badge_team0, average_badge_team1), 0)))"
            }
            Self::StartTimeHour => "toStartOfHour(start_time)",
            Self::StartTimeDay => "toStartOfDay(start_time)",
            Self::StartTimeWeek => "toDateTime(toStartOfWeek(start_time))",
            Self::StartTimeMonth => "toDateTime(toStartOfMonth(start_time))",
        }
    }

    /// Bucket expression against the pre-aggregated `hero_stats_agg` view, or `None`
    /// for buckets it cannot serve. The view is grained on `day` (a `Date`), so
    /// `StartTimeHour` needs sub-day resolution it does not keep and runs against the
    /// base table. `AvgBadge` buckets by the per-match `greatest_badge` (stored as
    /// 65535 when null, which we map back to 0 to mirror `coalesce(..., 0)`).
    fn mv_bucket_expr(self) -> Option<&'static str> {
        match self {
            Self::NoBucket => Some("toUInt32(0)"),
            Self::AvgBadge => Some("toUInt32(if(greatest_badge = 65535, 0, greatest_badge))"),
            Self::StartTimeDay => Some("toStartOfDay(toDateTime(day))"),
            Self::StartTimeWeek => Some("toDateTime(toStartOfWeek(day))"),
            Self::StartTimeMonth => Some("toDateTime(toStartOfMonth(day))"),
            Self::StartTimeHour => None,
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
    #[serde(
        default = "GameMode::default_option",
        deserialize_with = "GameMode::deserialize_option"
    )]
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
    /// Filter players based on the number of matches they have played with a specific hero within the filtered time range.
    min_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero within the filtered time range.
    max_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero in their entire history.
    min_hero_matches_total: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero in their entire history.
    max_hero_matches_total: Option<u64>,
    /// Comma separated list of item ids to include (only players who have purchased these items). See more: <https://api.deadlock-api.com/v1/assets/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude (only players who have not purchased these items). See more: <https://api.deadlock-api.com/v1/assets/items>
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
    /// See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_id: u32,
    bucket: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    matches_per_bucket: u64,
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

/// Horizon of the `hero_stats_agg` materialized view, in days. Keep in sync with
/// the `INTERVAL ... DAY` in the view's refresh `SELECT`.
const MV_HORIZON_DAYS: i64 = 65;
/// Safety margin below the horizon: only route windows whose start sits
/// comfortably inside the materialized range, so a just-refreshed edge (the view
/// drops the oldest day as time advances) never under-serves a request.
const MV_ROUTING_MARGIN_DAYS: i64 = 5;

/// Builds a query against the pre-aggregated `hero_stats_agg` view when the request
/// falls within the "global meta" subset it materializes, else `None` (the caller
/// then uses the base-table query). The view is grained on
/// `(game_mode, day, hero_id, least_badge, greatest_badge)`, so it serves
/// `game_mode` + time-range + badge-range filters and the non-hourly buckets, but
/// anything per-player or per-row (account, item set, net worth, duration, match id,
/// hero match counts) or needing sub-day resolution must use the base table.
fn build_mv_query(query: &HeroStatsQuery) -> Option<String> {
    let bucket_expr = query.bucket.mv_bucket_expr()?;
    // Per-player / per-row filters the grain cannot express → base table.
    #[allow(deprecated)]
    let personalized = query.account_id.is_some()
        || query.account_ids.as_ref().is_some_and(|v| !v.is_empty())
        || query
            .include_item_ids
            .as_ref()
            .is_some_and(|v| !v.is_empty())
        || query
            .exclude_item_ids
            .as_ref()
            .is_some_and(|v| !v.is_empty());
    let unsupported_filter = query.min_networth.is_some()
        || query.max_networth.is_some()
        || query.min_duration_s.is_some()
        || query.max_duration_s.is_some()
        || query.min_match_id.is_some()
        || query.max_match_id.is_some()
        || query.min_hero_matches.is_some()
        || query.max_hero_matches.is_some()
        || query.min_hero_matches_total.is_some()
        || query.max_hero_matches_total.is_some();
    if personalized || unsupported_filter {
        return None;
    }

    // The view only holds the last MV_HORIZON_DAYS days; older windows use base.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs()
        .cast_signed();
    let oldest_servable = now - (MV_HORIZON_DAYS - MV_ROUTING_MARGIN_DAYS) * 86_400;
    if query
        .min_unix_timestamp
        .is_none_or(|min_ts| min_ts < oldest_servable)
    {
        return None;
    }

    let mut filters = vec![GameMode::sql_filter(query.game_mode)];
    if let Some(v) = query.min_unix_timestamp {
        filters.push(format!("day >= toDate({v})"));
    }
    if let Some(v) = query.max_unix_timestamp {
        filters.push(format!("day <= toDate({v})"));
    }
    // Badge: least/greatest mirror the base table's both-teams semantics, with the
    // same >11 / <116 guards as MatchInfoFilters. Null badges are stored as
    // 0 / 65535, so any active filter excludes them just like the base table.
    if let Some(v) = query.min_average_badge
        && v > 11
    {
        filters.push(format!("least_badge >= {v}"));
    }
    if let Some(v) = query.max_average_badge
        && v < 116
    {
        filters.push(format!("greatest_badge <= {v}"));
    }
    let where_clause = filters.join(" AND ");

    let matches_per_bucket = if query.bucket == BucketQuery::NoBucket {
        "matches".to_owned()
    } else {
        "sum(sum(n_matches)) OVER (PARTITION BY bucket)".to_owned()
    };

    Some(format!(
        "
    SELECT
        hero_id,
        {bucket_expr} AS bucket,
        sum(n_wins) AS wins,
        toUInt64(sum(n_matches) - sum(n_wins)) AS losses,
        sum(n_matches) AS matches,
        {matches_per_bucket} AS matches_per_bucket,
        sum(sum_kills) AS total_kills,
        sum(sum_deaths) AS total_deaths,
        sum(sum_assists) AS total_assists,
        sum(sum_net_worth) AS total_net_worth,
        sum(sum_last_hits) AS total_last_hits,
        sum(sum_denies) AS total_denies,
        sum(sum_player_damage) AS total_player_damage,
        sum(sum_player_damage_taken) AS total_player_damage_taken,
        sum(sum_boss_damage) AS total_boss_damage,
        sum(sum_creep_damage) AS total_creep_damage,
        sum(sum_neutral_damage) AS total_neutral_damage,
        sum(sum_max_health) AS total_max_health,
        sum(sum_shots_hit) AS total_shots_hit,
        sum(sum_shots_missed) AS total_shots_missed
    FROM hero_stats_agg
    WHERE {where_clause}
    GROUP BY hero_id, bucket
    ORDER BY hero_id, bucket
    SETTINGS log_comment = 'hero_stats_mv'
    "
    ))
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
    let player_filters = PlayerFilters {
        account_id: query.account_id,
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
        ..Default::default()
    }
    .build();
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
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_filters =
        format!("AND match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters}");
    let has_player_hero_cte = query
        .min_hero_matches
        .or(query.max_hero_matches)
        .is_some_and(|v| v > 1);
    let has_player_hero_total_cte = query
        .min_hero_matches_total
        .or(query.max_hero_matches_total)
        .is_some_and(|v| v > 1);
    let mut ctes: Vec<String> = vec![];
    if has_player_hero_cte {
        ctes.push(format!(
            "t_players AS (
            SELECT account_id, hero_id
            FROM match_player
            WHERE TRUE
                {player_filters}
                {match_filters}
            GROUP BY account_id, hero_id
            HAVING {player_hero_filters}
        )"
        ));
    }
    if has_player_hero_total_cte {
        ctes.push(format!(
            "t_players2 AS (
            SELECT account_id, hero_id
            FROM player_match_history
            GROUP BY account_id, hero_id
            HAVING {player_hero_total_filters}
        )"
        ));
    }
    let hero_matches_join = if has_player_hero_cte {
        "AND (account_id, hero_id) IN t_players"
    } else {
        ""
    };
    let hero_total_join = if has_player_hero_total_cte {
        "AND (account_id, hero_id) IN t_players2"
    } else {
        ""
    };
    // Deduplicate match_player with `LIMIT 1 BY match_id, account_id` instead of FINAL.
    // match_player is a ReplacingMergeTree with no version column, and duplicate rows are always
    // full duplicates, so this is equivalent to FINAL while letting the `hero_stats_by_account` /
    // `hero_stats_by_hero` projections be used (FINAL disables projection usage entirely).
    ctes.push(format!(
        "mp AS (
        SELECT
            hero_id, account_id, match_id, won, kills, deaths, assists, net_worth, last_hits, denies,
            max_player_damage, max_player_damage_taken, max_boss_damage, max_creep_damage,
            max_neutral_damage, max_max_health, max_shots_hit, max_shots_missed,
            start_time, average_badge_team0, average_badge_team1
        FROM match_player
        WHERE TRUE
            {player_filters}
            {match_filters}
            {hero_matches_join}
            {hero_total_join}
        LIMIT 1 BY match_id, account_id
    )"
    ));
    let with_clause = ctes.join(",\n    ");
    let matches_per_bucket = if query.bucket == BucketQuery::NoBucket {
        "matches".to_owned()
    } else {
        format!("sum(count(distinct match_id)) OVER (PARTITION BY {bucket})")
    };

    format!(
        "
    WITH {with_clause}
    SELECT
        hero_id,
        {bucket} AS bucket,
        countIf(won) AS wins,
        countIf(not won) AS losses,
        wins + losses AS matches,
        {matches_per_bucket} AS matches_per_bucket,
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
    FROM mp
    GROUP BY hero_id, bucket
    ORDER BY hero_id, bucket
    SETTINGS log_comment = 'hero_stats', apply_patch_parts = 0
    "
    )
}

#[cached(
    ty = "TtlCache<String, Vec<AnalyticsHeroStats>>",
    create = "{ TtlCache::with_ttl(std::time::Duration::from_secs(60*60)) }",
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
    let query_str = build_mv_query(&query).unwrap_or_else(|| build_query(&query));
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
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
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
    get_hero_stats(&state.ch_client_cached, query)
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
        fn hero_stats_build_query_is_valid_sql(query: HeroStatsQuery) {
            assert_valid_sql(&build_query(&query));
        }

        #[test]
        fn hero_stats_build_mv_query_is_valid_sql(mut query: HeroStatsQuery) {
            // Force routing into the MV path: clear the filters that disqualify it
            // and pick a min timestamp comfortably inside the horizon.
            #[allow(deprecated)]
            {
                query.account_id = None;
            }
            query.account_ids = None;
            query.include_item_ids = None;
            query.exclude_item_ids = None;
            query.min_networth = None;
            query.max_networth = None;
            query.min_duration_s = None;
            query.max_duration_s = None;
            query.min_match_id = None;
            query.max_match_id = None;
            query.min_hero_matches = None;
            query.max_hero_matches = None;
            query.min_hero_matches_total = None;
            query.max_hero_matches_total = None;
            query.min_unix_timestamp = Some(i64::MAX / 2);
            if let Some(mv) = build_mv_query(&query) {
                assert_valid_sql(&mv);
            }
        }
    }
}
