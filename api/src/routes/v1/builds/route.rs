use crate::error::{APIError, APIResult};
use crate::routes::v1::builds::query;
use crate::routes::v1::builds::query::BuildsSearchQuery;
use crate::routes::v1::builds::structs::Build;
use crate::state::AppState;
use crate::utils::limiter::{RateLimitQuota, apply_limits};
use axum::Json;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use itertools::Itertools;
use sqlx::Row;
use std::time::Duration;

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
    summary = "Search for builds",
)]
pub async fn search_builds(
    Query(params): Query<BuildsSearchQuery>,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(
        &headers,
        &state,
        "builds",
        &[RateLimitQuota::ip_limit(100, Duration::from_secs(1))],
    )
    .await?;
    let query = query::sql_query(&params);
    let builds = sqlx::query(&query)
        .fetch_all(&state.postgres_client)
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch builds: {e}"),
        })?;
    let builds = builds
        .iter()
        .map(|row| row.get::<sqlx::types::Json<Build>, &str>("builds"))
        .collect::<Vec<_>>();
    let builds = if params.only_latest.unwrap_or(false) {
        builds
            .into_iter()
            .sorted_by_key(|a| a.hero_build.version)
            .rev()
            .unique_by(|a| a.hero_build.hero_build_id)
            .collect()
    } else {
        builds
    };
    Ok(Json(builds))
}
