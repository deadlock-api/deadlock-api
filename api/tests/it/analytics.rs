#![allow(clippy::too_many_arguments)]

use deadlock_api_rust::routes::v1::analytics::ability_order_stats::AnalyticsAbilityOrderStats;
use deadlock_api_rust::routes::v1::analytics::build_item_stats::BuildItemStats;
use deadlock_api_rust::routes::v1::analytics::game_stats::AnalyticsGameStats;
use deadlock_api_rust::routes::v1::analytics::hero_comb_stats::HeroCombStats;
use deadlock_api_rust::routes::v1::analytics::hero_counters_stats::HeroCounterStats;
use deadlock_api_rust::routes::v1::analytics::hero_stats::AnalyticsHeroStats;
use deadlock_api_rust::routes::v1::analytics::hero_synergies_stats::HeroSynergyStats;
use deadlock_api_rust::routes::v1::analytics::item_stats::ItemStats;
use deadlock_api_rust::routes::v1::analytics::player_performance_curve::PlayerPerformanceCurvePoint;
use deadlock_api_rust::routes::v1::analytics::scoreboard_types::ScoreboardQuerySortBy;
use deadlock_api_rust::routes::v1::analytics::{
    game_stats, hero_scoreboard, hero_stats, item_stats, player_scoreboard,
};
use deadlock_api_rust::utils::types::SortDirectionDesc;
use itertools::Itertools;
use rstest::rstest;

use crate::{query_refs, request_endpoint};

#[rstest]
#[tokio::test]
async fn test_build_item_stats(
    #[values(None, Some(1))] hero_id: Option<u32>,
    #[values(None, Some(1741801678))] min_last_updated_unix_timestamp: Option<i64>,
    #[values(None, Some(1742233678))] max_last_updated_unix_timestamp: Option<i64>,
) {
    let mut q = vec![];
    push_query!(q, "hero_id" =>? hero_id);
    push_query!(q, "min_last_updated_unix_timestamp" =>? min_last_updated_unix_timestamp);
    push_query!(q, "max_last_updated_unix_timestamp" =>? max_last_updated_unix_timestamp);

    let response = request_endpoint("/v1/analytics/build-item-stats", query_refs(&q)).await;
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
#[case(Some(1), Some(100), Some(vec![1, 2, 3]), Some(vec![15, 13]), Some(1747743170), Some(1747763170), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, None, None)]
#[case(Some(1), Some(100), Some(vec![1, 2, 3]), Some(vec![15, 13]), Some(1747743170), Some(1747763170), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), Some(34000226), Some(34000226), Some(18373975), Some(3))]
#[case(Some(1), Some(100), Some(vec![1, 2, 3]), Some(vec![15, 13]), Some(1747743170), Some(1747763170), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, None, Some(6))]
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
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
    #[case] account_idss: Option<u32>,
    #[case] comb_size: Option<u8>,
) {
    let mut q = vec![];
    push_query!(q, "min_matches" =>? min_matches);
    push_query!(q, "max_matches" =>? max_matches);
    push_query!(q, "include_hero_ids" =>[] include_hero_ids);
    push_query!(q, "exclude_hero_ids" =>[] exclude_hero_ids);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_networth" =>? min_networth);
    push_query!(q, "max_networth" =>? max_networth);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);
    push_query!(q, "account_idss" =>? account_idss);
    push_query!(q, "comb_size" =>? comb_size);

    let response = request_endpoint("/v1/analytics/hero-comb-stats", query_refs(&q)).await;
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
    Some(100),
    None,
    None,
    None,
    None
)]
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
    Some(100),
    Some(34000226),
    Some(34000226),
    Some(true),
    Some(18373975)
)]
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
    Some(100),
    None,
    None,
    Some(false),
    None
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
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
    #[case] same_lane_filter: Option<bool>,
    #[case] account_ids: Option<u32>,
) {
    let mut q = vec![];
    push_query!(q, "min_matches" =>? min_matches);
    push_query!(q, "max_matches" =>? max_matches);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_networth" =>? min_networth);
    push_query!(q, "max_networth" =>? max_networth);
    push_query!(q, "min_enemy_networth" =>? min_enemy_networth);
    push_query!(q, "max_enemy_networth" =>? max_enemy_networth);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);
    push_query!(q, "same_lane_filter" =>? same_lane_filter);
    push_query!(q, "account_ids" =>? account_ids);

    let response = request_endpoint("/v1/analytics/hero-counter-stats", query_refs(&q)).await;
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
    ScoreboardQuerySortBy::Matches,
    SortDirectionDesc::Desc,
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
    None,
    None,
    None
)]
#[case(
    ScoreboardQuerySortBy::Winrate,
    SortDirectionDesc::Asc,
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
    None,
    None,
    None
)]
#[case(
    ScoreboardQuerySortBy::AvgKillsPerMatch,
    SortDirectionDesc::Desc,
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
    Some(34000226),
    Some(34000226),
    Some(18373975)
)]
#[case(
    ScoreboardQuerySortBy::MaxNetWorthPerMatch,
    SortDirectionDesc::Desc,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None
)]
#[case(
    ScoreboardQuerySortBy::PlayerDamage,
    SortDirectionDesc::Desc,
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
    Some(34000226),
    None,
    None
)]
#[case(
    ScoreboardQuerySortBy::HeroBulletsHitCrit,
    SortDirectionDesc::Desc,
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
    None,
    Some(34000226),
    Some(18373975)
)]
#[tokio::test]
async fn test_hero_scoreboard(
    #[case] sort_by: ScoreboardQuerySortBy,
    #[case] sort_direction: SortDirectionDesc,
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
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
    #[case] account_ids: Option<u32>,
) {
    let mut q = vec![];
    push_query!(q, "sort_by" => sort_by);
    push_query!(q, "sort_direction" => sort_direction);
    push_query!(q, "min_matches" =>? min_matches);
    push_query!(q, "max_matches" =>? max_matches);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_networth" =>? min_networth);
    push_query!(q, "max_networth" =>? max_networth);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);
    push_query!(q, "account_ids" =>? account_ids);

    let response = request_endpoint("/v1/analytics/scoreboards/heroes", query_refs(&q)).await;
    let hero_scoreboard: Vec<hero_scoreboard::HeroEntry> =
        response.json().await.expect("Failed to parse response");

    if let Some(min_matches) = min_matches {
        for entry in &hero_scoreboard {
            assert!(entry.matches >= min_matches);
        }
    }
    if let Some(max_matches) = max_matches {
        for entry in &hero_scoreboard {
            assert!(entry.matches <= max_matches);
        }
    }

    if hero_scoreboard.len() > 1 {
        let check_sorted = |field_extractor: fn(&hero_scoreboard::HeroEntry) -> f64,
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
        let extractor = |entry: &hero_scoreboard::HeroEntry| entry.value;
        assert!(check_sorted(extractor, sort_direction));
    }
}

#[rstest]
#[case(
    ScoreboardQuerySortBy::Matches,
    Some(SortDirectionDesc::Desc),
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
    None,
    None,
    None,
    Some(100)
)]
#[case(
    ScoreboardQuerySortBy::Winrate,
    Some(SortDirectionDesc::Asc),
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
    None,
    None,
    None,
    Some(100)
)]
#[case(
    ScoreboardQuerySortBy::AvgDeathsPerMatch,
    None,
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
    Some(34000226),
    Some(34000226),
    Some(18373975),
    Some(100)
)]
#[case(
    ScoreboardQuerySortBy::MaxNetWorthPerMatch,
    Some(SortDirectionDesc::Desc),
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None
)]
#[case(
    ScoreboardQuerySortBy::NeutralDamage,
    Some(SortDirectionDesc::Desc),
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
    Some(34000226),
    None,
    None,
    Some(100)
)]
#[case(
    ScoreboardQuerySortBy::HeroBulletsHitCrit,
    Some(SortDirectionDesc::Desc),
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
    None,
    Some(34000226),
    Some(18373975),
    Some(100)
)]
#[tokio::test]
async fn test_player_scoreboard(
    #[case] sort_by: ScoreboardQuerySortBy,
    #[case] sort_direction: Option<SortDirectionDesc>,
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
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
    #[case] account_ids: Option<u32>,
    #[case] limit: Option<u32>,
) {
    let mut q = vec![];
    push_query!(q, "sort_by" => sort_by);
    push_query!(q, "sort_direction" =>? sort_direction);
    push_query!(q, "min_matches" =>? min_matches);
    push_query!(q, "max_matches" =>? max_matches);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_networth" =>? min_networth);
    push_query!(q, "max_networth" =>? max_networth);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);
    push_query!(q, "account_ids" =>? account_ids);

    let response = request_endpoint("/v1/analytics/scoreboards/players", query_refs(&q)).await;
    let player_scoreboard: Vec<player_scoreboard::PlayerEntry> =
        response.json().await.expect("Failed to parse response");

    if let Some(limit) = limit {
        assert!(player_scoreboard.len() <= limit as usize);
    }
    if let Some(min_matches) = min_matches {
        for entry in &player_scoreboard {
            assert!(entry.matches >= min_matches);
        }
    }
    if let Some(max_matches) = max_matches {
        for entry in &player_scoreboard {
            assert!(entry.matches <= max_matches);
        }
    }

    if player_scoreboard.len() > 1 {
        let check_sorted = |field_extractor: fn(&player_scoreboard::PlayerEntry) -> f64,
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
        let extractor = |entry: &player_scoreboard::PlayerEntry| entry.value;
        assert!(check_sorted(extractor, sort_direction.unwrap_or_default()));
    }
}

#[rstest]
#[case(None, Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, Some(10), Some(100), Some(vec![1548066885, 968099481]), Some(vec![1797283378]), None)]
#[case(Some(hero_stats::BucketQuery::NoBucket), Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), Some(34000226), Some(34000226), Some(10), Some(100), Some(vec![1548066885, 968099481]), Some(vec![1797283378]), Some(18373975))]
#[case(Some(hero_stats::BucketQuery::StartTimeDay), Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, Some(10), Some(100), Some(vec![1548066885, 968099481]), Some(vec![1797283378]), None)]
#[case(Some(hero_stats::BucketQuery::StartTimeMonth), Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, Some(10), Some(100), Some(vec![1548066885, 968099481]), Some(vec![1797283378]), None)]
#[tokio::test]
async fn test_hero_stats(
    #[case] bucket: Option<hero_stats::BucketQuery>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
    #[case] min_hero_matches: Option<u64>,
    #[case] max_hero_matches: Option<u64>,
    #[case] include_item_ids: Option<Vec<u32>>,
    #[case] exclude_item_ids: Option<Vec<u32>>,
    #[case] account_ids: Option<u32>,
) {
    let mut q = vec![];
    push_query!(q, "bucket" =>? bucket);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_networth" =>? min_networth);
    push_query!(q, "max_networth" =>? max_networth);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);
    push_query!(q, "min_hero_matches" =>? min_hero_matches);
    push_query!(q, "max_hero_matches" =>? max_hero_matches);
    push_query!(q, "include_item_ids" =>[] include_item_ids);
    push_query!(q, "exclude_item_ids" =>[] exclude_item_ids);
    push_query!(q, "account_ids" =>? account_ids);

    let refs = query_refs(&q);
    refs.iter().for_each(|(k, v)| println!("{k}={v}"));
    let response = request_endpoint("/v1/analytics/hero-stats", refs).await;
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
    None,
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    None,
    None,
    None,
    Some(10),
    Some(100)
)]
#[case(
    Some(true),
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    Some(34000226),
    Some(34000226),
    Some(18373975),
    Some(10),
    Some(100)
)]
#[case(
    Some(false),
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    None,
    None,
    None,
    Some(10),
    Some(100)
)]
#[tokio::test]
async fn test_hero_synergies_stats(
    #[case] same_lane_filter: Option<bool>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
    #[case] account_ids: Option<u32>,
    #[case] min_matches: Option<u64>,
    #[case] max_matches: Option<u64>,
) {
    let mut q = vec![];
    push_query!(q, "same_lane_filter" =>? same_lane_filter);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_networth" =>? min_networth);
    push_query!(q, "max_networth" =>? max_networth);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);
    push_query!(q, "account_ids" =>? account_ids);
    push_query!(q, "min_matches" =>? min_matches);
    push_query!(q, "max_matches" =>? max_matches);

    let response = request_endpoint("/v1/analytics/hero-synergy-stats", query_refs(&q)).await;
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
#[case(None, Some(vec![1, 2, 3]), Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, Some(vec![1548066885, 1009965641, 709540378]), Some(vec![1248737459, 3535785353]), None, Some(10), Some(100))]
#[case(Some(item_stats::BucketQuery::NoBucket), Some(vec![1, 2, 3]), Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), Some(34000226), Some(34000226), Some(vec![1548066885, 1009965641, 709540378]), Some(vec![1248737459, 3535785353]), Some(18373975), Some(10), Some(100))]
#[case(Some(item_stats::BucketQuery::Hero), Some(vec![1, 2, 3]), Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, Some(vec![1548066885, 1009965641, 709540378]), Some(vec![1248737459, 3535785353]), None, Some(10), Some(100))]
#[case(Some(item_stats::BucketQuery::StartTimeDay), Some(vec![1, 2, 3]), Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, Some(vec![1548066885, 1009965641, 709540378]), Some(vec![1248737459, 3535785353]), None, Some(10), Some(100))]
#[case(Some(item_stats::BucketQuery::NetWorthBy5000), Some(vec![1, 2, 3]), Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, Some(vec![1548066885, 1009965641, 709540378]), Some(vec![1248737459, 3535785353]), None, Some(10), Some(100))]
#[tokio::test]
async fn test_item_stats(
    #[case] bucket: Option<item_stats::BucketQuery>,
    #[case] hero_ids: Option<Vec<u32>>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
    #[case] include_item_ids: Option<Vec<u32>>,
    #[case] exclude_item_ids: Option<Vec<u32>>,
    #[case] account_ids: Option<u32>,
    #[case] min_matches: Option<u64>,
    #[case] max_matches: Option<u64>,
) {
    let mut q = vec![];
    push_query!(q, "bucket" =>? bucket);
    push_query!(q, "hero_ids" =>[] hero_ids);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_networth" =>? min_networth);
    push_query!(q, "max_networth" =>? max_networth);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);
    push_query!(q, "include_item_ids" =>[] include_item_ids);
    push_query!(q, "exclude_item_ids" =>[] exclude_item_ids);
    push_query!(q, "min_matches" =>? min_matches);
    push_query!(q, "max_matches" =>? max_matches);
    push_query!(q, "account_ids" =>? account_ids);

    let response = request_endpoint("/v1/analytics/item-stats", query_refs(&q)).await;
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
#[case(None, Some(vec![1]), None, None, None, Some(1741801678), Some(1742233678), Some(1), None)]
#[case(Some(item_stats::BucketQuery::Hero), Some(vec![1, 2]), Some(vec![15, 13]), Some(false), None, Some(1741801678), Some(1742233678), Some(1), None)]
#[case(None, Some(vec![15]), None, Some(true), None, Some(1741801678), Some(1742233678), Some(1), None)]
#[case(None, Some(vec![15]), None, None, Some(80_000), Some(1741801678), Some(1742233678), Some(1), None)]
#[tokio::test]
async fn test_item_stats_with_enemy_filter(
    #[case] bucket: Option<item_stats::BucketQuery>,
    #[case] enemy_hero_ids: Option<Vec<u32>>,
    #[case] hero_ids: Option<Vec<u32>>,
    #[case] same_lane_filter: Option<bool>,
    #[case] max_enemy_networth: Option<u64>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_matches: Option<u64>,
    #[case] max_matches: Option<u64>,
) {
    let mut q = vec![];
    push_query!(q, "bucket" =>? bucket);
    push_query!(q, "enemy_hero_ids" =>[] enemy_hero_ids);
    push_query!(q, "hero_ids" =>[] hero_ids);
    push_query!(q, "same_lane_filter" =>? same_lane_filter);
    push_query!(q, "max_enemy_networth" =>? max_enemy_networth);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_matches" =>? min_matches);
    push_query!(q, "max_matches" =>? max_matches);

    let response = request_endpoint("/v1/analytics/item-stats", query_refs(&q)).await;
    let item_stats: Vec<ItemStats> = response.json().await.expect("Failed to parse response");

    assert_eq!(
        item_stats
            .iter()
            .map(|s| (s.item_id, s.bucket))
            .unique()
            .count(),
        item_stats.len(),
    );

    for stat in &item_stats {
        assert_eq!(stat.wins + stat.losses, stat.matches);
        if let Some(min_matches) = min_matches {
            assert!(stat.matches >= min_matches);
        }
        if let Some(max_matches) = max_matches {
            assert!(stat.matches <= max_matches);
        }
        match bucket {
            Some(item_stats::BucketQuery::NoBucket) | None => assert_eq!(stat.bucket, 0),
            _ => {}
        }
    }
}

#[rstest]
#[case(
    1,
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    None,
    None,
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    None,
    None,
    Some(10),
    None
)]
#[case(
    1,
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10),
    Some(16),
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    Some(34000226),
    Some(34000226),
    Some(10),
    Some(18373975)
)]
#[case(
    1,
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(10),
    None,
    Some(10000),
    Some(50000),
    Some(40),
    Some(100),
    None,
    None,
    Some(10),
    None
)]
#[tokio::test]
async fn test_ability_order_stats(
    #[case] hero_id: u32,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_ability_upgrades: Option<u64>,
    #[case] max_ability_upgrades: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
    #[case] min_matches: Option<u32>,
    #[case] account_ids: Option<u32>,
) {
    let mut q = vec![];
    push_query!(q, "hero_id" => hero_id);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_ability_upgrades" =>? min_ability_upgrades);
    push_query!(q, "max_ability_upgrades" =>? max_ability_upgrades);
    push_query!(q, "min_networth" =>? min_networth);
    push_query!(q, "max_networth" =>? max_networth);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);
    push_query!(q, "min_matches" =>? min_matches);
    push_query!(q, "account_ids" =>? account_ids);

    let response = request_endpoint("/v1/analytics/ability-order-stats", query_refs(&q)).await;
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
#[case(Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), None, None, Some(vec![1, 2, 3]), Some(vec![4, 5]), Some(vec![6, 7]), None)]
#[case(Some(1741801678), Some(1742233678), Some(1000), Some(5000), Some(10000), Some(50000), Some(40), Some(100), Some(34000226), Some(34000226), Some(vec![1, 2, 3]), Some(vec![4, 5]), Some(vec![6, 7]), Some(18373975))]
#[tokio::test]
async fn test_player_performance_curve(
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_networth: Option<u64>,
    #[case] max_networth: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
    #[case] hero_ids: Option<Vec<u32>>,
    #[case] include_item_ids: Option<Vec<u32>>,
    #[case] exclude_item_ids: Option<Vec<u32>>,
    #[case] account_ids: Option<u32>,
) {
    let mut q = vec![];
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_networth" =>? min_networth);
    push_query!(q, "max_networth" =>? max_networth);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);
    push_query!(q, "hero_ids" =>[] hero_ids);
    push_query!(q, "include_item_ids" =>[] include_item_ids);
    push_query!(q, "exclude_item_ids" =>[] exclude_item_ids);
    push_query!(q, "account_ids" =>? account_ids);

    let response = request_endpoint("/v1/analytics/player-performance-curve", query_refs(&q)).await;
    let player_performance_curve: Vec<PlayerPerformanceCurvePoint> =
        response.json().await.expect("Failed to parse response");

    // Verify game_times are unique and sorted
    let mut timestamps: Vec<u32> = player_performance_curve
        .iter()
        .map(|p| p.game_time)
        .collect();
    timestamps.sort();
    timestamps.dedup();
    assert_eq!(timestamps.len(), player_performance_curve.len());

    // Verify game_times are in 5% increments from 0 to 100
    for (i, &timestamp) in timestamps.iter().enumerate() {
        assert_eq!(timestamp, (i as u32) * 5);
    }

    for point in &player_performance_curve {
        // Verify net_worth_avg is positive and reasonable
        assert!(point.net_worth_avg > 0.0);
        assert!(point.net_worth_avg < 1_000_000.0); // reasonable upper bound

        // Verify net_worth_std is non-negative
        assert!(point.net_worth_std >= 0.0);
    }
}

#[rstest]
#[case(
    None,
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(40),
    Some(100),
    None,
    None
)]
#[case(
    Some(game_stats::BucketQuery::NoBucket),
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(40),
    Some(100),
    Some(34000226),
    Some(34000226)
)]
#[case(
    Some(game_stats::BucketQuery::AvgBadge),
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(40),
    Some(100),
    None,
    None
)]
#[case(
    Some(game_stats::BucketQuery::StartTimeDay),
    Some(1741801678),
    Some(1742233678),
    Some(1000),
    Some(5000),
    Some(40),
    Some(100),
    None,
    None
)]
#[tokio::test]
async fn test_game_stats(
    #[case] bucket: Option<game_stats::BucketQuery>,
    #[case] min_unix_timestamp: Option<i64>,
    #[case] max_unix_timestamp: Option<i64>,
    #[case] min_duration_s: Option<u64>,
    #[case] max_duration_s: Option<u64>,
    #[case] min_average_badge: Option<u8>,
    #[case] max_average_badge: Option<u8>,
    #[case] min_match_id: Option<u64>,
    #[case] max_match_id: Option<u64>,
) {
    let mut q = vec![];
    push_query!(q, "bucket" =>? bucket);
    push_query!(q, "min_unix_timestamp" =>? min_unix_timestamp);
    push_query!(q, "max_unix_timestamp" =>? max_unix_timestamp);
    push_query!(q, "min_duration_s" =>? min_duration_s);
    push_query!(q, "max_duration_s" =>? max_duration_s);
    push_query!(q, "min_average_badge" =>? min_average_badge);
    push_query!(q, "max_average_badge" =>? max_average_badge);
    push_query!(q, "min_match_id" =>? min_match_id);
    push_query!(q, "max_match_id" =>? max_match_id);

    let response = request_endpoint("/v1/analytics/game-stats", query_refs(&q)).await;
    let game_stats: Vec<AnalyticsGameStats> =
        response.json().await.expect("Failed to parse response");

    for stat in &game_stats {
        assert!(stat.total_matches > 0);
        assert!(stat.avg_duration_s >= 0.0);
        assert!(stat.avg_kills >= 0.0);
        assert!(stat.avg_deaths >= 0.0);
        assert!(stat.avg_assists >= 0.0);
        assert!(stat.avg_kd_ratio >= 0.0);
        assert!(stat.avg_net_worth >= 0.0);
        assert!(stat.avg_last_hits >= 0.0);
        assert!(stat.avg_denies >= 0.0);
        assert!(stat.avg_player_damage >= 0.0);
        assert!(stat.avg_player_damage_taken >= 0.0);
        assert!(stat.avg_boss_damage >= 0.0);
        assert!(stat.avg_player_healing >= 0.0);
        assert!(stat.avg_accuracy >= 0.0 && stat.avg_accuracy <= 1.0);
        assert!(stat.avg_crit_rate >= 0.0 && stat.avg_crit_rate <= 1.0);
        assert!(stat.avg_ending_level >= 0.0);
        assert!(stat.mid_boss_kill_rate >= 0.0 && stat.mid_boss_kill_rate <= 1.0);
        assert!(stat.abandon_rate >= 0.0 && stat.abandon_rate <= 1.0);
    }
}
