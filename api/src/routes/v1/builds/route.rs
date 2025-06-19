use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::builds::query;
use crate::routes::v1::builds::query::BuildsSearchQuery;
use crate::routes::v1::builds::structs::Build;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use sqlx::Row;
use tracing::debug;

#[cached(
    ty = "TimedCache<String, Vec<Build>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn fetch_builds(
    pg_client: &sqlx::Pool<sqlx::Postgres>,
    query: &BuildsSearchQuery,
) -> sqlx::Result<Vec<Build>> {
    let query = query::sql_query(query);
    debug!(query);
    Ok(sqlx::query(&query)
        .fetch_all(pg_client)
        .await?
        .iter()
        .map(|row| row.get::<sqlx::types::Json<_>, &str>("builds").0)
        .collect())
}

#[utoipa::path(
    get,
    path = "/",
    params(BuildsSearchQuery),
    responses(
        (status = OK, body = [Build]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Internal server error")
    ),
    tags = ["Builds"],
    summary = "Search",
    description = r#"
Search for builds based on various criteria.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "#
)]
pub(super) async fn search_builds(
    Query(params): Query<BuildsSearchQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(fetch_builds(&state.pg_client, &params).await?))
}
