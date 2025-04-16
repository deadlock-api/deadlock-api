mod utils;

use deadlock_api_rust::routes::v1::analytics::hero_comb_stats::HeroCombStats;
use deadlock_api_rust::routes::v1::analytics::hero_counters_stats::HeroCounterStats;
use deadlock_api_rust::routes::v1::analytics::hero_scoreboard::HeroScoreboardEntry;
use deadlock_api_rust::routes::v1::analytics::hero_stats::AnalyticsHeroStats;
use deadlock_api_rust::routes::v1::analytics::player_scoreboard::PlayerScoreboardEntry;
use deadlock_api_rust::routes::v1::analytics::scoreboard_types::ScoreboardQuerySortBy;
use deadlock_api_rust::utils::types::SortDirectionDesc;
use itertools::Itertools;
use rstest::rstest;

#[rstest]
#[tokio::test]
async fn test_hero_comb_stats(
    #[values(None, Some(1))] min_matches: Option<u64>,
    #[values(None, Some(vec![1, 15]), Some(vec![10, 11, 12]))] include_hero_ids: Option<Vec<u32>>,
    #[values(None, Some(vec![2, 52]), Some(vec![16, 25]))] exclude_hero_ids: Option<Vec<u32>>,
) {
    let mut queries = vec![];
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(include_hero_ids) = include_hero_ids.as_ref() {
        queries.push((
            "include_hero_ids",
            include_hero_ids.iter().map(|s| s.to_string()).join(","),
        ));
    }
    if let Some(exclude_hero_ids) = exclude_hero_ids.as_ref() {
        queries.push((
            "exclude_hero_ids",
            exclude_hero_ids.iter().map(|s| s.to_string()).join(","),
        ));
    }
    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = utils::request_endpoint("/v1/analytics/hero-comb-stats", queries).await;
    let comb_stats: Vec<HeroCombStats> = response.json().await.expect("Failed to parse response");

    for comb in comb_stats.iter() {
        assert_eq!(comb.wins + comb.losses, comb.matches);
        assert_eq!(comb.hero_ids.len(), 6);
        assert_eq!(comb.hero_ids.iter().unique().count(), 6);
        if let Some(min_matches) = min_matches {
            assert!(comb.matches >= min_matches);
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
#[tokio::test]
async fn test_hero_counters_stats(#[values(None, Some(20))] min_matches: Option<u64>) {
    let mut queries = vec![];
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = utils::request_endpoint("/v1/analytics/hero-counter-stats", queries).await;
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
        if let Some(min_matches) = min_matches {
            assert!(counter_stat.wins <= counter_stat.matches_played);
            assert!(counter_stat.matches_played >= min_matches);
        }
    }
}

#[rstest]
#[tokio::test]
async fn test_hero_scoreboard(
    #[values(None, Some(10))] min_matches: Option<u64>,
    #[values(ScoreboardQuerySortBy::Winrate, ScoreboardQuerySortBy::Matches)]
    sort_by: ScoreboardQuerySortBy,
    #[values(None, Some(SortDirectionDesc::Asc))] sort_direction: Option<SortDirectionDesc>,
) {
    let mut queries = vec![];
    queries.push(("sort_by", sort_by.to_string()));
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(sort_direction) = sort_direction {
        queries.push(("sort_direction", sort_direction.to_string()));
    }
    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = utils::request_endpoint("/v1/analytics/scoreboards/heroes", queries).await;
    let hero_scoreboard: Vec<HeroScoreboardEntry> =
        response.json().await.expect("Failed to parse response");

    // Verify min_matches requirement
    if let Some(min_matches) = min_matches {
        for entry in &hero_scoreboard {
            assert!(entry.matches >= min_matches);
        }
    }

    // Verify sorting
    if hero_scoreboard.len() > 1 {
        let check_sorted = |field_extractor: fn(&HeroScoreboardEntry) -> f64,
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

        match sort_by {
            ScoreboardQuerySortBy::Winrate => {
                let extractor = |entry: &HeroScoreboardEntry| entry.value;
                assert!(check_sorted(extractor, sort_direction.unwrap_or_default()));
            }
            ScoreboardQuerySortBy::Matches => {
                let extractor = |entry: &HeroScoreboardEntry| entry.value;
                assert!(check_sorted(extractor, sort_direction.unwrap_or_default()));
            }
            _ => {
                unreachable!();
            }
        }
    }
}

#[rstest]
#[tokio::test]
async fn test_player_scoreboard(
    #[values(None, Some(5))] min_matches: Option<u64>,
    #[values(ScoreboardQuerySortBy::Winrate, ScoreboardQuerySortBy::Matches)]
    sort_by: ScoreboardQuerySortBy,
    #[values(None, Some(SortDirectionDesc::Asc))] sort_direction: Option<SortDirectionDesc>,
    #[values(None, Some(10))] limit: Option<u64>,
) {
    let mut queries = vec![];
    queries.push(("sort_by", sort_by.to_string()));
    if let Some(min_matches) = min_matches {
        queries.push(("min_matches", min_matches.to_string()));
    }
    if let Some(sort_direction) = sort_direction {
        queries.push(("sort_direction", sort_direction.to_string()));
    }
    if let Some(limit) = limit {
        queries.push(("limit", limit.to_string()));
    }

    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = utils::request_endpoint("/v1/analytics/scoreboards/players", queries).await;
    let player_scoreboard: Vec<PlayerScoreboardEntry> =
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

    // Verify sorting
    if player_scoreboard.len() > 1 {
        let check_sorted = |field_extractor: fn(&PlayerScoreboardEntry) -> f64,
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

        match sort_by {
            ScoreboardQuerySortBy::Winrate => {
                let extractor = |entry: &PlayerScoreboardEntry| entry.value;
                assert!(check_sorted(extractor, sort_direction.unwrap_or_default()));
            }
            ScoreboardQuerySortBy::Matches => {
                let extractor = |entry: &PlayerScoreboardEntry| entry.value;
                assert!(check_sorted(extractor, sort_direction.unwrap_or_default()));
            }
            _ => {
                unreachable!();
            }
        }
    }
}

#[tokio::test]
async fn test_hero_stats() {
    let response = utils::request_endpoint("/v1/analytics/hero-stats", []).await;
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
