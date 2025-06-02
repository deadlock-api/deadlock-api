use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::RateLimitQuota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tracing::error;
use utoipa::IntoParams;

#[derive(Debug, Deserialize, Serialize, IntoParams)]
pub(super) struct SQLQuery {
    query: String,
}

#[derive(Debug, Deserialize, IntoParams)]
pub(super) struct TableQuery {
    table: String,
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
        .post(format!("{duckdb_url}/query"))
        .json(&query)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await
}

#[cached(
    ty = "TimedCache<u8, Vec<String>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "by_key",
    key = "u8"
)]
async fn fetch_list_tables(
    http_client: &reqwest::Client,
    duckdb_url: String,
) -> reqwest::Result<Vec<String>> {
    http_client
        .get(format!("{duckdb_url}/tables"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await
}

#[cached(
    ty = "TimedCache<String, HashMap<String, String>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{}", table) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn fetch_table_schema(
    http_client: &reqwest::Client,
    duckdb_url: String,
    table: &str,
) -> reqwest::Result<HashMap<String, String>> {
    http_client
        .get(format!("{duckdb_url}/tables/{table}/schema"))
        .send()
        .await?
        .error_for_status()?
        .json()
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
pub(super) async fn sql(
    rate_limit_key: RateLimitKey,
    Query(query): Query<SQLQuery>,
    State(state): State<AppState>,
) -> APIResult<String> {
    let Some(duckdb_url) = state.config.duckdb_url else {
        return Err(APIError::status_msg(
            StatusCode::SERVICE_UNAVAILABLE,
            "DuckDB is not enabled",
        ));
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
            APIError::internal(format!("Failed to execute query: {e}"))
        })
}

#[utoipa::path(
    get,
    path = "/tables",
    responses(
        (status = OK, body = Vec<String>),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["SQL"],
    summary = "List Tables",
    description = "Lists all tables in the database."
)]
pub(super) async fn list_tables(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    let Some(duckdb_url) = state.config.duckdb_url else {
        return Err(APIError::status_msg(
            StatusCode::SERVICE_UNAVAILABLE,
            "DuckDB is not enabled",
        ));
    };

    fetch_list_tables(&state.http_client, duckdb_url)
        .await
        .map_err(|e| {
            error!("Failed to list tables: {e}");
            APIError::internal(format!("Failed to list tables: {e}"))
        })
        .map(Json)
}

#[utoipa::path(
    get,
    params(TableQuery),
    path = "/tables/{table}/schema",
    responses(
        (status = OK, body = HashMap<String, String>),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["SQL"],
    summary = "Table Schema",
    description = "Returns the schema of a table."
)]
pub(super) async fn table_schema(
    Path(TableQuery { table }): Path<TableQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let Some(duckdb_url) = state.config.duckdb_url else {
        return Err(APIError::status_msg(
            StatusCode::SERVICE_UNAVAILABLE,
            "DuckDB is not enabled",
        ));
    };

    fetch_table_schema(&state.http_client, duckdb_url, &table)
        .await
        .map_err(|e| {
            error!("Failed to get table schema: {e}");
            APIError::internal(format!("Failed to get table schema: {e}"))
        })
        .map(Json)
}
