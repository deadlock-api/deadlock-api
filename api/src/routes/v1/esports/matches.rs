use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::esports::types::ESportsMatch;

#[cached(
    ty = "TimedCache<u8, Vec<ESportsMatch>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(10 * 60)) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn fetch_matches(pg_client: &sqlx::Pool<sqlx::Postgres>) -> sqlx::Result<Vec<ESportsMatch>> {
    sqlx::query_as("SELECT * FROM esports_matches")
        .fetch_all(pg_client)
        .await
}

#[utoipa::path(
    get,
    path = "/matches",
    responses(
        (status = OK, body = [ESportsMatch]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Internal server error")
    ),
    tags = ["E-Sports"],
    summary = "List Matches",
    description = "
### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn matches(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    Ok(Json(fetch_matches(&state.pg_client).await?))
}
