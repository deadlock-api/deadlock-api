use crate::utils::parse_steam_id_option;
use derive_more::Display;
use serde::{Deserialize, Serialize};
use sqlx::{Execute, QueryBuilder};
use utoipa::{IntoParams, ToSchema};

fn default_limit() -> Option<u32> {
    100.into()
}

#[derive(Serialize, Deserialize, ToSchema, Default, Display)]
#[serde(rename_all = "snake_case")]
pub enum BuildsSearchQuerySortBy {
    #[default]
    #[display("favorites")]
    Favorites,
    #[display("ignores")]
    Ignores,
    #[display("reports")]
    Reports,
    #[display("updated_at")]
    UpdatedAt,
    #[display("version")]
    Version,
}

#[derive(Serialize, Deserialize, ToSchema, Default, Display)]
#[serde(rename_all = "snake_case")]
pub enum BuildsSearchQuerySortDirection {
    #[default]
    #[display("desc")]
    Desc,
    #[display("asc")]
    Asc,
}

#[derive(Serialize, Deserialize, IntoParams, Default)]
#[into_params(style = Form, parameter_in = Query)]
#[serde(rename_all = "snake_case")]
pub struct BuildsSearchQuery {
    pub start: Option<u32>,
    #[serde(default = "default_limit")]
    #[param(inline, default = "100")]
    pub limit: Option<u32>,
    #[serde(default)]
    #[param(inline)]
    pub sort_by: BuildsSearchQuerySortBy,
    #[serde(default)]
    #[param(inline)]
    pub sort_direction: BuildsSearchQuerySortDirection,
    pub search_name: Option<String>,
    pub search_description: Option<String>,
    pub only_latest: Option<bool>,
    pub language: Option<u32>,
    pub build_id: Option<u32>,
    pub version: Option<u32>,
    pub hero_id: Option<u32>,
    /// The author's SteamID3
    #[serde(default)]
    #[serde(deserialize_with = "parse_steam_id_option")]
    pub author_id: Option<u32>,
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
    query_builder.push(" ORDER BY ");
    query_builder.push(params.sort_by.to_string().to_lowercase());
    query_builder.push(" ");
    query_builder.push(params.sort_direction.to_string().to_lowercase());

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
