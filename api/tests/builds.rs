#![allow(clippy::too_many_arguments)]

mod utils;
use deadlock_api_rust::routes::v1::builds::query::BuildsSearchQuerySortBy;
use deadlock_api_rust::routes::v1::builds::structs::Build;
use deadlock_api_rust::utils::types::SortDirectionDesc;
use itertools::Itertools;
use rstest::rstest;

#[rstest]
#[tokio::test]
async fn test_builds(
    #[values(None, Some(10))] limit: Option<usize>,
    #[values(None, Some(BuildsSearchQuerySortBy::UpdatedAt))] sort_by: Option<
        BuildsSearchQuerySortBy,
    >,
    #[values(None, Some(SortDirectionDesc::Asc))] sort_direction: Option<SortDirectionDesc>,
    #[values(None, Some("Lash"))] search_name: Option<&str>,
    #[values(None, Some(true))] only_latest: Option<bool>,
    #[values(None, Some(132494))] build_id: Option<u32>,
    #[values(None, Some(16))] version: Option<u32>,
    #[values(None, Some(15))] hero_id: Option<u32>,
    #[values(None, Some(18373975))] author_id: Option<u32>,
    #[values(None, Some(1747743170))] min_unix_timestamp: Option<u64>,
    #[values(None, Some(1747763170))] max_unix_timestamp: Option<u64>,
) {
    let mut queries = vec![];
    if let Some(limit) = limit {
        queries.push(("limit", limit.to_string()));
    }
    if let Some(hero_id) = hero_id {
        queries.push(("hero_id", hero_id.to_string()));
    }
    if let Some(account_id) = author_id {
        queries.push(("author_id", account_id.to_string()));
    }
    if let Some(sort_by) = sort_by {
        queries.push(("sort_by", sort_by.to_string()));
    }
    if let Some(sort_direction) = sort_direction {
        queries.push(("sort_direction", sort_direction.to_string()));
    }
    if let Some(search_name) = search_name {
        queries.push(("search_name", search_name.to_string()));
    }
    if let Some(only_latest) = only_latest {
        queries.push(("only_latest", only_latest.to_string()));
    }
    if let Some(build_id) = build_id {
        queries.push(("build_id", build_id.to_string()));
    }
    if let Some(version) = version {
        queries.push(("version", version.to_string()));
    }
    if let Some(min_unix_timestamp) = min_unix_timestamp {
        queries.push(("min_unix_timestamp", min_unix_timestamp.to_string()));
    }
    if let Some(max_unix_timestamp) = max_unix_timestamp {
        queries.push(("max_unix_timestamp", max_unix_timestamp.to_string()));
    }
    let queries = queries
        .iter()
        .map(|(k, v)| (*k, v.as_str()))
        .collect::<Vec<_>>();
    let response = utils::request_endpoint("/v1/builds", queries).await;
    let builds: Vec<Build> = response.json().await.expect("Failed to parse response");

    let sort_by = sort_by.unwrap_or_default();
    let sort_direction = sort_direction.unwrap_or_default();
    let builds_sorted = if sort_direction == SortDirectionDesc::Desc {
        builds.iter().rev().collect::<Vec<_>>()
    } else {
        builds.iter().collect::<Vec<_>>()
    };

    fn get_sort_key(sort_by: BuildsSearchQuerySortBy, build: &Build) -> u32 {
        match sort_by {
            BuildsSearchQuerySortBy::WeeklyFavorites => build.num_weekly_favorites,
            BuildsSearchQuerySortBy::Favorites => build.num_favorites,
            BuildsSearchQuerySortBy::Ignores => build.num_ignores,
            BuildsSearchQuerySortBy::Reports => build.num_reports,
            BuildsSearchQuerySortBy::Version => build.hero_build.version.into(),
            BuildsSearchQuerySortBy::UpdatedAt => {
                (build.hero_build.last_updated_timestamp as u32).into()
            }
            BuildsSearchQuerySortBy::PublishedAt => {
                (build.hero_build.publish_timestamp as u32).into()
            }
        }
        .unwrap_or_default()
    }

    let is_sorted = builds_sorted.is_sorted_by_key(|k| get_sort_key(sort_by, k));
    assert!(
        is_sorted,
        "Builds are not sorted by {sort_by} in {sort_direction} order"
    );

    if let Some(limit) = limit {
        assert!(builds.len() <= limit);
    }
    if only_latest.unwrap_or_default() {
        assert_eq!(
            builds
                .iter()
                .unique_by(|a| a.hero_build.hero_build_id)
                .count(),
            builds.len()
        );
    }
    for build in &builds {
        let hero_build = &build.hero_build;
        if let Some(hero_id) = hero_id {
            assert_eq!(hero_build.hero_id, hero_id);
        }
        if let Some(build_id) = build_id {
            assert_eq!(hero_build.hero_build_id, build_id);
        }
        if let Some(account_id) = author_id {
            assert_eq!(hero_build.author_account_id, account_id);
        }
        if let Some(version) = version {
            assert_eq!(build.hero_build.version, version);
        }
        if let Some(search_name) = search_name {
            assert!(
                hero_build
                    .name
                    .to_lowercase()
                    .contains(&search_name.to_lowercase())
            );
        }
        if let Some(min_unix_timestamp) = min_unix_timestamp {
            assert!(hero_build.last_updated_timestamp as u64 >= min_unix_timestamp);
        }
        if let Some(max_unix_timestamp) = max_unix_timestamp {
            assert!(hero_build.last_updated_timestamp as u64 <= max_unix_timestamp);
        }
    }
}
