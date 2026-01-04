#![allow(clippy::too_many_arguments)]

use deadlock_api_rust::routes::v1::analytics::ability_order_stats::AnalyticsAbilityOrderStats;
use deadlock_api_rust::routes::v1::analytics::build_item_stats::BuildItemStats;
use deadlock_api_rust::routes::v1::analytics::hero_comb_stats::HeroCombStats;
use deadlock_api_rust::routes::v1::analytics::hero_counters_stats::HeroCounterStats;
use deadlock_api_rust::routes::v1::analytics::hero_stats::AnalyticsHeroStats;
use deadlock_api_rust::routes::v1::analytics::hero_synergies_stats::HeroSynergyStats;
use deadlock_api_rust::routes::v1::analytics::item_stats::ItemStats;
use deadlock_api_rust::routes::v1::analytics::net_worth_curve::NetWorthCurvePoint;
use deadlock_api_rust::routes::v1::analytics::scoreboard_types::ScoreboardQuerySortBy;
use deadlock_api_rust::routes::v1::analytics::{
    hero_scoreboard, hero_stats, item_stats, player_scoreboard,
};
use deadlock_api_rust::utils::types::SortDirectionDesc;
use itertools::Itertools;
use rstest::rstest;

use crate::request_endpoint;

#[rstest]
#[tokio::test]
async fn test_build_item_stats(
    #[values(None, Some(1))] hero_id: Option<u32>,
    #[values(None, Some(1741801678))] min_last_updated_unix_timestamp: Option<i64>,
    #[values(None, Some(1742233678))] max_last_updated_unix_timestamp: Option<i64>,
) {
    let mut queries = vec![];
    if let Some(hero_id) = hero_id {
        queries.push(("hero_id", hero_id.to_string()));
    }
    if let Some(min_last_updated_unix_timestamp) = min_last_updated_unix_timestamp {
        queries.push((
            "min_last_updated_unix_timestamp",
            min_last_updated_unix_timestamp.to_string(),
        ));
    }
    if let Some(max_last_updated_unix_timestamp) = max_last_updated_unix_timestamp {
        queries.push((
            "max_last_updated_unix_timestamp",
            max_last_updated_unix_timestamp.to_string(),
        ));
    }

    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = request_endpoint("/v1/analytics/build-item-stats", queries).await;
    let item_stats: Vec<BuildItemStats> = response.json().await.expect("Failed to parse response");

    assert_eq!(
        item_stats.iter().map(|s| s.item_id).unique().count(),
        item_stats.len(),
    );

    for stat in &item_stats {
        assert!(stat.builds > 0);
    }
}

#[rstest]
#[case(
    Some(1),
    Some(100),
    Some(vec![1, 2, 3]),
    Some(vec![15, 13]),
    Some(1747743170),
    Some(1747763170),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
)]
#[tokio::test]
async fn test_hero_comb_stats(
    #[case] min_matches: Option<u64>,
    #[case] max_matches: Option<u64>,
    #[case] include_hero_ids: Option<Vec<u32>>,
    #[case] exclude_hero_ids: Option<Vec<u32>>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[values(None, Some(34000226))] min_match_id: Option<u64>,
    #[values(None, Some(34000226))] max_match_id: Option<u64>,
    #[values(None, Some(18373975))] account_idss: Option<u32>,
    #[values(None, Some(3), Some(6))] comb_size: Option<u8>,
) {
    let mut queries = vec![];
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(max_matches) = max_matches {
        queries.push(("max_matches", max_matches.to_string()));
    }
    if let Some(include_hero_ids) = include_hero_ids.as_ref() {
        queries.push((
            "include_hero_ids",
            include_hero_ids.iter().map(ToString::to_string).join(","),
        ));
    }
    if let Some(exclude_hero_ids) = exclude_hero_ids.as_ref() {
        queries.push((
            "exclude_hero_ids",
            exclude_hero_ids.iter().map(ToString::to_string).join(","),
        ));
    }
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    if let Some(min_duration_s) = min_duration_s {
        queries.push(("min_duration_s", min_duration_s.to_string()));
    }
    if let Some(max_duration_s) = max_duration_s {
        queries.push(("max_duration_s", max_duration_s.to_string()));
    }
    if let Some(min_networth) = min_networth {
        queries.push(("min_networth", min_networth.to_string()));
    }
    if let Some(max_networth) = max_networth {
        queries.push(("max_networth", max_networth.to_string()));
    }
    if let Some(min_average_badge) = min_average_badge {
        queries.push(("min_average_badge", min_average_badge.to_string()));
    }
    if let Some(max_average_badge) = max_average_badge {
        queries.push(("max_average_badge", max_average_badge.to_string()));
    }
    if let Some(min_match_id) = min_match_id {
        queries.push(("min_match_id", min_match_id.to_string()));
    }
    if let Some(max_match_id) = max_match_id {
        queries.push(("max_match_id", max_match_id.to_string()));
    }
    if let Some(account_idss) = account_idss {
        queries.push(("account_idss", account_idss.to_string()));
    }
    if let Some(comb_size) = comb_size {
        queries.push(("comb_size", comb_size.to_string()));
    }
    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = request_endpoint("/v1/analytics/hero-comb-stats", queries).await;
    let comb_stats: Vec<HeroCombStats> = response.json().await.expect("Failed to parse response");

    for comb in &comb_stats {
        assert_eq!(comb.wins + comb.losses, comb.matches);
        assert_eq!(comb.hero_ids.len(), 6);
        assert_eq!(comb.hero_ids.iter().unique().count(), 6);
        if let Some(min_matches) = min_matches {
            assert!(comb.matches >= min_matches);
        }
        if let Some(max_matches) = max_matches {
            assert!(comb.matches <= max_matches);
        }
        if let Some(include_hero_ids) = include_hero_ids.as_ref() {
            assert!(include_hero_ids.iter().all(|id| comb.hero_ids.contains(id)));
        }
        if let Some(exclude_hero_ids) = exclude_hero_ids.as_ref() {
            assert!(
                exclude_hero_ids
                    .iter()
                    .all(|id| !comb.hero_ids.contains(id))
            );
        }
    }
    let hero_ids = comb_stats.into_iter().map(|c| c.hero_ids).collect_vec();
    assert_eq!(hero_ids.iter().unique().count(), hero_ids.len());
}

#[rstest]
#[case(
    Some(20),
    Some(70),
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100)
)]
#[tokio::test]
async fn test_hero_counters_stats(
    #[case] min_matches: Option<u64>,
    #[case] max_matches: Option<u64>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_enemy_networth: Option<u64>,
    #[case] max_enemy_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[values(None, Some(34000226))] min_match_id: Option<u64>,
    #[values(None, Some(34000226))] max_match_id: Option<u64>,
    #[values(None, Some(true), Some(false))] same_lane_filter: Option<bool>,
    #[values(None, Some(18373975))] account_ids: Option<u32>,
) {
    let mut queries = vec![];
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(max_matches) = max_matches {
        queries.push(("max_matches", max_matches.to_string()));
    }
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    if let Some(min_duration_s) = min_duration_s {
        queries.push(("min_duration_s", min_duration_s.to_string()));
    }
    if let Some(max_duration_s) = max_duration_s {
        queries.push(("max_duration_s", max_duration_s.to_string()));
    }
    if let Some(min_networth) = min_networth {
        queries.push(("min_networth", min_networth.to_string()));
    }
    if let Some(max_networth) = max_networth {
        queries.push(("max_networth", max_networth.to_string()));
    }
    if let Some(min_enemy_networth) = min_enemy_networth {
        queries.push(("min_enemy_networth", min_enemy_networth.to_string()));
    }
    if let Some(max_enemy_networth) = max_enemy_networth {
        queries.push(("max_enemy_networth", max_enemy_networth.to_string()));
    }
    if let Some(min_average_badge) = min_average_badge {
        queries.push(("min_average_badge", min_average_badge.to_string()));
    }
    if let Some(max_average_badge) = max_average_badge {
        queries.push(("max_average_badge", max_average_badge.to_string()));
    }
    if let Some(min_match_id) = min_match_id {
        queries.push(("min_match_id", min_match_id.to_string()));
    }
    if let Some(max_match_id) = max_match_id {
        queries.push(("max_match_id", max_match_id.to_string()));
    }
    if let Some(same_lane_filter) = same_lane_filter {
        queries.push(("same_lane_filter", same_lane_filter.to_string()));
    }
    if let Some(account_ids) = account_ids {
        queries.push(("account_ids", account_ids.to_string()));
    }
    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = request_endpoint("/v1/analytics/hero-counter-stats", queries).await;
    let counter_stats: Vec<HeroCounterStats> =
        response.json().await.expect("Failed to parse response");

    assert_eq!(
        counter_stats
            .iter()
            .map(|c| (c.hero_id, c.enemy_hero_id))
            .unique()
            .count(),
        counter_stats.len()
    );
    for counter_stat in counter_stats {
        assert!(counter_stat.wins <= counter_stat.matches_played);
        if let Some(min_matches) = min_matches {
            assert!(counter_stat.matches_played >= min_matches);
        }
        if let Some(max_matches) = max_matches {
            assert!(counter_stat.matches_played <= max_matches);
        }
    }
}

#[rstest]
#[case(
    Some(10),
    Some(70),
    SortDirectionDesc::Desc,
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100)
)]
#[tokio::test]
async fn test_hero_scoreboard(
    #[values(
        ScoreboardQuerySortBy::Matches,
        ScoreboardQuerySortBy::Wins,
        ScoreboardQuerySortBy::Losses,
        ScoreboardQuerySortBy::Winrate,
        ScoreboardQuerySortBy::MaxKillsPerMatch,
        ScoreboardQuerySortBy::AvgKillsPerMatch,
        ScoreboardQuerySortBy::Kills,
        ScoreboardQuerySortBy::MaxDeathsPerMatch,
        ScoreboardQuerySortBy::AvgDeathsPerMatch,
        ScoreboardQuerySortBy::Deaths,
        ScoreboardQuerySortBy::MaxDamageTakenPerMatch,
        ScoreboardQuerySortBy::AvgDamageTakenPerMatch,
        ScoreboardQuerySortBy::DamageTaken,
        ScoreboardQuerySortBy::MaxAssistsPerMatch,
        ScoreboardQuerySortBy::AvgAssistsPerMatch,
        ScoreboardQuerySortBy::Assists,
        ScoreboardQuerySortBy::MaxNetWorthPerMatch,
        ScoreboardQuerySortBy::AvgNetWorthPerMatch,
        ScoreboardQuerySortBy::NetWorth,
        ScoreboardQuerySortBy::MaxLastHitsPerMatch,
        ScoreboardQuerySortBy::AvgLastHitsPerMatch,
        ScoreboardQuerySortBy::LastHits,
        ScoreboardQuerySortBy::MaxDeniesPerMatch,
        ScoreboardQuerySortBy::AvgDeniesPerMatch,
        ScoreboardQuerySortBy::Denies,
        ScoreboardQuerySortBy::MaxPlayerLevelPerMatch,
        ScoreboardQuerySortBy::AvgPlayerLevelPerMatch,
        ScoreboardQuerySortBy::PlayerLevel,
        ScoreboardQuerySortBy::MaxCreepKillsPerMatch,
        ScoreboardQuerySortBy::AvgCreepKillsPerMatch,
        ScoreboardQuerySortBy::CreepKills,
        ScoreboardQuerySortBy::MaxNeutralKillsPerMatch,
        ScoreboardQuerySortBy::AvgNeutralKillsPerMatch,
        ScoreboardQuerySortBy::NeutralKills,
        ScoreboardQuerySortBy::MaxCreepDamagePerMatch,
        ScoreboardQuerySortBy::AvgCreepDamagePerMatch,
        ScoreboardQuerySortBy::CreepDamage,
        ScoreboardQuerySortBy::MaxPlayerDamagePerMatch,
        ScoreboardQuerySortBy::AvgPlayerDamagePerMatch,
        ScoreboardQuerySortBy::PlayerDamage,
        ScoreboardQuerySortBy::MaxNeutralDamagePerMatch,
        ScoreboardQuerySortBy::AvgNeutralDamagePerMatch,
        ScoreboardQuerySortBy::NeutralDamage,
        ScoreboardQuerySortBy::MaxBossDamagePerMatch,
        ScoreboardQuerySortBy::AvgBossDamagePerMatch,
        ScoreboardQuerySortBy::BossDamage,
        ScoreboardQuerySortBy::MaxMaxHealthPerMatch,
        ScoreboardQuerySortBy::AvgMaxHealthPerMatch,
        ScoreboardQuerySortBy::MaxHealth,
        ScoreboardQuerySortBy::MaxShotsHitPerMatch,
        ScoreboardQuerySortBy::AvgShotsHitPerMatch,
        ScoreboardQuerySortBy::ShotsHit,
        ScoreboardQuerySortBy::MaxShotsMissedPerMatch,
        ScoreboardQuerySortBy::AvgShotsMissedPerMatch,
        ScoreboardQuerySortBy::ShotsMissed,
        ScoreboardQuerySortBy::MaxHeroBulletsHitPerMatch,
        ScoreboardQuerySortBy::AvgHeroBulletsHitPerMatch,
        ScoreboardQuerySortBy::HeroBulletsHit,
        ScoreboardQuerySortBy::MaxHeroBulletsHitCritPerMatch,
        ScoreboardQuerySortBy::AvgHeroBulletsHitCritPerMatch,
        ScoreboardQuerySortBy::HeroBulletsHitCrit
    )]
    sort_by: ScoreboardQuerySortBy,
    #[case] min_matches: Option<u64>,
    #[case] max_matches: Option<u64>,
    #[case] sort_direction: SortDirectionDesc,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[values(None, Some(34000226))] min_match_id: Option<u64>,
    #[values(None, Some(34000226))] max_match_id: Option<u64>,
    #[values(None, Some(18373975))] account_ids: Option<u32>,
) {
    let mut queries = vec![];
    queries.push(("sort_by", sort_by.to_string()));
    queries.push(("sort_direction", sort_direction.to_string()));
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(max_matches) = max_matches {
        queries.push(("max_matches", max_matches.to_string()));
    }
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    if let Some(min_duration_s) = min_duration_s {
        queries.push(("min_duration_s", min_duration_s.to_string()));
    }
    if let Some(max_duration_s) = max_duration_s {
        queries.push(("max_duration_s", max_duration_s.to_string()));
    }
    if let Some(min_networth) = min_networth {
        queries.push(("min_networth", min_networth.to_string()));
    }
    if let Some(max_networth) = max_networth {
        queries.push(("max_networth", max_networth.to_string()));
    }
    if let Some(min_average_badge) = min_average_badge {
        queries.push(("min_average_badge", min_average_badge.to_string()));
    }
    if let Some(max_average_badge) = max_average_badge {
        queries.push(("max_average_badge", max_average_badge.to_string()));
    }
    if let Some(min_match_id) = min_match_id {
        queries.push(("min_match_id", min_match_id.to_string()));
    }
    if let Some(max_match_id) = max_match_id {
        queries.push(("max_match_id", max_match_id.to_string()));
    }
    if let Some(account_ids) = account_ids {
        queries.push(("account_ids", account_ids.to_string()));
    }
    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = request_endpoint("/v1/analytics/scoreboards/heroes", queries).await;
    let hero_scoreboard: Vec<hero_scoreboard::Entry> =
        response.json().await.expect("Failed to parse response");

    // Verify min_matches requirement
    if let Some(min_matches) = min_matches {
        for entry in &hero_scoreboard {
            assert!(entry.matches >= min_matches);
        }
    }

    // Verify max_matches requirement
    if let Some(max_matches) = max_matches {
        for entry in &hero_scoreboard {
            assert!(entry.matches <= max_matches);
        }
    }

    // Verify sorting
    if hero_scoreboard.len() > 1 {
        let check_sorted = |field_extractor: fn(&hero_scoreboard::Entry) -> f64,
                            desc: SortDirectionDesc| {
            let mut sorted = true;
            for i in 0..hero_scoreboard.len() - 1 {
                let current = field_extractor(&hero_scoreboard[i]);
                let next = field_extractor(&hero_scoreboard[i + 1]);
                match desc {
                    SortDirectionDesc::Desc => sorted &= current >= next,
                    SortDirectionDesc::Asc => sorted &= current <= next,
                }
            }
            sorted
        };
        let extractor = |entry: &hero_scoreboard::Entry| entry.value;
        assert!(check_sorted(extractor, sort_direction));
    }
}

#[rstest]
#[case(
    Some(10),
    Some(70),
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    Some(100)
)]
#[tokio::test]
async fn test_player_scoreboard(
    #[values(
        ScoreboardQuerySortBy::Matches,
        ScoreboardQuerySortBy::Wins,
        ScoreboardQuerySortBy::Losses,
        ScoreboardQuerySortBy::Winrate,
        ScoreboardQuerySortBy::MaxKillsPerMatch,
        ScoreboardQuerySortBy::AvgKillsPerMatch,
        ScoreboardQuerySortBy::Kills,
        ScoreboardQuerySortBy::MaxDeathsPerMatch,
        ScoreboardQuerySortBy::AvgDeathsPerMatch,
        ScoreboardQuerySortBy::Deaths,
        ScoreboardQuerySortBy::MaxDamageTakenPerMatch,
        ScoreboardQuerySortBy::AvgDamageTakenPerMatch,
        ScoreboardQuerySortBy::DamageTaken,
        ScoreboardQuerySortBy::MaxAssistsPerMatch,
        ScoreboardQuerySortBy::AvgAssistsPerMatch,
        ScoreboardQuerySortBy::Assists,
        ScoreboardQuerySortBy::MaxNetWorthPerMatch,
        ScoreboardQuerySortBy::AvgNetWorthPerMatch,
        ScoreboardQuerySortBy::NetWorth,
        ScoreboardQuerySortBy::MaxLastHitsPerMatch,
        ScoreboardQuerySortBy::AvgLastHitsPerMatch,
        ScoreboardQuerySortBy::LastHits,
        ScoreboardQuerySortBy::MaxDeniesPerMatch,
        ScoreboardQuerySortBy::AvgDeniesPerMatch,
        ScoreboardQuerySortBy::Denies,
        ScoreboardQuerySortBy::MaxPlayerLevelPerMatch,
        ScoreboardQuerySortBy::AvgPlayerLevelPerMatch,
        ScoreboardQuerySortBy::PlayerLevel,
        ScoreboardQuerySortBy::MaxCreepKillsPerMatch,
        ScoreboardQuerySortBy::AvgCreepKillsPerMatch,
        ScoreboardQuerySortBy::CreepKills,
        ScoreboardQuerySortBy::MaxNeutralKillsPerMatch,
        ScoreboardQuerySortBy::AvgNeutralKillsPerMatch,
        ScoreboardQuerySortBy::NeutralKills,
        ScoreboardQuerySortBy::MaxCreepDamagePerMatch,
        ScoreboardQuerySortBy::AvgCreepDamagePerMatch,
        ScoreboardQuerySortBy::CreepDamage,
        ScoreboardQuerySortBy::MaxPlayerDamagePerMatch,
        ScoreboardQuerySortBy::AvgPlayerDamagePerMatch,
        ScoreboardQuerySortBy::PlayerDamage,
        ScoreboardQuerySortBy::MaxNeutralDamagePerMatch,
        ScoreboardQuerySortBy::AvgNeutralDamagePerMatch,
        ScoreboardQuerySortBy::NeutralDamage,
        ScoreboardQuerySortBy::MaxBossDamagePerMatch,
        ScoreboardQuerySortBy::AvgBossDamagePerMatch,
        ScoreboardQuerySortBy::BossDamage,
        ScoreboardQuerySortBy::MaxMaxHealthPerMatch,
        ScoreboardQuerySortBy::AvgMaxHealthPerMatch,
        ScoreboardQuerySortBy::MaxHealth,
        ScoreboardQuerySortBy::MaxShotsHitPerMatch,
        ScoreboardQuerySortBy::AvgShotsHitPerMatch,
        ScoreboardQuerySortBy::ShotsHit,
        ScoreboardQuerySortBy::MaxShotsMissedPerMatch,
        ScoreboardQuerySortBy::AvgShotsMissedPerMatch,
        ScoreboardQuerySortBy::ShotsMissed,
        ScoreboardQuerySortBy::MaxHeroBulletsHitPerMatch,
        ScoreboardQuerySortBy::AvgHeroBulletsHitPerMatch,
        ScoreboardQuerySortBy::HeroBulletsHit,
        ScoreboardQuerySortBy::MaxHeroBulletsHitCritPerMatch,
        ScoreboardQuerySortBy::AvgHeroBulletsHitCritPerMatch,
        ScoreboardQuerySortBy::HeroBulletsHitCrit
    )]
    sort_by: ScoreboardQuerySortBy,
    #[values(None, Some(SortDirectionDesc::Desc), Some(SortDirectionDesc::Asc))]
    sort_direction: Option<SortDirectionDesc>,
    #[case] min_matches: Option<u64>,
    #[case] max_matches: Option<u64>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[values(None, Some(34000226))] min_match_id: Option<u64>,
    #[values(None, Some(34000226))] max_match_id: Option<u64>,
    #[values(None, Some(18373975))] account_ids: Option<u32>,
    #[case] limit: Option<u32>,
) {
    let mut queries = vec![];
    queries.push(("sort_by", sort_by.to_string()));
    if let Some(sort_direction) = sort_direction {
        queries.push(("sort_direction", sort_direction.to_string()));
    }
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(max_matches) = max_matches {
        queries.push(("max_matches", max_matches.to_string()));
    }
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    if let Some(min_duration_s) = min_duration_s {
        queries.push(("min_duration_s", min_duration_s.to_string()));
    }
    if let Some(max_duration_s) = max_duration_s {
        queries.push(("max_duration_s", max_duration_s.to_string()));
    }
    if let Some(min_networth) = min_networth {
        queries.push(("min_networth", min_networth.to_string()));
    }
    if let Some(max_networth) = max_networth {
        queries.push(("max_networth", max_networth.to_string()));
    }
    if let Some(min_average_badge) = min_average_badge {
        queries.push(("min_average_badge", min_average_badge.to_string()));
    }
    if let Some(max_average_badge) = max_average_badge {
        queries.push(("max_average_badge", max_average_badge.to_string()));
    }
    if let Some(min_match_id) = min_match_id {
        queries.push(("min_match_id", min_match_id.to_string()));
    }
    if let Some(max_match_id) = max_match_id {
        queries.push(("max_match_id", max_match_id.to_string()));
    }
    if let Some(account_ids) = account_ids {
        queries.push(("account_ids", account_ids.to_string()));
    }
    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = request_endpoint("/v1/analytics/scoreboards/players", queries).await;
    let player_scoreboard: Vec<player_scoreboard::Entry> =
        response.json().await.expect("Failed to parse response");

    // Verify we don't get more entries than the limit
    if let Some(limit) = limit {
        assert!(player_scoreboard.len() <= limit as usize);
    }

    // Verify min_matches requirement
    if let Some(min_matches) = min_matches {
        for entry in &player_scoreboard {
            assert!(entry.matches >= min_matches);
        }
    }

    // Verify max_matches requirement
    if let Some(max_matches) = max_matches {
        for entry in &player_scoreboard {
            assert!(entry.matches <= max_matches);
        }
    }

    // Verify sorting
    if player_scoreboard.len() > 1 {
        let check_sorted = |field_extractor: fn(&player_scoreboard::Entry) -> f64,
                            sort_direction: SortDirectionDesc| {
            let mut sorted = true;
            for i in 0..player_scoreboard.len() - 1 {
                let current = field_extractor(&player_scoreboard[i]);
                let next = field_extractor(&player_scoreboard[i + 1]);
                match sort_direction {
                    SortDirectionDesc::Desc => sorted &= current >= next,
                    SortDirectionDesc::Asc => sorted &= current <= next,
                }
            }
            sorted
        };
        let extractor = |entry: &player_scoreboard::Entry| entry.value;
        assert!(check_sorted(extractor, sort_direction.unwrap_or_default()));
    }
}

#[rstest]
#[case(
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    Some(10),
    Some(100),
    Some(vec![1548066885, 968099481]),
    Some(vec![1797283378]),
)]
#[tokio::test]
async fn test_hero_stats(
    #[values(
        None,
        Some(hero_stats::BucketQuery::NoBucket),
        Some(hero_stats::BucketQuery::StartTimeHour),
        Some(hero_stats::BucketQuery::StartTimeDay),
        Some(hero_stats::BucketQuery::StartTimeWeek),
        Some(hero_stats::BucketQuery::StartTimeMonth)
    )]
    bucket: Option<hero_stats::BucketQuery>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[values(None, Some(34000226))] min_match_id: Option<u64>,
    #[values(None, Some(34000226))] max_match_id: Option<u64>,
    #[case] min_hero_matches: Option<u64>,
    #[case] max_hero_matches: Option<u64>,
    #[case] include_item_ids: Option<Vec<u32>>,
    #[case] exclude_item_ids: Option<Vec<u32>>,
    #[values(None, Some(18373975))] account_ids: Option<u32>,
) {
    let mut queries = vec![];
    if let Some(bucket) = bucket {
        queries.push(("bucket", bucket.to_string()));
    }
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    if let Some(min_duration_s) = min_duration_s {
        queries.push(("min_duration_s", min_duration_s.to_string()));
    }
    if let Some(max_duration_s) = max_duration_s {
        queries.push(("max_duration_s", max_duration_s.to_string()));
    }
    if let Some(min_networth) = min_networth {
        queries.push(("min_networth", min_networth.to_string()));
    }
    if let Some(max_networth) = max_networth {
        queries.push(("max_networth", max_networth.to_string()));
    }
    if let Some(min_average_badge) = min_average_badge {
        queries.push(("min_average_badge", min_average_badge.to_string()));
    }
    if let Some(max_average_badge) = max_average_badge {
        queries.push(("max_average_badge", max_average_badge.to_string()));
    }
    if let Some(min_match_id) = min_match_id {
        queries.push(("min_match_id", min_match_id.to_string()));
    }
    if let Some(max_match_id) = max_match_id {
        queries.push(("max_match_id", max_match_id.to_string()));
    }
    if let Some(min_hero_matches) = min_hero_matches {
        queries.push(("min_hero_matches", min_hero_matches.to_string()));
    }
    if let Some(max_hero_matches) = max_hero_matches {
        queries.push(("max_hero_matches", max_hero_matches.to_string()));
    }
    if let Some(include_item_ids) = include_item_ids.as_ref() {
        queries.push((
            "include_item_ids",
            include_item_ids.iter().map(ToString::to_string).join(","),
        ));
    }
    if let Some(exclude_item_ids) = exclude_item_ids.as_ref() {
        queries.push((
            "exclude_item_ids",
            exclude_item_ids.iter().map(ToString::to_string).join(","),
        ));
    }
    if let Some(account_ids) = account_ids {
        queries.push(("account_ids", account_ids.to_string()));
    }
    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    queries.iter().for_each(|(k, v)| println!("{k}={v}"));
    let response = request_endpoint("/v1/analytics/hero-stats", queries).await;
    let hero_stats: Vec<AnalyticsHeroStats> =
        response.json().await.expect("Failed to parse response");

    assert_eq!(
        hero_stats.iter().map(|stat| stat.hero_id).unique().count(),
        hero_stats.len()
    );

    for stat in &hero_stats {
        assert_eq!(stat.wins + stat.losses, stat.matches);
        assert!(stat.total_kills <= stat.matches * 100);
        assert!(stat.total_deaths <= stat.matches * 100);
        assert!(stat.total_assists <= stat.matches * 100);
    }
}

#[rstest]
#[case(
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    Some(10),
    Some(100)
)]
#[tokio::test]
async fn test_hero_synergies_stats(
    #[values(None, Some(true), Some(false))] same_lane_filter: Option<bool>,
    #[values(None, Some(true), Some(false))] same_party_filter: Option<bool>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[values(None, Some(34000226))] min_match_id: Option<u64>,
    #[values(None, Some(34000226))] max_match_id: Option<u64>,
    #[values(None, Some(18373975))] account_ids: Option<u32>,
    #[case] min_matches: Option<u64>,
    #[case] max_matches: Option<u64>,
) {
    let mut queries = vec![];
    if let Some(same_lane_filter) = same_lane_filter {
        queries.push(("same_lane_filter", same_lane_filter.to_string()));
    }
    if let Some(same_party_filter) = same_party_filter {
        queries.push(("same_party_filter", same_party_filter.to_string()));
    }
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    if let Some(min_duration_s) = min_duration_s {
        queries.push(("min_duration_s", min_duration_s.to_string()));
    }
    if let Some(max_duration_s) = max_duration_s {
        queries.push(("max_duration_s", max_duration_s.to_string()));
    }
    if let Some(min_networth) = min_networth {
        queries.push(("min_networth", min_networth.to_string()));
    }
    if let Some(max_networth) = max_networth {
        queries.push(("max_networth", max_networth.to_string()));
    }
    if let Some(min_average_badge) = min_average_badge {
        queries.push(("min_average_badge", min_average_badge.to_string()));
    }
    if let Some(max_average_badge) = max_average_badge {
        queries.push(("max_average_badge", max_average_badge.to_string()));
    }
    if let Some(min_match_id) = min_match_id {
        queries.push(("min_match_id", min_match_id.to_string()));
    }
    if let Some(max_match_id) = max_match_id {
        queries.push(("max_match_id", max_match_id.to_string()));
    }
    if let Some(account_ids) = account_ids {
        queries.push(("account_ids", account_ids.to_string()));
    }
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(max_matches) = max_matches {
        queries.push(("max_matches", max_matches.to_string()));
    }

    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = request_endpoint("/v1/analytics/hero-synergy-stats", queries).await;
    let synergy_stats: Vec<HeroSynergyStats> =
        response.json().await.expect("Failed to parse response");

    assert_eq!(
        synergy_stats
            .iter()
            .map(|s| (s.hero_id1, s.hero_id2))
            .unique()
            .count(),
        synergy_stats.len()
    );

    for stat in synergy_stats {
        if let Some(min_matches) = min_matches {
            assert!(
                stat.matches_played >= min_matches,
                "Matches played should be greater than or equal to min_matches"
            );
        }
        if let Some(max_matches) = max_matches {
            assert!(
                stat.matches_played <= max_matches,
                "Matches played should be less than or equal to max_matches"
            );
        }
        assert!(
            stat.hero_id1 < stat.hero_id2,
            "hero_id1 should be less than hero_id2"
        );
        assert!(
            stat.wins <= stat.matches_played,
            "Wins should not exceed total matches"
        );
        assert_ne!(
            stat.hero_id1, stat.hero_id2,
            "Heroes in a synergy pair should be different"
        );
        assert!(
            stat.kills1 > 0 && stat.kills2 > 0,
            "Kills should be greater than 0"
        );
        assert!(
            stat.deaths1 > 0 && stat.deaths2 > 0,
            "Deaths should be greater than 0"
        );
        assert!(
            stat.assists1 > 0 && stat.assists2 > 0,
            "Assists should be greater than 0"
        );
        assert!(
            stat.denies1 > 0 && stat.denies2 > 0,
            "Denies should be greater than 0"
        );
        assert!(
            stat.last_hits1 > 0 && stat.last_hits2 > 0,
            "Last hits should be greater than 0"
        );
        assert!(
            stat.networth1 > 0 && stat.networth2 > 0,
            "Net worth should be greater than 0"
        );
        assert!(
            stat.obj_damage1 > 0 && stat.obj_damage2 > 0,
            "Objective damage should be greater than 0"
        );
        assert!(
            stat.creeps1 > 0 && stat.creeps2 > 0,
            "Creeps should be greater than 0"
        );
    }
}

#[rstest]
#[case(
    Some(vec![1, 2, 3]),
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    Some(vec![1548066885, 1009965641, 709540378]),
    Some(vec![1248737459, 3535785353]),
    Some(10),
    Some(100),
)]
#[tokio::test]
async fn test_item_stats(
    #[values(
        None,
        Some(item_stats::BucketQuery::NoBucket),
        Some(item_stats::BucketQuery::Hero),
        Some(item_stats::BucketQuery::Team),
        Some(item_stats::BucketQuery::StartTimeHour),
        Some(item_stats::BucketQuery::StartTimeDay),
        Some(item_stats::BucketQuery::StartTimeWeek),
        Some(item_stats::BucketQuery::StartTimeMonth),
        Some(item_stats::BucketQuery::GameTimeMin),
        Some(item_stats::BucketQuery::GameTimeNormalizedPercentage),
        Some(item_stats::BucketQuery::NetWorthBy1000),
        Some(item_stats::BucketQuery::NetWorthBy2000),
        Some(item_stats::BucketQuery::NetWorthBy3000),
        Some(item_stats::BucketQuery::NetWorthBy5000),
        Some(item_stats::BucketQuery::NetWorthBy10000)
    )]
    bucket: Option<item_stats::BucketQuery>,
    #[case] hero_ids: Option<Vec<u32>>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[values(None, Some(34000226))] min_match_id: Option<u64>,
    #[values(None, Some(34000226))] max_match_id: Option<u64>,
    #[case] include_item_ids: Option<Vec<u32>>,
    #[case] exclude_item_ids: Option<Vec<u32>>,
    #[values(None, Some(18373975))] account_ids: Option<u32>,
    #[case] min_matches: Option<u64>,
    #[case] max_matches: Option<u64>,
) {
    let mut queries = vec![];
    if let Some(bucket) = bucket {
        queries.push(("bucket", bucket.to_string()));
    }
    if let Some(hero_ids) = hero_ids.as_ref() {
        queries.push((
            "hero_ids",
            hero_ids
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(","),
        ));
    }
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    if let Some(min_duration_s) = min_duration_s {
        queries.push(("min_duration_s", min_duration_s.to_string()));
    }
    if let Some(max_duration_s) = max_duration_s {
        queries.push(("max_duration_s", max_duration_s.to_string()));
    }
    if let Some(min_networth) = min_networth {
        queries.push(("min_networth", min_networth.to_string()));
    }
    if let Some(max_networth) = max_networth {
        queries.push(("max_networth", max_networth.to_string()));
    }
    if let Some(min_average_badge) = min_average_badge {
        queries.push(("min_average_badge", min_average_badge.to_string()));
    }
    if let Some(max_average_badge) = max_average_badge {
        queries.push(("max_average_badge", max_average_badge.to_string()));
    }
    if let Some(min_match_id) = min_match_id {
        queries.push(("min_match_id", min_match_id.to_string()));
    }
    if let Some(max_match_id) = max_match_id {
        queries.push(("max_match_id", max_match_id.to_string()));
    }
    if let Some(include_item_ids) = include_item_ids.as_ref() {
        queries.push((
            "include_item_ids",
            include_item_ids
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(","),
        ));
    }
    if let Some(exclude_item_ids) = exclude_item_ids.as_ref() {
        queries.push((
            "exclude_item_ids",
            exclude_item_ids
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(","),
        ));
    }
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(max_matches) = max_matches {
        queries.push(("max_matches", max_matches.to_string()));
    }
    if let Some(account_ids) = account_ids {
        queries.push(("account_ids", account_ids.to_string()));
    }

    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = request_endpoint("/v1/analytics/item-stats", queries).await;
    let item_stats: Vec<ItemStats> = response.json().await.expect("Failed to parse response");

    assert_eq!(
        item_stats.iter().map(|s| s.item_id).unique().count(),
        item_stats.len(),
    );

    for stat in &item_stats {
        if let Some(min_matches) = min_matches {
            assert!(
                stat.matches >= min_matches,
                "Matches should be greater than or equal to min_matches"
            );
        }
        if let Some(max_matches) = max_matches {
            assert!(
                stat.matches <= max_matches,
                "Matches should be less than or equal to max_matches"
            );
        }
        match bucket {
            Some(item_stats::BucketQuery::NoBucket) | None => assert_eq!(stat.bucket, 0),
            _ => {}
        }
        assert_eq!(stat.wins + stat.losses, stat.matches);
    }
}

#[rstest]
#[case(
    1,
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    Some(10)
)]
#[tokio::test]
async fn test_ability_order_stats(
    #[case] hero_id: u32,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[values(None, Some(10))] min_ability_upgrades: Option<u64>,
    #[values(None, Some(16))] max_ability_upgrades: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[values(None, Some(34000226))] min_match_id: Option<u64>,
    #[values(None, Some(34000226))] max_match_id: Option<u64>,
    #[case] min_matches: Option<u32>,
    #[values(None, Some(18373975))] account_ids: Option<u32>,
) {
    let mut queries = vec![];
    queries.push(("hero_id", hero_id.to_string()));
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    if let Some(min_duration_s) = min_duration_s {
        queries.push(("min_duration_s", min_duration_s.to_string()));
    }
    if let Some(max_duration_s) = max_duration_s {
        queries.push(("max_duration_s", max_duration_s.to_string()));
    }
    if let Some(min_ability_upgrades) = min_ability_upgrades {
        queries.push(("min_ability_upgrades", min_ability_upgrades.to_string()));
    }
    if let Some(max_ability_upgrades) = max_ability_upgrades {
        queries.push(("max_ability_upgrades", max_ability_upgrades.to_string()));
    }
    if let Some(min_networth) = min_networth {
        queries.push(("min_networth", min_networth.to_string()));
    }
    if let Some(max_networth) = max_networth {
        queries.push(("max_networth", max_networth.to_string()));
    }
    if let Some(min_average_badge) = min_average_badge {
        queries.push(("min_average_badge", min_average_badge.to_string()));
    }
    if let Some(max_average_badge) = max_average_badge {
        queries.push(("max_average_badge", max_average_badge.to_string()));
    }
    if let Some(min_match_id) = min_match_id {
        queries.push(("min_match_id", min_match_id.to_string()));
    }
    if let Some(max_match_id) = max_match_id {
        queries.push(("max_match_id", max_match_id.to_string()));
    }
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(account_ids) = account_ids {
        queries.push(("account_ids", account_ids.to_string()));
    }

    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = request_endpoint("/v1/analytics/ability-order-stats", queries).await;
    let ability_order_stats: Vec<AnalyticsAbilityOrderStats> =
        response.json().await.expect("Failed to parse response");

    // Verify uniqueness of ability orders
    assert_eq!(
        ability_order_stats
            .iter()
            .map(|s| &s.abilities)
            .unique()
            .count(),
        ability_order_stats.len()
    );

    for stat in &ability_order_stats {
        // Verify basic match math
        assert_eq!(stat.wins + stat.losses, stat.matches);

        // Verify min_matches constraint
        if let Some(min_matches) = min_matches {
            assert!(stat.matches >= min_matches as u64);
        }

        // Verify abilities array is not empty and contains valid ability IDs
        assert!(!stat.abilities.is_empty());

        // Verify ability upgrades constraints if specified
        if let Some(min_ability_upgrades) = min_ability_upgrades {
            assert!(stat.abilities.len() >= min_ability_upgrades as usize);
        }
        if let Some(max_ability_upgrades) = max_ability_upgrades {
            assert!(stat.abilities.len() <= max_ability_upgrades as usize);
        }

        // Verify reasonable bounds for stats
        assert!(stat.total_kills <= stat.matches * 100); // Reasonable upper bound
        assert!(stat.total_deaths <= stat.matches * 100);
        assert!(stat.total_assists <= stat.matches * 500); // Assists can be higher

        // Verify matches > 0 (should always be true due to min_matches default)
        assert!(stat.matches > 0);
    }
}

#[rstest]
#[case(
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    Some(vec![1, 2, 3]),
    Some(vec![4, 5]),
    Some(vec![6, 7]),
)]
#[tokio::test]
async fn test_net_worth_curve(
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[values(None, Some(34000226))] min_match_id: Option<u64>,
    #[values(None, Some(34000226))] max_match_id: Option<u64>,
    #[case] hero_ids: Option<Vec<u32>>,
    #[case] include_item_ids: Option<Vec<u32>>,
    #[case] exclude_item_ids: Option<Vec<u32>>,
    #[values(None, Some(18373975))] account_ids: Option<u32>,
) {
    let mut queries = vec![];
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    if let Some(min_duration_s) = min_duration_s {
        queries.push(("min_duration_s", min_duration_s.to_string()));
    }
    if let Some(max_duration_s) = max_duration_s {
        queries.push(("max_duration_s", max_duration_s.to_string()));
    }
    if let Some(min_networth) = min_networth {
        queries.push(("min_networth", min_networth.to_string()));
    }
    if let Some(max_networth) = max_networth {
        queries.push(("max_networth", max_networth.to_string()));
    }
    if let Some(min_average_badge) = min_average_badge {
        queries.push(("min_average_badge", min_average_badge.to_string()));
    }
    if let Some(max_average_badge) = max_average_badge {
        queries.push(("max_average_badge", max_average_badge.to_string()));
    }
    if let Some(min_match_id) = min_match_id {
        queries.push(("min_match_id", min_match_id.to_string()));
    }
    if let Some(max_match_id) = max_match_id {
        queries.push(("max_match_id", max_match_id.to_string()));
    }
    if let Some(hero_ids) = hero_ids.as_ref() {
        queries.push((
            "hero_ids",
            hero_ids.iter().map(ToString::to_string).join(","),
        ));
    }
    if let Some(include_item_ids) = include_item_ids.as_ref() {
        queries.push((
            "include_item_ids",
            include_item_ids.iter().map(ToString::to_string).join(","),
        ));
    }
    if let Some(exclude_item_ids) = exclude_item_ids.as_ref() {
        queries.push((
            "exclude_item_ids",
            exclude_item_ids.iter().map(ToString::to_string).join(","),
        ));
    }
    if let Some(account_ids) = account_ids {
        queries.push(("account_ids", account_ids.to_string()));
    }

    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = request_endpoint("/v1/analytics/net-worth-curve", queries).await;
    let net_worth_curve: Vec<NetWorthCurvePoint> =
        response.json().await.expect("Failed to parse response");

    // Verify relative_timestamps are unique and sorted
    let mut timestamps: Vec<u8> = net_worth_curve
        .iter()
        .map(|p| p.relative_timestamp)
        .collect();
    timestamps.sort();
    timestamps.dedup();
    assert_eq!(timestamps.len(), net_worth_curve.len());

    // Verify relative_timestamps are in 5% increments from 0 to 100
    for (i, &timestamp) in timestamps.iter().enumerate() {
        assert_eq!(timestamp, (i as u8) * 5);
    }

    for point in &net_worth_curve {
        // Verify percentiles are ordered
        assert!(point.percentile1 <= point.percentile5);
        assert!(point.percentile5 <= point.percentile10);
        assert!(point.percentile10 <= point.percentile25);
        assert!(point.percentile25 <= point.percentile50);
        assert!(point.percentile50 <= point.percentile75);
        assert!(point.percentile75 <= point.percentile90);
        assert!(point.percentile90 <= point.percentile95);
        assert!(point.percentile95 <= point.percentile99);

        // Verify avg is positive and reasonable
        assert!(point.avg > 0.0);
        assert!(point.avg < 1_000_000.0); // reasonable upper bound

        // Verify std is non-negative
        assert!(point.std >= 0.0);
    }
}
