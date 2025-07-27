use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::esports::types::ESportsMatch;

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
