use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::RateLimitQuota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::error;
use utoipa::IntoParams;

#[derive(Debug, Deserialize, Serialize, IntoParams)]
pub struct SQLQuery {
    pub query: String,
}

#[cached(
    ty = "TimedCache<String, String>",
    create = "{ TimedCache::with_lifespan(10 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn call_duckdb(
    http_client: &reqwest::Client,
    duckdb_url: String,
    query: &SQLQuery,
) -> reqwest::Result<String> {
    http_client
        .post(format!("{}/query", duckdb_url))
        .json(&query)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await
}

#[utoipa::path(
    get,
    path = "/",
    params(SQLQuery),
    responses(
        (status = OK, body = String),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["SQL"],
    summary = "SQL Query",
    description = "Executes a SQL query on the database."
)]
pub async fn sql(
    rate_limit_key: RateLimitKey,
    Query(query): Query<SQLQuery>,
    State(state): State<AppState>,
) -> APIResult<String> {
    let Some(duckdb_url) = state.config.duckdb_url else {
        return Err(APIError::StatusMsg {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: "DuckDB is not enabled".to_string(),
        });
    };

    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "sql",
            &[
                RateLimitQuota::ip_limit(10, Duration::from_secs(60)),
                RateLimitQuota::global_limit(100, Duration::from_secs(60)),
            ],
        )
        .await?;

    call_duckdb(&state.http_client, duckdb_url, &query)
        .await
        .map_err(|e| {
            error!("Failed to execute query: {e}");
            APIError::InternalError {
                message: format!("Failed to execute query: {e}"),
            }
        })
}
