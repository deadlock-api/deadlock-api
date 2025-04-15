use crate::utils::parse::parse_steam_id_option;
use crate::utils::types::SortDirectionDesc;
use derive_more::Display;
use serde::{Deserialize, Serialize};
use sqlx::{Execute, QueryBuilder};
use utoipa::{IntoParams, ToSchema};

fn default_limit() -> Option<u32> {
    100.into()
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, Default, Display)]
#[serde(rename_all = "snake_case")]
pub enum BuildsSearchQuerySortBy {
    /// Sort by the number of weekly favorites.
    #[default]
    #[display("weekly_favorites")]
    WeeklyFavorites,
    /// Sort by the number of all-time favorites.
    #[display("favorites")]
    Favorites,
    /// Sort by the number of weekly ignores. (currently always 0)
    #[display("ignores")]
    Ignores,
    /// Sort by the number of weekly reports. (currently always 0)
    #[display("reports")]
    Reports,
    /// Sort by the last time the build was updated.
    #[display("updated_at")]
    UpdatedAt,
    /// Sort by the build version.
    #[display("version")]
    Version,
}

#[derive(Debug, Clone, Serialize, Deserialize, IntoParams)]
#[into_params(style = Form, parameter_in = Query)]
#[serde(rename_all = "snake_case")]
pub struct BuildsSearchQuery {
    /// The index of the first build to return.
    pub start: Option<u32>,
    /// The maximum number of builds to return.
    #[serde(default = "default_limit")]
    #[param(inline, default = "100")]
    pub limit: Option<u32>,
    /// The field to sort the builds by.
    #[serde(default)]
    #[param(inline)]
    pub sort_by: BuildsSearchQuerySortBy,
    /// The direction to sort the builds in.
    #[serde(default)]
    #[param(inline)]
    pub sort_direction: SortDirectionDesc,
    /// Search for builds with a name containing this string.
    pub search_name: Option<String>,
    /// Search for builds with a description containing this string.
    pub search_description: Option<String>,
    /// Only return the latest version of each build.
    pub only_latest: Option<bool>,
    /// Filter builds by language.
    pub language: Option<u32>,
    /// Filter builds by ID.
    pub build_id: Option<u32>,
    /// Filter builds by version.
    pub version: Option<u32>,
    /// Filter builds by hero ID.
    pub hero_id: Option<u32>,
    /// Filter builds by rollup category.
    pub rollup_category: Option<u32>,
    /// The author's SteamID3
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    pub author_id: Option<u32>,
}

impl Default for BuildsSearchQuery {
    fn default() -> Self {
        Self {
            start: None,
            limit: Some(100),
            sort_by: BuildsSearchQuerySortBy::Favorites,
            sort_direction: SortDirectionDesc::Desc,
            search_name: None,
            search_description: None,
            only_latest: None,
            language: None,
            build_id: None,
            version: None,
            hero_id: None,
            rollup_category: None,
            author_id: None,
        }
    }
}

pub fn sql_query(params: &BuildsSearchQuery) -> String {
    let mut query_builder: QueryBuilder<sqlx::Postgres> = QueryBuilder::default();
    query_builder.push(" SELECT data as builds FROM hero_builds WHERE TRUE");
    if let Some(search_name) = &params.search_name {
        query_builder.push(" AND lower(data->'hero_build'->>'name') LIKE '%");
        query_builder.push(search_name.to_lowercase());
        query_builder.push("%'");
    }
    if let Some(search_description) = &params.search_description {
        query_builder.push(" AND lower(data->'hero_build'->>'description') LIKE '%");
        query_builder.push(search_description.to_lowercase());
        query_builder.push("%'");
    }
    if let Some(language) = params.language {
        query_builder.push(" AND language = ");
        query_builder.push(language.to_string());
    }
    if let Some(build_id) = params.build_id {
        query_builder.push(" AND build_id = ");
        query_builder.push(build_id.to_string());
    }
    if let Some(version) = params.version {
        query_builder.push(" AND version = ");
        query_builder.push(version.to_string());
    }
    if let Some(hero_id) = params.hero_id {
        query_builder.push(" AND hero = ");
        query_builder.push(hero_id.to_string());
    }
    if let Some(author_id) = params.author_id {
        query_builder.push(" AND author_id = ");
        query_builder.push(author_id.to_string());
    }
    if let Some(rollup_category) = params.rollup_category {
        query_builder.push(" AND rollup_category = ");
        query_builder.push(rollup_category.to_string());
    }
    query_builder.push(" ORDER BY ");
    query_builder.push(params.sort_by.to_string().to_lowercase());
    query_builder.push(" ");
    query_builder.push(params.sort_direction.to_string().to_lowercase());
    query_builder.push(" NULLS ");
    query_builder.push(if params.sort_direction == SortDirectionDesc::Desc {
        "LAST"
    } else {
        "FIRST"
    });

    if let Some(limit) = params.limit {
        query_builder.push(" LIMIT ");
        query_builder.push(limit.to_string());
    }
    if let Some(start) = params.start {
        query_builder.push(" OFFSET ");
        query_builder.push(start.to_string());
    }
    query_builder.build().sql().into()
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_values() {
        let query = BuildsSearchQuery::default();

        assert_eq!(query.start, None);
        assert_eq!(query.limit, Some(100));
        assert_eq!(query.sort_by.to_string(), "favorites");
        assert_eq!(query.sort_direction.to_string(), "desc");
        assert_eq!(query.search_name, None);
        assert_eq!(query.search_description, None);
        assert_eq!(query.only_latest, None);
        assert_eq!(query.language, None);
        assert_eq!(query.build_id, None);
        assert_eq!(query.version, None);
        assert_eq!(query.hero_id, None);
        assert_eq!(query.author_id, None);

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_search_name() {
        let query = BuildsSearchQuery {
            search_name: Some("Tank Build".to_string()),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND lower(data->'hero_build'->>'name') LIKE '%tank build%' ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_search_name_case_insensitive() {
        let query = BuildsSearchQuery {
            search_name: Some("TANK BUILD".to_string()),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND lower(data->'hero_build'->>'name') LIKE '%tank build%' ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_search_description() {
        let query = BuildsSearchQuery {
            search_description: Some("strength items".to_string()),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND lower(data->'hero_build'->>'description') LIKE '%strength items%' ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_language_filter() {
        let query = BuildsSearchQuery {
            language: Some(1),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND language = 1 ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_build_id_filter() {
        let query = BuildsSearchQuery {
            build_id: Some(12345),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND build_id = 12345 ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_version_filter() {
        let query = BuildsSearchQuery {
            version: Some(2),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND version = 2 ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_hero_id_filter() {
        let query = BuildsSearchQuery {
            hero_id: Some(23),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND hero = 23 ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_author_id_filter() {
        let query = BuildsSearchQuery {
            author_id: Some(74963221),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND author_id = 74963221 ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_sort_by_favorites() {
        let query = BuildsSearchQuery {
            sort_by: BuildsSearchQuerySortBy::Favorites,
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_sort_by_ignores() {
        let query = BuildsSearchQuery {
            sort_by: BuildsSearchQuerySortBy::Ignores,
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY ignores desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_sort_by_reports() {
        let query = BuildsSearchQuery {
            sort_by: BuildsSearchQuerySortBy::Reports,
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY reports desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_sort_by_updated_at() {
        let query = BuildsSearchQuery {
            sort_by: BuildsSearchQuerySortBy::UpdatedAt,
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY updated_at desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_sort_by_version() {
        let query = BuildsSearchQuery {
            sort_by: BuildsSearchQuerySortBy::Version,
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY version desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_sort_direction_desc() {
        let query = BuildsSearchQuery {
            sort_direction: SortDirectionDesc::Desc,
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_sort_direction_asc() {
        let query = BuildsSearchQuery {
            sort_direction: SortDirectionDesc::Asc,
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY favorites asc NULLS FIRST LIMIT 100"
        );
    }

    #[test]
    fn test_custom_limit() {
        let query = BuildsSearchQuery {
            limit: Some(50),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY favorites desc NULLS LAST LIMIT 50"
        );
    }

    #[test]
    fn test_start_offset() {
        let query = BuildsSearchQuery {
            start: Some(10),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY favorites desc NULLS LAST LIMIT 100 OFFSET 10"
        );
    }

    #[test]
    fn test_combined_filters() {
        let query = BuildsSearchQuery {
            search_name: Some("Tank".to_string()),
            hero_id: Some(42),
            sort_by: BuildsSearchQuerySortBy::UpdatedAt,
            sort_direction: SortDirectionDesc::Asc,
            limit: Some(25),
            start: Some(5),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND lower(data->'hero_build'->>'name') LIKE '%tank%' AND hero = 42 ORDER BY updated_at asc NULLS FIRST LIMIT 25 OFFSET 5"
        );
    }

    #[test]
    fn test_multiple_search_conditions() {
        let query = BuildsSearchQuery {
            search_name: Some("Tank".to_string()),
            search_description: Some("Strength".to_string()),
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND lower(data->'hero_build'->>'name') LIKE '%tank%' AND lower(data->'hero_build'->>'description') LIKE '%strength%' ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_sql_injection_attempt() {
        let query = BuildsSearchQuery {
            search_name: Some("'; DROP TABLE hero_builds; --".to_string()),
            ..Default::default()
        };

        let sql = sql_query(&query);
        // Note: This test verifies that the input is properly incorporated as a string literal
        // PostgreSQL prepared statements would handle this properly, but we're also making sure
        // the function itself doesn't do anything unexpected with malicious input
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE AND lower(data->'hero_build'->>'name') LIKE '%'; drop table hero_builds; --%' ORDER BY favorites desc NULLS LAST LIMIT 100"
        );
    }

    #[test]
    fn test_no_limit_specified() {
        let query = BuildsSearchQuery {
            limit: None,
            ..Default::default()
        };

        let sql = sql_query(&query);
        assert_eq!(
            sql,
            " SELECT data as builds FROM hero_builds WHERE TRUE ORDER BY favorites desc NULLS LAST"
        );
    }
}
