use std::sync::{Arc, LazyLock};

use rmcp::ServerHandler;
use rmcp::handler::server::tool::parse_json_object;
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, ErrorData,
    Implementation, JsonObject, ListToolsResult, PaginatedRequestParams, ServerCapabilities,
    ServerInfo, Tool, ToolAnnotations, object,
};
use rmcp::service::{RequestContext, RoleServer};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tracing::{debug, warn};

use super::catalog::{DATABASE, QueryError, SCHEMA, SnapshotCatalog};
use super::format::format_query_output;

const INSTRUCTIONS: &str = "\
Read-only SQL access to hourly parquet snapshots of the Deadlock API database (https://deadlock-api.com).

- Database `deadlock`, schema `main`; unqualified table names resolve there.
- Engine: DuckDB (DuckDB SQL dialect). The database is attached read-only: CREATE, INSERT, UPDATE, DELETE, DROP, SET and extension loading fail.
- Results are capped at 1,024 rows and 50 KB per query; queries time out after 300 seconds.
- Table comments carry the ClickHouse engine, partition and ordering keys; column comments carry the original ClickHouse type.
- `match_player` and the `player_match_*` tables hold hundreds of gigabytes: always filter on their ordering columns (`match_id`, `account_id`, `start_time`), select only needed columns and use LIMIT.
- Schema exploration: `SHOW TABLES`, `DESCRIBE match_player`, `SUMMARIZE heroes`, `duckdb_columns()`.
- DuckDB extras: `SELECT * EXCLUDE (col)`, `GROUP BY ALL`, `QUALIFY`, `arg_max(x, y)`, list/struct literals, `strftime`/`date_trunc`.";

pub(super) struct McpServer {
    pub(super) catalog: Arc<SnapshotCatalog>,
}

impl ServerHandler for McpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(
                Implementation::new("deadlock-api", env!("CARGO_PKG_VERSION"))
                    .with_title("Deadlock API")
                    .with_website_url("https://deadlock-api.com"),
            )
            .with_instructions(INSTRUCTIONS)
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult::with_all_items(TOOLS.clone()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let args = request.arguments.unwrap_or_default();
        let result = match request.name.as_ref() {
            "execute_query" => {
                let ExecuteQueryArgs { sql } = parse_json_object(args)?;
                self.execute_query(sql).await
            }
            "list_databases" => list_databases(),
            "list_tables" => self.list_tables(parse_json_object(args)?),
            "list_columns" => self.list_columns(parse_json_object(args)?),
            other => {
                CallToolResult::error(vec![ContentBlock::text(format!("Unknown tool: '{other}'"))])
            }
        };
        Ok(result.into())
    }
}

#[derive(Deserialize)]
struct ExecuteQueryArgs {
    sql: String,
}

#[derive(Deserialize)]
struct ListTablesArgs {
    database: Option<String>,
    schema: Option<String>,
}

#[derive(Deserialize)]
struct ListColumnsArgs {
    table: String,
    database: Option<String>,
    schema: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolError {
    success: bool,
    error: String,
    error_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NotFound {
    success: bool,
    database: String,
    schema: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    table: Option<String>,
    error: String,
    error_type: &'static str,
}

#[derive(Clone, Copy)]
enum Missing {
    Database,
    Schema,
    Table,
}

impl McpServer {
    async fn execute_query(&self, sql: String) -> CallToolResult {
        debug!("MCP QUERY: {sql}");
        match self.catalog.query(sql).await {
            Ok(output) => match format_query_output(&output) {
                Ok(result) => success(&result),
                Err(e) => query_error(e.to_string(), "SerializationError".to_owned()),
            },
            Err(e) => {
                warn!("MCP query failed: {e}");
                let (error, error_type) = describe_query_error(&e);
                query_error(error, error_type)
            }
        }
    }

    fn list_tables(&self, args: ListTablesArgs) -> CallToolResult {
        let database = args.database.unwrap_or_else(|| DATABASE.to_owned());
        let schema = args.schema.unwrap_or_else(|| "all".to_owned());
        if let Some(missing) = missing_scope(&database, &schema, true) {
            return not_found(missing, database, schema, None);
        }
        let Some(snapshot) = self.catalog.snapshot() else {
            return not_ready();
        };
        let tables: Vec<_> = snapshot
            .tables
            .iter()
            .map(|(name, info)| {
                json!({ "schema": SCHEMA, "name": name, "type": "view", "comment": info.comment })
            })
            .collect();
        success(&json!({
            "success": true,
            "database": database,
            "schema": schema,
            "tables": tables,
            "tableCount": 0,
            "viewCount": snapshot.tables.len(),
        }))
    }

    fn list_columns(&self, args: ListColumnsArgs) -> CallToolResult {
        let database = args.database.unwrap_or_else(|| DATABASE.to_owned());
        let schema = args.schema.unwrap_or_else(|| SCHEMA.to_owned());
        if let Some(missing) = missing_scope(&database, &schema, false) {
            return not_found(missing, database, schema, Some(args.table));
        }
        let Some(snapshot) = self.catalog.snapshot() else {
            return not_ready();
        };
        let Some(info) = snapshot.tables.get(&args.table) else {
            return not_found(Missing::Table, database, schema, Some(args.table));
        };
        let columns: Vec<_> = info
            .columns
            .iter()
            .map(|column| {
                json!({
                    "name": column.name,
                    "type": column.data_type,
                    "nullable": column.nullable,
                    "comment": column.comment,
                })
            })
            .collect();
        success(&json!({
            "success": true,
            "database": database,
            "schema": schema,
            "table": args.table,
            "objectType": "view",
            "columns": columns,
            "columnCount": info.columns.len(),
        }))
    }
}

fn list_databases() -> CallToolResult {
    success(&json!({
        "success": true,
        "databases": [{ "name": DATABASE, "type": "duckdb" }],
        "databaseCount": 1,
    }))
}

fn missing_scope(database: &str, schema: &str, allow_all_schemas: bool) -> Option<Missing> {
    if database != DATABASE {
        Some(Missing::Database)
    } else if schema != SCHEMA && !(allow_all_schemas && schema == "all") {
        Some(Missing::Schema)
    } else {
        None
    }
}

fn pretty(value: &impl Serialize) -> String {
    serde_json::to_string_pretty(value).unwrap_or_default()
}

fn success(value: &impl Serialize) -> CallToolResult {
    let text = pretty(value);
    let mut result = CallToolResult::success(vec![ContentBlock::text(text.clone())]);
    result.structured_content = Some(json!({ "result": text }));
    result
}

fn query_error(error: String, error_type: String) -> CallToolResult {
    let text = pretty(&ToolError {
        success: false,
        error,
        error_type,
    });
    CallToolResult::error(vec![ContentBlock::text(format!(
        "Error calling tool 'execute_query': {text}"
    ))])
}

fn not_ready() -> CallToolResult {
    success(&ToolError {
        success: false,
        error: QueryError::NotReady.to_string(),
        error_type: "NotReadyError".to_owned(),
    })
}

fn not_found(
    missing: Missing,
    database: String,
    schema: String,
    table: Option<String>,
) -> CallToolResult {
    let error = match missing {
        Missing::Database => format!("Database not found: {database}"),
        Missing::Schema => format!("Schema not found: {database}.{schema}"),
        Missing::Table => format!(
            "Table or view not found: {database}.{schema}.{}",
            table.as_deref().unwrap_or_default()
        ),
    };
    success(&NotFound {
        success: false,
        database,
        schema,
        table,
        error,
        error_type: "NotFoundError",
    })
}

/// `DuckDB` prefixes messages with their exception class ("Catalog Error: ..."), which the
/// previous server exposed as `errorType` (`CatalogException`).
fn describe_query_error(error: &QueryError) -> (String, String) {
    let QueryError::DuckDb(duckdb::Error::DuckDBFailure(_, Some(message))) = error else {
        let error_type = match error {
            QueryError::NotReady => "NotReadyError",
            QueryError::Timeout => "TimeoutError",
            QueryError::Cancelled => "CancelledError",
            QueryError::DuckDb(_) => "DuckDBError",
        };
        return (error.to_string(), error_type.to_owned());
    };
    let error_type = message
        .split_once(':')
        .map(|(prefix, _)| prefix.trim())
        .filter(|prefix| prefix.len() < 40 && prefix.ends_with(" Error"))
        .map_or_else(
            || "DuckDBError".to_owned(),
            |prefix| {
                let class = prefix.trim_end_matches(" Error").replace(' ', "");
                format!("{class}Exception")
            },
        );
    (message.clone(), error_type)
}

fn optional_string(description: &str) -> Value {
    json!({
        "anyOf": [{ "type": "string" }, { "type": "null" }],
        "default": null,
        "description": description
    })
}

static TOOLS: LazyLock<Vec<Tool>> = LazyLock::new(|| {
    let output_schema: Arc<JsonObject> = Arc::new(object(json!({
        "properties": { "result": { "type": "string" } },
        "required": ["result"],
        "type": "object"
    })));
    let read_only = ToolAnnotations::default()
        .read_only(true)
        .destructive(false)
        .open_world(false);
    [
        Tool::new(
            "execute_query",
            "Execute a read-only SQL query on the Deadlock database (hourly parquet snapshots of the ClickHouse tables). Unqualified table names resolve to the `deadlock` database and `main` schema automatically. Results are limited to 1,024 rows and 50 KB.",
            object(json!({
                "properties": {
                    "sql": { "type": "string", "description": "SQL query to execute (DuckDB SQL dialect)" }
                },
                "required": ["sql"],
                "type": "object",
                "additionalProperties": false
            })),
        )
        .with_title("Execute Query"),
        Tool::new(
            "list_databases",
            "List all databases available in the connection.",
            object(json!({
                "properties": {},
                "type": "object",
                "additionalProperties": false
            })),
        )
        .with_title("List Databases"),
        Tool::new(
            "list_tables",
            "List all tables and views in a database with their comments. If database is not specified, uses the current database.",
            object(json!({
                "properties": {
                    "database": optional_string("Database name to list tables from (defaults to current database)"),
                    "schema": optional_string("Optional schema name to filter by")
                },
                "type": "object",
                "additionalProperties": false
            })),
        )
        .with_title("List Tables"),
        Tool::new(
            "list_columns",
            "List all columns of a table or view with their types and comments. If database/schema are not specified, uses the current database/schema.",
            object(json!({
                "properties": {
                    "table": { "type": "string", "description": "Table or view name" },
                    "database": optional_string("Database name (defaults to current database)"),
                    "schema": optional_string("Schema name (defaults to current schema)")
                },
                "required": ["table"],
                "type": "object",
                "additionalProperties": false
            })),
        )
        .with_title("List Columns"),
    ]
    .into_iter()
    .map(|tool| {
        tool.with_raw_output_schema(Arc::clone(&output_schema))
            .annotate(read_only.clone())
    })
    .collect()
});
