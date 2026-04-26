use core::time::Duration;
use std::sync::LazyLock;

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
use tracing::{debug, warn};
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

static SYSTEM_TABLE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bsystem\s*\.\s*\w+").unwrap());

static BLOCKED_FUNCTION_RE: LazyLock<Regex> = LazyLock::new(|| {
    // Matches dangerous ClickHouse table functions with optional whitespace before '('
    Regex::new(
        r"(?i)\b(url|file|remote|remoteSecure|input|cluster|clusterAllReplicas|mysql|postgresql|s3|s3Cluster|hdfs|jdbc|odbc|executable|mongo|sqlite|azureBlobStorage)\s*\(",
    )
    .unwrap()
});

static BLOCK_COMMENT_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"/\*[\s\S]*?\*/").unwrap());

static LINE_COMMENT_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"--[^\n]*").unwrap());

static INTO_OUTFILE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bINTO\s+OUTFILE\b").unwrap());

/// Normalizes a SQL query by stripping comments and collapsing whitespace.
/// The normalized form is used both for validation AND sent to `ClickHouse`,
/// ensuring no divergence between what we validate and what executes.
fn normalize_query(query: &str) -> String {
    let without_block = BLOCK_COMMENT_RE.replace_all(query, " ");
    let without_line = LINE_COMMENT_RE.replace_all(&without_block, " ");
    without_line
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Validates that a user-supplied SQL query is safe to execute.
fn validate_query(query: &str) -> Result<(), &'static str> {
    if query.is_empty() {
        return Err("Query cannot be empty");
    }

    // Must start with SELECT or WITH (for CTEs)
    let upper = query.to_uppercase();
    if !upper.starts_with("SELECT") && !upper.starts_with("WITH") {
        return Err("Only SELECT queries are allowed");
    }

    if SYSTEM_TABLE_RE.is_match(query) {
        return Err("Access to system tables is not allowed");
    }

    if BLOCKED_FUNCTION_RE.is_match(query) {
        return Err("Query contains a blocked function");
    }

    if INTO_OUTFILE_RE.is_match(query) {
        return Err("INTO OUTFILE is not allowed");
    }

    Ok(())
}

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
| IP | 2req/min, 20req/hr |
| Key | 10req/min |
| Global | 30req/min |
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
                Quota::ip_limit(2, Duration::from_mins(1)),
                Quota::ip_limit(20, Duration::from_hours(1)),
                Quota::key_limit(10, Duration::from_mins(1)),
                Quota::global_limit(30, Duration::from_mins(1)),
            ],
        )
        .await?;

    let query = query.query;
    let query = query.trim().replace(';', "");
    let query = normalize_query(&query);

    validate_query(&query).map_err(|msg| APIError::status_msg(StatusCode::BAD_REQUEST, msg))?;

    debug!("CUSTOM QUERY: {query}");

    run_sql(&state.ch_client_restricted, &query)
        .await
        .map(Json)
        .map_err(|sql_error| {
            warn!("Failed to execute query: {sql_error}");
            APIError::status_msg(
                StatusCode::BAD_REQUEST,
                "Query execution failed. Check your SQL syntax and try again.",
            )
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
| IP | 10req/min |
| Key | - |
| Global | 60req/min |
    "
)]
pub(super) async fn list_tables(
    rate_limit_key: RateLimitKey,
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
            "sql_list_tables",
            &[
                Quota::ip_limit(10, Duration::from_mins(1)),
                Quota::global_limit(60, Duration::from_mins(1)),
            ],
        )
        .await?;

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
            SETTINGS log_comment = 'sql_list_tables'
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
| IP | 10req/min |
| Key | - |
| Global | 60req/min |
    "
)]
pub(super) async fn table_schema(
    rate_limit_key: RateLimitKey,
    Path(TableQuery { table }): Path<TableQuery>,
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
            "sql_table_schema",
            &[
                Quota::ip_limit(10, Duration::from_mins(1)),
                Quota::global_limit(60, Duration::from_mins(1)),
            ],
        )
        .await?;

    // Validate table name: only alphanumeric and underscores allowed
    if !table.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Invalid table name",
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
    convert = r#"{ format!("{table}") }"#,
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
            SETTINGS log_comment = 'sql_table_schema'
        ",
        )
        .bind(table)
        .fetch_all()
        .await
}
