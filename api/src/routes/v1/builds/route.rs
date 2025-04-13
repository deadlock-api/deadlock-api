use crate::error::{APIError, APIResult};
use crate::routes::v1::builds::query;
use crate::routes::v1::builds::query::{
    BuildsSearchQuery, BuildsSearchQuerySortBy, BuildsSearchQuerySortDirection,
};
use crate::routes::v1::builds::structs::Build;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use itertools::Itertools;
use sqlx::Row;

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
    description = "Search for builds based on various criteria."
)]
pub async fn search_builds(
    Query(params): Query<BuildsSearchQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let query = query::sql_query(&params);
    let builds = sqlx::query(&query)
        .fetch_all(&state.pg_client)
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
            .sorted_by_key(|build| {
                let direction = if params.sort_direction == BuildsSearchQuerySortDirection::Desc {
                    -1
                } else {
                    1
                };
                let key = match params.sort_by {
                    BuildsSearchQuerySortBy::WeeklyFavorites => build.num_weekly_favorites,
                    BuildsSearchQuerySortBy::Favorites => build.num_favorites,
                    BuildsSearchQuerySortBy::Ignores => build.num_ignores,
                    BuildsSearchQuerySortBy::Reports => build.num_reports,
                    BuildsSearchQuerySortBy::Version => build.hero_build.version.into(),
                    BuildsSearchQuerySortBy::UpdatedAt => {
                        (build.hero_build.last_updated_timestamp as u32).into()
                    }
                }
                .unwrap_or_default() as i64;
                direction * key
            })
            .collect()
    } else {
        builds
    };
    Ok(Json(builds))
}
