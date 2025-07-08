use deadlock_api_rust::routes::v1::players::enemy_stats::EnemyStats;
use deadlock_api_rust::routes::v1::players::hero_stats::HeroStats;
use deadlock_api_rust::routes::v1::players::mate_stats::MateStats;
use deadlock_api_rust::routes::v1::players::mmr_history::MMRHistory;
use deadlock_api_rust::routes::v1::players::party_stats::PartyStats;
use itertools::Itertools;
use rstest::rstest;

use crate::request_endpoint;

#[rstest]
#[tokio::test]
async fn test_player_hero_stats(#[values(18373975)] account_id: u32) {
    let response = request_endpoint(&format!("/v1/players/{account_id}/hero-stats"), []).await;
    let stats: Vec<HeroStats> = response.json().await.expect("Failed to parse response");
    assert!(stats.iter().all(|s| s.hero_id > 0));
    assert_eq!(
        stats.iter().map(|s| s.hero_id).unique().count(),
        stats.len()
    );
}

#[rstest]
#[tokio::test]
async fn test_player_enemy_stats(#[values(18373975)] account_id: u32) {
    let response = request_endpoint(&format!("/v1/players/{account_id}/enemy-stats"), []).await;
    let stats: Vec<EnemyStats> = response.json().await.expect("Failed to parse response");
    assert_eq!(
        stats.iter().map(|s| s.enemy_id).unique().count(),
        stats.len()
    );
}

#[rstest]
#[tokio::test]
async fn test_player_mate_stats(#[values(18373975)] account_id: u32) {
    let response = request_endpoint(&format!("/v1/players/{account_id}/mate-stats"), []).await;
    let stats: Vec<MateStats> = response.json().await.expect("Failed to parse response");
    assert_eq!(
        stats.iter().map(|s| s.mate_id).unique().count(),
        stats.len()
    );
}

#[rstest]
#[tokio::test]
async fn test_player_party_stats(#[values(18373975)] account_id: u32) {
    let response = request_endpoint(&format!("/v1/players/{account_id}/party-stats"), []).await;
    let stats: Vec<PartyStats> = response.json().await.expect("Failed to parse response");
    assert!(stats.iter().all(|s| s.party_size > 0));
    assert_eq!(
        stats.iter().map(|s| s.party_size).unique().count(),
        stats.len()
    );
}

#[rstest]
#[tokio::test]
async fn test_player_mmr_history(#[values(18373975)] account_id: u32) {
    let response = request_endpoint(&format!("/v1/players/{account_id}/mmr-history"), []).await;
    let stats: Vec<MMRHistory> = response.json().await.expect("Failed to parse response");
    assert!(stats.windows(2).all(|w| w[0].start_time <= w[1].start_time));
}
