use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::{Deserialize, Serialize};
use sqlx::{Execute, Pool, Postgres, QueryBuilder, Row};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::default_last_month_timestamp;

#[derive(Copy, Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(super) struct BuildItemStatsQuery {
    /// Filter builds based on the hero ID. See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: Option<u32>,
    /// Filter builds based on their last updated time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    min_last_updated_unix_timestamp: Option<i64>,
    /// Filter builds based on their last updated time (Unix timestamp).
    max_last_updated_unix_timestamp: Option<i64>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, ToSchema, Eq, PartialEq, Hash)]
pub struct BuildItemStats {
    /// See more: <https://assets.deadlock-api.com/v2/items>
    pub item_id: i64,
    pub builds: i64,
}

fn build_query(query: &BuildItemStatsQuery) -> String {
    let mut query_builder: QueryBuilder<Postgres> = QueryBuilder::default();
    query_builder.push(
        "
    SELECT (mod_element ->> 'ability_id')::bigint AS item_id, COUNT(*) as num_builds
    FROM hero_builds,
        LATERAL jsonb_array_elements(data -> 'hero_build' -> 'details' -> 'mod_categories') AS \
         category_element,
        LATERAL jsonb_array_elements(category_element -> 'mods') AS mod_element
    WHERE TRUE
    ",
    );
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
async fn get_build_item_stats(
    pg_client: &Pool<Postgres>,
    query: BuildItemStatsQuery,
) -> APIResult<Vec<BuildItemStats>> {
    let query = build_query(&query);
    debug!(?query);
    Ok(sqlx::query(&query).fetch_all(pg_client).await.map(|rows| {
        rows.into_iter()
            .map(|row| BuildItemStats {
                item_id: row.get(0),
                builds: row.get(1),
            })
            .collect::<Vec<_>>()
    })?)
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
    description = "
Retrieves item statistics from hero builds.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn build_item_stats(
    Query(query): Query<BuildItemStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_build_item_stats(&state.pg_client, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_build_query_default() {
        let query = BuildItemStatsQuery {
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains(
            "SELECT (mod_element ->> 'ability_id')::bigint AS item_id, COUNT(*) as num_builds"
        ));
        assert!(sql.contains("FROM hero_builds"));
        assert!(sql.contains("WHERE TRUE"));
        assert!(sql.contains("GROUP BY item_id ORDER BY num_builds DESC"));
        // Should not contain any filters
        assert!(!sql.contains("AND hero ="));
        assert!(!sql.contains("AND (data -> 'hero_build' ->> 'last_updated_timestamp')::bigint"));
    }

    #[test]
    fn test_build_query_hero_id() {
        let query = BuildItemStatsQuery {
            hero_id: Some(42),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("AND hero = 42"));
    }

    #[test]
    fn test_build_query_min_last_updated_unix_timestamp() {
        let query = BuildItemStatsQuery {
            min_last_updated_unix_timestamp: Some(1672531200),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains(
            "AND (data -> 'hero_build' ->> 'last_updated_timestamp')::bigint > 1672531200"
        ));
    }

    #[test]
    fn test_build_query_max_last_updated_unix_timestamp() {
        let query = BuildItemStatsQuery {
            max_last_updated_unix_timestamp: Some(1675209599),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains(
            "AND (data -> 'hero_build' ->> 'last_updated_timestamp')::bigint < 1675209599"
        ));
    }

    #[test]
    fn test_build_query_combined_filters() {
        let query = BuildItemStatsQuery {
            hero_id: Some(25),
            min_last_updated_unix_timestamp: Some(1672531200),
            max_last_updated_unix_timestamp: Some(1675209599),
        };
        let sql = build_query(&query);
        assert!(sql.contains("AND hero = 25"));
        assert!(sql.contains(
            "AND (data -> 'hero_build' ->> 'last_updated_timestamp')::bigint > 1672531200"
        ));
        assert!(sql.contains(
            "AND (data -> 'hero_build' ->> 'last_updated_timestamp')::bigint < 1675209599"
        ));
    }

    #[test]
    fn test_build_query_with_default_timestamp() {
        let query = BuildItemStatsQuery {
            hero_id: Some(10),
            min_last_updated_unix_timestamp: default_last_month_timestamp(),
            ..Default::default()
        };
        let sql = build_query(&query);
        assert!(sql.contains("AND hero = 10"));
        // Should contain the default timestamp filter
        assert!(sql.contains("AND (data -> 'hero_build' ->> 'last_updated_timestamp')::bigint >"));
    }
}
