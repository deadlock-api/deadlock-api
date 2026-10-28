use std::collections::HashSet;

use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use strum::Display;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    DEFAULT_MIN_MATCHES, ability_order_prefix_filter, ability_unlock_order_prefix_filter,
    default_min_matches_u64, filter_protected_accounts, round_demo_timestamps,
};
use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::types::MatchMode;
use crate::utils::parse::{comma_separated_deserialize_option, default_last_month_timestamp};
use crate::utils::sql::{cached_ch_query, id_list, impl_match_info, join_filters};

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum BucketQuery {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket Hero Build Stats By Average Badge Level (tier = first digits, subtier = last digit) of both teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    AvgBadge,
    /// Bucket Hero Build Stats By Start Time (Day)
    StartTimeDay,
    /// Bucket Hero Build Stats By Start Time (Week)
    StartTimeWeek,
    /// Bucket Hero Build Stats By Match Duration, in 10-minute steps: the bucket is the step's start in seconds
    /// (`1200` for matches of 20 to 30 minutes).
    Duration,
}

impl BucketQuery {
    const fn select_expr(self) -> &'static str {
        match self {
            Self::NoBucket => "toUInt32(0)",
            Self::AvgBadge => "toUInt32(assumeNotNull(coalesce(mp.average_badge, 0)))",
            Self::StartTimeDay => "toUInt32(toStartOfDay(mp.start_time))",
            Self::StartTimeWeek => "toUInt32(toDateTime(toStartOfWeek(mp.start_time)))",
            Self::Duration => "toUInt32(intDiv(mp.duration_s, 600) * 600)",
        }
    }
}

/// The performance totals, in the order of their [`HeroBuildStats`] fields: (column, `match_player` expression).
const PERFORMANCE: &[(&str, &str)] = &[
    ("total_kills", "sum(mp.kills)"),
    ("total_deaths", "sum(mp.deaths)"),
    ("total_assists", "sum(mp.assists)"),
    ("total_net_worth", "sum(mp.net_worth)"),
    ("total_last_hits", "sum(mp.last_hits)"),
    ("total_denies", "sum(mp.denies)"),
    ("total_player_damage", "sum(mp.max_player_damage)"),
    (
        "total_player_damage_taken",
        "sum(mp.max_player_damage_taken)",
    ),
    ("total_boss_damage", "sum(mp.max_boss_damage)"),
    ("total_creep_damage", "sum(mp.max_creep_damage)"),
    ("total_neutral_damage", "sum(mp.max_neutral_damage)"),
    ("total_max_health", "sum(mp.max_max_health)"),
    ("total_shots_hit", "sum(mp.max_shots_hit)"),
    ("total_shots_missed", "sum(mp.max_shots_missed)"),
    ("total_hero_bullets_hit", "sum(mp.max_hero_bullets_hit)"),
    (
        "total_hero_bullets_hit_crit",
        "sum(mp.max_hero_bullets_hit_crit)",
    ),
    ("total_self_healing", "sum(mp.max_self_healing)"),
    ("total_player_healing", "sum(mp.max_player_healing)"),
    ("total_teammate_healing", "sum(mp.max_teammate_healing)"),
    ("total_damage_mitigated", "sum(mp.max_damage_mitigated)"),
    ("total_creep_kills", "sum(mp.max_creep_kills)"),
    ("total_neutral_kills", "sum(mp.max_neutral_kills)"),
    ("total_level", "sum(mp.max_level)"),
    ("total_duration_s", "sum(mp.duration_s)"),
    (
        "avg_average_badge",
        "ifNotFinite(avgIf(mp.average_badge, mp.average_badge IS NOT NULL), 0)",
    ),
];

/// The performance columns: their aggregates, or typed nulls (read nothing) when not asked for. They triple the bytes
/// a query reads, so a plain request does without them.
fn performance_columns(include: bool) -> String {
    PERFORMANCE
        .iter()
        .map(|(column, expr)| {
            let ty = if *column == "avg_average_badge" {
                "Float64"
            } else {
                "UInt64"
            };
            if include {
                format!("toNullable({expr}) AS {column}")
            } else {
                format!("CAST(NULL, 'Nullable({ty})') AS {column}")
            }
        })
        .collect::<Vec<_>>()
        .join(",\n        ")
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub(super) struct HeroBuildStatsPath {
    /// The hero ID to fetch build stats for. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    hero_id: u32,
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct HeroBuildStatsQuery {
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
    /// Bucket allows you to group the stats by a specific field. `min_matches` applies to each build and bucket.
    #[serde(default)]
    #[param(inline)]
    bucket: BucketQuery,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago. **Minimum:** March 1, 2026.
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
    /// Filter results for a specific hero build.
    hero_build_id: Option<u64>,
    /// Add the performance totals (kills, souls, damage, healing, accuracy, match length, average badge) to every
    /// build. They make the query read about three times as much data, so they are left out unless asked for.
    include_performance: Option<bool>,
    /// The minimum number of matches played for a build to be included in the response.
    #[serde(default = "default_min_matches_u64")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u64>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "steam_id::de::account_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "steam_id::de::account_ids_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players whose ability upgrade order starts with exactly this sequence (one entry per ability point spent, unlocks included; see `ability_unlock_order_prefix` to match only the unlock order). See more: <https://api.deadlock-api.com/v1/analytics/ability-order-stats>
    // Order matters, and repeated keys reach the API reordered: clients must send one `a,b` value.
    #[param(explode = false)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    ability_order_prefix: Option<Vec<u32>>,
    /// Comma separated list of ability ids: only players who unlocked (put their first point into) their abilities in exactly this order, e.g. `a,b` for players who unlocked `a` first and `b` second. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    // Order matters, and repeated keys reach the API reordered: clients must send one `a,b` value.
    #[param(explode = false)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    ability_unlock_order_prefix: Option<Vec<u32>>,
}

impl_match_info!(HeroBuildStatsQuery);

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroBuildStats {
    /// The ID of the hero. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_id: u8,
    /// The ID of the hero build. The `hero_build_id` is the first build the player had selected when the game started.
    pub hero_build_id: u64,
    /// The bucket value (depends on the bucket query parameter, 0 without one).
    pub bucket: u32,
    /// The number of wins with this build.
    pub wins: u64,
    /// The number of losses with this build.
    pub losses: u64,
    /// The total number of matches played with this build (`wins + losses`).
    pub matches: u64,
    /// The number of unique players who used this build.
    pub players: u64,
    /// Sum of the kills of every match with this build. Average per match: `total_kills / matches`. This and the
    /// other totals are only present with `include_performance=true`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_kills: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_deaths: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_assists: Option<u64>,
    /// Sum of the final net worth (souls).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_net_worth: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_last_hits: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_denies: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_player_damage: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_player_damage_taken: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_boss_damage: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_creep_damage: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_neutral_damage: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_max_health: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_shots_hit: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_shots_missed: Option<u64>,
    /// Bullets that hit an enemy hero.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_hero_bullets_hit: Option<u64>,
    /// Hero hits that were crits (headshots).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_hero_bullets_hit_crit: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_self_healing: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_player_healing: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_teammate_healing: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_damage_mitigated: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_creep_kills: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_neutral_kills: Option<u64>,
    /// Sum of the final hero levels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_level: Option<u64>,
    /// Sum of the match durations (seconds), for per-minute rates.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_duration_s: Option<u64>,
    /// Average badge (tier = first digits, subtier = last digit) of the matches with this build that have one; 0 without any. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avg_average_badge: Option<f64>,
}

fn build_query(hero_id: u32, query: &HeroBuildStatsQuery) -> String {
    let info_filters = query.match_info().build_with_prefix("mp.");
    let match_mode_filter = MatchMode::sql_filter_with_prefix(query.match_mode.as_deref(), "mp.");
    let mut player_filters = vec![format!("mp.hero_id = {hero_id}")];
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("mp.account_id = {account_id}"));
    }
    if let Some(account_ids) = &query.account_ids {
        player_filters.push(format!("mp.account_id IN ({})", id_list(account_ids)));
    }
    if let Some(hero_build_id) = query.hero_build_id {
        player_filters.push(format!("mp.hero_build_id = {hero_build_id}"));
    }
    if let Some(ids) = &query.ability_order_prefix
        && !ids.is_empty()
    {
        player_filters.push(ability_order_prefix_filter(ids));
    }
    if let Some(ids) = &query.ability_unlock_order_prefix
        && !ids.is_empty()
    {
        player_filters.push(ability_unlock_order_prefix_filter(ids));
    }
    let player_filters = join_filters(&player_filters);
    let min_matches = query.min_matches.unwrap_or(DEFAULT_MIN_MATCHES);
    let bucket_expr = query.bucket.select_expr();
    let performance = performance_columns(query.include_performance.unwrap_or_default());
    format!(
        "
    SELECT
        mp.hero_id AS hero_id,
        assumeNotNull(mp.hero_build_id) AS hero_build_id,
        {bucket_expr} AS bucket,
        countIf(mp.won) AS wins,
        countIf(NOT mp.won) AS losses,
        wins + losses AS matches,
        uniq(mp.account_id) AS players,
        {performance}
    FROM match_player mp
    WHERE {match_mode_filter} AND mp.game_mode = 1
      AND mp.demo_processed = 1 AND mp.hero_build_id IS NOT NULL
      {info_filters} {player_filters}
    GROUP BY hero_id, hero_build_id, bucket
    HAVING matches >= {min_matches}
    ORDER BY matches DESC, bucket
    SETTINGS log_comment = 'hero_build_stats', apply_patch_parts = 0
    "
    )
}

async fn fetch_valid_build_ids(pg_client: &Pool<Postgres>, hero_id: u32) -> sqlx::Result<Vec<i32>> {
    sqlx::query_scalar::<_, i32>("SELECT DISTINCT build_id FROM hero_builds WHERE hero = $1")
        .bind(hero_id.cast_signed())
        .fetch_all(pg_client)
        .await
}

cached_ch_query! {
    fn run_query(3600) -> Vec<HeroBuildStats>;
}

async fn get_hero_build_stats(
    ch_client: &clickhouse::Client,
    hero_id: u32,
    valid_build_ids: &[i32],
    mut query: HeroBuildStatsQuery,
) -> APIResult<Vec<HeroBuildStats>> {
    round_demo_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query_str = build_query(hero_id, &query);
    debug!(
        hero_id,
        num_valid_builds = valid_build_ids.len(),
        "running hero build stats query"
    );
    let stats = run_query(ch_client, &query_str).await?;
    Ok(retain_valid_builds(&stats, valid_build_ids))
}

/// Popular heroes have tens of thousands of builds, more than fit in a query as an `IN` list
/// before `max_query_size` rejects the statement, so the query returns every build and the
/// set is applied here. An empty set applies no filter, as the `IN` list never did.
fn retain_valid_builds(stats: &[HeroBuildStats], valid_build_ids: &[i32]) -> Vec<HeroBuildStats> {
    if valid_build_ids.is_empty() {
        return stats.to_vec();
    }
    let valid: HashSet<u64> = valid_build_ids
        .iter()
        .filter_map(|id| u64::try_from(*id).ok())
        .collect();
    stats
        .iter()
        .filter(|s| valid.contains(&s.hero_build_id))
        .cloned()
        .collect()
}

#[utoipa::path(
    get,
    path = "/hero-build-stats/{hero_id}",
    params(HeroBuildStatsPath, HeroBuildStatsQuery),
    responses(
        (status = OK, description = "Hero Build Stats", body = [HeroBuildStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero build stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Build Stats",
    description = super::describe("
Retrieves performance statistics for hero builds based on historical match data from demo analysis.

Only includes builds that exist in the hero builds database.

The `hero_build_id` is the first build the player had selected when the game started. It does not reflect any build changes made during the match.

Results are cached for **1 hour** based on the combination of query parameters provided.

    ")
)]
pub(super) async fn hero_build_stats(
    Path(HeroBuildStatsPath { hero_id }): Path<HeroBuildStatsPath>,
    Query(mut query): Query<HeroBuildStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    let valid_build_ids = fetch_valid_build_ids(&state.pg_client, hero_id).await?;
    get_hero_build_stats(&state.ch_client_ro, hero_id, &valid_build_ids, query)
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
        fn hero_build_stats_build_query_is_valid_sql(
            hero_id in any::<u32>(),
            query: HeroBuildStatsQuery,
        ) {
            assert_valid_sql(&build_query(hero_id, &query));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stats(hero_build_id: u64) -> HeroBuildStats {
        HeroBuildStats {
            hero_id: 13,
            hero_build_id,
            bucket: 0,
            wins: 1,
            losses: 1,
            matches: 2,
            players: 2,
            total_kills: None,
            total_deaths: None,
            total_assists: None,
            total_net_worth: None,
            total_last_hits: None,
            total_denies: None,
            total_player_damage: None,
            total_player_damage_taken: None,
            total_boss_damage: None,
            total_creep_damage: None,
            total_neutral_damage: None,
            total_max_health: None,
            total_shots_hit: None,
            total_shots_missed: None,
            total_hero_bullets_hit: None,
            total_hero_bullets_hit_crit: None,
            total_self_healing: None,
            total_player_healing: None,
            total_teammate_healing: None,
            total_damage_mitigated: None,
            total_creep_kills: None,
            total_neutral_kills: None,
            total_level: None,
            total_duration_s: None,
            avg_average_badge: None,
        }
    }

    #[test]
    fn performance_totals_are_selected_in_struct_order() {
        let sql = build_query(
            2,
            &HeroBuildStatsQuery {
                include_performance: Some(true),
                ..Default::default()
            },
        );
        crate::utils::proptest_utils::assert_valid_sql(&sql);
        let at = |column: &str| sql.find(&format!("AS {column}")).unwrap();
        assert!(at("players") < at("total_kills"));
        assert!(at("total_level") < at("total_duration_s"));
        assert!(at("total_duration_s") < at("avg_average_badge"));
        if std::env::var_os("PRINT_HERO_BUILD_STATS_SQL").is_some() {
            println!("{sql}");
        }
        let plain = build_query(2, &HeroBuildStatsQuery::default());
        crate::utils::proptest_utils::assert_valid_sql(&plain);
        assert!(!plain.contains("sum(mp.kills)"));
        assert!(plain.contains("CAST(NULL, 'Nullable(UInt64)') AS total_kills"));
    }

    #[test]
    fn unknown_builds_are_dropped_in_place() {
        let kept: Vec<_> = retain_valid_builds(&[stats(3), stats(1), stats(2)], &[1, 3, -3])
            .into_iter()
            .map(|s| s.hero_build_id)
            .collect();
        assert_eq!(kept, vec![3, 1]);
    }

    #[test]
    fn no_known_builds_means_no_filter() {
        assert_eq!(retain_valid_builds(&[stats(1), stats(2)], &[]).len(), 2);
    }
}
