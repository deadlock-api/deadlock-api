use core::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::query::BytesCursor;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, Lines};
use tracing::{debug, error, warn};
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[derive(Debug, Deserialize, Serialize, IntoParams)]
pub(super) struct SQLQuery {
    /// The SQL query to execute. It must follow the Clickhouse SQL syntax.
    query: String,
}

#[derive(Debug, Deserialize, IntoParams)]
pub(super) struct TableQuery {
    /// The name of the table to fetch the schema for.
    table: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, clickhouse::Row)]
pub struct TableSchemaRow {
    name: String,
    r#type: String,
    comment: Option<String>,
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
    description = "
Executes a SQL query on the database.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 300req/5min |
| Key | 300req/5min |
| Global | 600req/60s |
    "
)]
pub(super) async fn sql(
    rate_limit_key: RateLimitKey,
    Query(query): Query<SQLQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if !state.config.clickhouse.allow_custom_queries {
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
                Quota::ip_limit(5, Duration::from_secs(60)),
                Quota::ip_limit(50, Duration::from_secs(60 * 60)),
                Quota::key_limit(10, Duration::from_secs(60)),
                Quota::global_limit(30, Duration::from_secs(60)),
            ],
        )
        .await?;

    let query = query.query;
    let query = query.trim().replace(';', "");
    debug!("CUSTOM QUERY: {query}");

    run_sql(&state.ch_client_restricted, &query)
        .await
        .map(Json)
        .map_err(|sql_error| {
            warn!("Failed to execute query: {sql_error}");
            let error_message = match Regex::new(r"version [\d.]+") {
                Ok(r) => r
                    .replace_all(&sql_error.to_string(), "version [REDACTED]")
                    .to_string(),
                Err(regex_error) => {
                    error!("Failed to create regex for redacting version: {regex_error}");
                    sql_error.to_string()
                }
            };
            APIError::internal(error_message)
        })
}

async fn run_sql(
    ch_client: &clickhouse::Client,
    query: &str,
) -> Result<Vec<serde_json::Value>, SQLQueryError> {
    let mut lines: Lines<BytesCursor> = ch_client
        .query(query)
        .fetch_bytes("JSONEachRow")
        .map(AsyncBufReadExt::lines)?;
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
    description = "
Lists all tables in the database.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn list_tables(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    if !state.config.clickhouse.allow_custom_queries {
        return Err(APIError::status_msg(
            StatusCode::FORBIDDEN,
            "Custom queries are disabled",
        ));
    }

    Ok(Json(fetch_list_tables(&state.ch_client_restricted).await?))
}

#[cached(
    ty = "TimedCache<u8, Vec<String>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60 * 60)) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn fetch_list_tables(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<Vec<String>> {
    ch_client
        .query(
            "
            SELECT name
            FROM system.tables
            WHERE database = 'default'
                AND name NOT LIKE '%inner%'
                AND engine != 'MaterializedView'
        ",
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
    description = "
Returns the schema of a table.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn table_schema(
    Path(TableQuery { table }): Path<TableQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if !state.config.clickhouse.allow_custom_queries {
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
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60 * 60)) }",
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
            "
            SELECT name, type, nullIf(comment, '') AS comment
            FROM system.columns
            WHERE database = 'default' AND table = ?
        ",
        )
        .bind(table)
        .fetch_all()
        .await
}
