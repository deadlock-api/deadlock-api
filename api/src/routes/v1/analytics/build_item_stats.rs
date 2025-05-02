use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::parse::default_last_month_timestamp;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use sqlx::{Execute, Pool, Postgres, QueryBuilder};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub struct BuildItemStatsQuery {
    /// Filter builds based on the hero ID.
    pub hero_id: Option<u32>,
    /// Filter builds based on their last updated time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    pub min_last_updated_unix_timestamp: Option<u64>,
    /// Filter builds based on their last updated time (Unix timestamp).
    pub max_last_updated_unix_timestamp: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, ToSchema, Eq, PartialEq, Hash)]
pub struct BuildItemStats {
    pub item_id: i64,
    pub builds: i64,
}

fn build_build_item_stats_query(query: &BuildItemStatsQuery) -> String {
    let mut query_builder: QueryBuilder<Postgres> = QueryBuilder::default();
    query_builder.push(r#"
    SELECT (mod_element ->> 'ability_id')::bigint AS item_id, COUNT(*) as num_builds
    FROM hero_builds,
        LATERAL jsonb_array_elements(data -> 'hero_build' -> 'details' -> 'mod_categories') AS category_element,
        LATERAL jsonb_array_elements(category_element -> 'mods') AS mod_element
    WHERE TRUE
    "#);
    if let Some(hero_id) = query.hero_id {
        query_builder.push(" AND hero = ");
        query_builder.push(hero_id.to_string());
    }
    if let Some(min_last_updated_unix_timestamp) = query.min_last_updated_unix_timestamp {
        query_builder.push(" AND (data -> 'hero_build' ->> 'last_updated_timestamp')::bigint > ");
        query_builder.push(min_last_updated_unix_timestamp.to_string());
    }
    if let Some(max_last_updated_unix_timestamp) = query.max_last_updated_unix_timestamp {
        query_builder.push(" AND (data -> 'hero_build' ->> 'last_updated_timestamp')::bigint < ");
        query_builder.push(max_last_updated_unix_timestamp.to_string());
    }
    query_builder.push(" GROUP BY item_id ORDER BY num_builds DESC");
    query_builder.build().sql().into()
}

#[cached(
    ty = "TimedCache<BuildItemStatsQuery, Vec<BuildItemStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ query }",
    sync_writes = "by_key",
    key = "BuildItemStatsQuery"
)]
pub async fn get_build_item_stats(
    pg_client: &Pool<Postgres>,
    query: BuildItemStatsQuery,
) -> APIResult<Vec<BuildItemStats>> {
    let query = build_build_item_stats_query(&query);
    debug!(?query);
    sqlx::query(&query)
        .fetch_all(pg_client)
        .await
        .map(|rows| {
            rows.into_iter()
                .map(|row| BuildItemStats {
                    item_id: row.get(0),
                    builds: row.get(1),
                })
                .collect::<Vec<_>>()
        })
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch builds: {e}"),
        })
}

#[utoipa::path(
    get,
    path = "/build-item-stats",
    params(BuildItemStatsQuery),
    responses(
        (status = OK, description = "Build Item Stats", body = [BuildItemStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch build item stats")
    ),
    tags = ["Analytics"],
    summary = "Build Item Stats",
    description = r#"
Retrieves item statistics from hero builds.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.
    "#
)]
pub async fn build_item_stats(
    Query(query): Query<BuildItemStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_build_item_stats(&state.pg_client, query)
        .await
        .map(Json)
}
