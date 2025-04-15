mod utils;

use deadlock_api_rust::routes::v1::analytics::hero_comb_win_loss_stats::HeroCombWinLossStats;
use itertools::Itertools;
use rstest::rstest;

#[rstest]
#[tokio::test]
async fn test_hero_comb_win_loss_stats(
    #[values(None, Some(1))] min_matches: Option<u32>,
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
    let response = utils::request_endpoint("/v1/analytics/hero-comb-win-loss-stats", queries).await;
    let comb_stats: Vec<HeroCombWinLossStats> =
        response.json().await.expect("Failed to parse response");

    for comb in comb_stats.iter() {
        assert_eq!(comb.wins + comb.losses, comb.matches);
        assert_eq!(comb.hero_ids.iter().unique().count(), 6);
        assert!(comb.matches >= 1);
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
