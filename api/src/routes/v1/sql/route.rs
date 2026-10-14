use core::time::Duration;

use arrow_duckdb::json::writer::{JsonArray, LineDelimited};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;
use tracing::{debug, warn};
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult, LogInternal};
use crate::routes::v1::mcp::{QueryError, write_json};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::json_stream::ResponseFormat;

/// Rows a query returns at most; the rest are cut off and `X-Truncated: true` is set.
const MAX_ROWS: usize = 100_000;

#[derive(Debug, Deserialize, Serialize, IntoParams)]
pub(super) struct SQLQuery {
    /// The SQL query to execute. It must follow the `DuckDB` SQL syntax.
    query: String,
    /// The response format. Valid values: `json` (a JSON array), `ndjson` (newline-delimited JSON objects).
    #[serde(default)]
    #[param(inline)]
    format: ResponseFormat,
}

#[derive(Debug, Deserialize, IntoParams)]
pub(super) struct TableQuery {
    /// The name of the table to fetch the schema for.
    table: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableSchemaRow {
    name: String,
    r#type: String,
    comment: Option<String>,
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
**Deprecated.** Direct SQL access will be removed. Use the public data lake at
https://data.deadlock-api.com (DuckDB / DuckLake, or the MCP server at `/v1/mcp`) instead;
see https://deadlock-api.com/data-dumps.

Executes a read-only `DuckDB` SQL query on the public data lake (hourly parquet snapshots of
the database), the same one the MCP server at `/v1/mcp` queries. Unqualified table names resolve
to its views; filter `match_player` on `match_id` or `start_time` to skip files. At most 100,000
rows are returned (`X-Truncated: true` when cut off), and queries time out after 45 seconds.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 2req/min, 20req/hr |
| Key | 10req/min |
| Global | 30req/min |
    "
)]
#[deprecated(
    note = "use the public data lake at https://data.deadlock-api.com (DuckDB, MCP at /v1/mcp) instead"
)]
pub(super) async fn sql(
    rate_limit_key: RateLimitKey,
    Query(query): Query<SQLQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    check_access(
        &state,
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

    let format = query.format;
    debug!("CUSTOM QUERY: {}", query.query);

    // Interrupts the query when the client disconnects and this handler is dropped.
    let cancel = CancellationToken::new();
    let _cancel_on_drop = cancel.clone().drop_guard();
    let catalog = std::sync::Arc::clone(&state.mcp_catalog);
    let output = tokio::spawn(async move { catalog.query(query.query, MAX_ROWS, cancel).await })
        .await
        .log_internal("SQL query task failed", "Query execution failed")?
        .map_err(|e| query_error(&e))?;

    let body = match format {
        ResponseFormat::Json => write_json::<JsonArray>(&output.batches),
        ResponseFormat::Ndjson => write_json::<LineDelimited>(&output.batches),
    }
    .map_err(|e| {
        APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("{e}. Cast the column to a supported type, e.g. `col::VARCHAR` or `col::JSON`"),
        )
    })?;
    Ok((
        [
            (header::CONTENT_TYPE, format.content_type()),
            (
                header::HeaderName::from_static("x-truncated"),
                if output.truncated { "true" } else { "false" },
            ),
        ],
        body,
    ))
}

/// Maps a failed query to a response: the caller's mistakes to 400 with `DuckDB`'s message,
/// server failures to 500 without their details.
fn query_error(error: &QueryError) -> APIError {
    let status = match *error {
        QueryError::NotReady | QueryError::Busy => StatusCode::SERVICE_UNAVAILABLE,
        QueryError::Timeout => StatusCode::GATEWAY_TIMEOUT,
        QueryError::Cancelled | QueryError::Internal(_) => {
            warn!("Failed to execute query: {error}");
            return APIError::internal("Query execution failed");
        }
        QueryError::NotReadOnly | QueryError::MultipleStatements | QueryError::DuckDb(_) => {
            StatusCode::BAD_REQUEST
        }
    };
    APIError::status_msg(status, error.to_string())
}

/// Rejects the request unless custom queries are enabled, then applies `quotas`.
async fn check_access(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    bucket: &str,
    quotas: &[Quota],
) -> APIResult<()> {
    if !state.config.clickhouse.allow_custom_queries {
        return Err(APIError::status_msg(
            StatusCode::FORBIDDEN,
            "Custom queries are disabled",
        ));
    }
    state
        .rate_limit_client
        .apply_limits(rate_limit_key, bucket, quotas)
        .await?;
    Ok(())
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
**Deprecated.** Direct SQL access will be removed. Use the public data lake at
https://data.deadlock-api.com (DuckDB / DuckLake, or the MCP server at `/v1/mcp`) instead;
see https://deadlock-api.com/data-dumps.

Lists all tables of the public data lake.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/min |
| Key | - |
| Global | 60req/min |
    "
)]
#[deprecated(
    note = "use the public data lake at https://data.deadlock-api.com (DuckDB, MCP at /v1/mcp) instead"
)]
pub(super) async fn list_tables(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    check_access(
        &state,
        &rate_limit_key,
        "sql_list_tables",
        &[
            Quota::ip_limit(10, Duration::from_mins(1)),
            Quota::global_limit(60, Duration::from_mins(1)),
        ],
    )
    .await?;

    let snapshot = state
        .mcp_catalog
        .snapshot()
        .ok_or_else(|| query_error(&QueryError::NotReady))?;
    Ok(Json(snapshot.tables.keys().cloned().collect::<Vec<_>>()))
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
**Deprecated.** Direct SQL access will be removed. Use the public data lake at
https://data.deadlock-api.com (DuckDB / DuckLake, or the MCP server at `/v1/mcp`) instead;
see https://deadlock-api.com/data-dumps.

Returns the columns of a data lake table with their `DuckDB` types; column comments carry the
original `ClickHouse` type.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/min |
| Key | - |
| Global | 60req/min |
    "
)]
#[deprecated(
    note = "use the public data lake at https://data.deadlock-api.com (DuckDB, MCP at /v1/mcp) instead"
)]
pub(super) async fn table_schema(
    rate_limit_key: RateLimitKey,
    Path(TableQuery { table }): Path<TableQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    check_access(
        &state,
        &rate_limit_key,
        "sql_table_schema",
        &[
            Quota::ip_limit(10, Duration::from_mins(1)),
            Quota::global_limit(60, Duration::from_mins(1)),
        ],
    )
    .await?;

    let snapshot = state
        .mcp_catalog
        .snapshot()
        .ok_or_else(|| query_error(&QueryError::NotReady))?;
    let info = snapshot
        .tables
        .get(&table)
        .ok_or_else(|| APIError::status_msg(StatusCode::NOT_FOUND, "Table not found"))?;
    Ok(Json(
        info.columns
            .iter()
            .map(|c| TableSchemaRow {
                name: c.name.clone(),
                r#type: c.data_type.clone(),
                comment: c.comment.clone(),
            })
            .collect::<Vec<_>>(),
    ))
}
