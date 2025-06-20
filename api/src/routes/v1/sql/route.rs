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
use clickhouse::query::BytesCursor;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, Lines};
use tracing::{debug, error};
use utoipa::IntoParams;

#[derive(Debug, Deserialize, Serialize, IntoParams)]
pub(super) struct SQLQuery {
    query: String,
}

#[derive(Debug, Deserialize, IntoParams)]
pub(super) struct TableQuery {
    table: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, clickhouse::Row)]
pub struct TableSchemaRow {
    pub name: String,
    pub r#type: String,
}

#[derive(thiserror::Error, Debug)]
enum SQLQueryError {
    #[error("Failed to execute query: {0}")]
    Query(#[from] clickhouse::error::Error),
    #[error("Failed to parse query result: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("Failed to read query result: {0}")]
    Read(#[from] tokio::io::Error),
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
    summary = "Query",
    description = r#"
Executes a SQL query on the database.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/10s |
| Key | 10req/10s |
| Global | 100req/10s |
    "#
)]
pub(super) async fn sql(
    rate_limit_key: RateLimitKey,
    Query(query): Query<SQLQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if !state.config.allow_custom_queries {
        return Err(APIError::status_msg(
            StatusCode::FORBIDDEN,
            "Custom queries are disabled",
        ));
    }

    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "sql",
            &[
                RateLimitQuota::ip_limit(10, Duration::from_secs(10)),
                RateLimitQuota::key_limit(10, Duration::from_secs(10)),
                RateLimitQuota::global_limit(100, Duration::from_secs(10)),
            ],
        )
        .await?;

    let query = query.query;
    let query = query.trim().replace(";", "");
    debug!("CUSTOM QUERY: {query}");

    run_sql(&state.ch_client_restricted, &query)
        .await
        .map(Json)
        .map_err(|e| {
            error!("Failed to execute query: {e}");
            APIError::internal(format!("Failed to execute query: {e}"))
        })
}

#[cached(
    ty = "TimedCache<String, Vec<serde_json::Value>>",
    create = "{ TimedCache::with_lifespan(10 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn run_sql(
    ch_client: &clickhouse::Client,
    query: &str,
) -> Result<Vec<serde_json::Value>, SQLQueryError> {
    let mut lines: Lines<BytesCursor> = ch_client
        .query(query)
        .fetch_bytes("JSONEachRow")
        .map(|m| m.lines())?;
    let mut parsed_result: Vec<serde_json::Value> = vec![];
    while let Some(line) = lines.next_line().await? {
        let value: serde_json::Value = serde_json::de::from_str(&line)?;
        parsed_result.push(value);
    }
    Ok(parsed_result)
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
    description = r#"
Lists all tables in the database.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "#
)]
pub(super) async fn list_tables(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    if !state.config.allow_custom_queries {
        return Err(APIError::status_msg(
            StatusCode::FORBIDDEN,
            "Custom queries are disabled",
        ));
    }

    Ok(Json(fetch_list_tables(&state.ch_client_restricted).await?))
}

#[cached(
    ty = "TimedCache<u8, Vec<String>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn fetch_list_tables(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<Vec<String>> {
    ch_client
        .query(
            r#"
            SELECT name
            FROM system.tables
            WHERE database = 'default'
                AND name NOT LIKE '%inner%'
                AND engine != 'MaterializedView'
        "#,
        )
        .fetch_all::<String>()
        .await
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
    description = r#"
Returns the schema of a table.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "#
)]
pub(super) async fn table_schema(
    Path(TableQuery { table }): Path<TableQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if !state.config.allow_custom_queries {
        return Err(APIError::status_msg(
            StatusCode::FORBIDDEN,
            "Custom queries are disabled",
        ));
    }

    Ok(Json(
        fetch_table_schema(&state.ch_client_restricted, &table).await?,
    ))
}

#[cached(
    ty = "TimedCache<String, Vec<TableSchemaRow>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{}", table) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn fetch_table_schema(
    ch_client: &clickhouse::Client,
    table: &str,
) -> clickhouse::error::Result<Vec<TableSchemaRow>> {
    ch_client
        .query(
            r#"
            SELECT name, type
            FROM system.columns
            WHERE database = 'default' AND table = ?
        "#,
        )
        .bind(table)
        .fetch_all()
        .await
}
