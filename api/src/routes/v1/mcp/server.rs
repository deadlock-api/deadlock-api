use std::sync::{Arc, LazyLock};

use rmcp::ServerHandler;
use rmcp::handler::server::tool::parse_json_object;
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, ErrorData,
    Implementation, JsonObject, ListToolsResult, PaginatedRequestParams, ServerCapabilities,
    ServerConfig, Tool, ToolAnnotations, object,
};
use rmcp::service::{RequestContext, RoleServer};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tracing::{Instrument, debug, info_span, warn};

use super::catalog::{DATABASE, QueryError, SCHEMA, SnapshotCatalog};
use super::format::format_query_output;
use crate::services::assets::client::AssetsClient;
use crate::services::assets::versions::items::Item;
use crate::services::assets::versions::items::types::ItemType;

const INSTRUCTIONS: &str = "\
Read-only SQL access to hourly parquet snapshots of the Deadlock API database (https://deadlock-api.com).

- Database `deadlock`, schema `main`; unqualified table names resolve there.
- Engine: DuckDB (DuckDB SQL dialect). The database is attached read-only: CREATE, INSERT, UPDATE, DELETE, DROP, SET and extension loading fail.
- Results are capped at 1,024 rows and 50 KB per query; queries time out after 45 seconds.
- Column comments carry the original ClickHouse type. Table comments say how the table is exported.
- Only read queries run: SELECT, WITH, FROM, DESCRIBE, SHOW, SUMMARIZE.
- `match_player` holds hundreds of gigabytes in parquet files split by `match_id` range. Filters on `match_id` or `start_time` skip whole files and are fast; a filter on `account_id` alone has to scan everything and is slow, so combine it with a `start_time` range. Select only needed columns and use LIMIT.
- Only `match_id` and `start_time` skip files. Filters on other columns (`match_mode`, `game_mode`, `hero_id`, ...) still read every file, so always add a `start_time` range (e.g. the last 7 days) to queries over `match_player` or `match_player_latest`, even for a plain `min`/`max`.
- `match_player` is exported incrementally, so up to ~2% of rows can appear twice with different `created_at`. `match_player_latest` keeps only the newest row per (`match_id`, `account_id`), which costs extra work; prefer it when counts matter, and `match_player` for ranges and rough aggregates.
- Schema exploration: `SHOW TABLES`, `DESCRIBE match_player`, `SUMMARIZE match_salts`, `duckdb_columns()`.
- DuckDB extras: `SELECT * EXCLUDE (col)`, `GROUP BY ALL`, `QUALIFY`, `arg_max(x, y)`, list/struct literals, `strftime`/`date_trunc`.
- Heroes and items (abilities, weapons, shop upgrades) are stored as numeric ids. `list_heroes` and `list_items` map them to names; pass an `id` to get the full details of one hero or item.";

pub(super) struct McpServer {
    pub(super) catalog: Arc<SnapshotCatalog>,
    pub(super) assets: AssetsClient,
}

impl ServerHandler for McpServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
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
        // Child span of the HTTP request span: the tool name is the only thing that
        // distinguishes one `POST /v1/mcp` from another, since the JSON-RPC body never
        // reaches the HTTP layer.
        let span = info_span!("mcp.call_tool", mcp.tool.name = %request.name);
        async move {
            let args = request.arguments.unwrap_or_default();
            let result = match request.name.as_ref() {
                "execute_query" => {
                    let ExecuteQueryArgs { sql } = parse_json_object(args)?;
                    self.execute_query(sql).await
                }
                "list_databases" => list_databases(),
                "list_tables" => self.list_tables(parse_json_object(args)?),
                "list_columns" => self.list_columns(parse_json_object(args)?),
                "list_heroes" => self.list_heroes(parse_json_object(args)?).await,
                "list_items" => self.list_items(parse_json_object(args)?).await,
                other => CallToolResult::error(vec![ContentBlock::text(format!(
                    "Unknown tool: '{other}'"
                ))]),
            };
            Ok(result.into())
        }
        .instrument(span)
        .await
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

#[derive(Deserialize)]
struct ListHeroesArgs {
    id: Option<u32>,
}

#[derive(Deserialize)]
struct ListItemsArgs {
    r#type: Option<ItemType>,
    id: Option<u32>,
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

    async fn list_heroes(&self, args: ListHeroesArgs) -> CallToolResult {
        let heroes = match self.assets.heroes().await {
            Ok(heroes) => heroes,
            Err(e) => return assets_error("list_heroes", &e),
        };
        if let Some(id) = args.id {
            return match heroes.iter().find(|h| h.id == id) {
                Some(hero) => success(hero),
                None => lookup_not_found(format!("Hero not found: {id}")),
            };
        }
        let heroes: Vec<_> = heroes
            .iter()
            .map(|h| {
                json!({
                    "id": h.id,
                    "name": h.name,
                    "className": h.class_name,
                    "playerSelectable": h.player_selectable,
                    "developmentState": h.development_state,
                    "disabled": h.disabled,
                })
            })
            .collect();
        success(&json!({ "success": true, "heroCount": heroes.len(), "heroes": heroes }))
    }

    async fn list_items(&self, args: ListItemsArgs) -> CallToolResult {
        let items = match self.assets.items().await {
            Ok(items) => items,
            Err(e) => return assets_error("list_items", &e),
        };
        if let Some(id) = args.id {
            return match items.iter().find(|i| i.id() == id) {
                Some(item) => success(item),
                None => lookup_not_found(format!("Item not found: {id}")),
            };
        }
        let Some(item_type) = args.r#type else {
            return lookup_not_found(
                "Pass `type` (ability, weapon or upgrade) to list items, or `id` for one item"
                    .to_owned(),
            );
        };
        let items: Vec<_> = items
            .iter()
            .filter(|i| i.item_type() == item_type)
            .map(item_summary)
            .collect();
        success(&json!({ "success": true, "itemCount": items.len(), "items": items }))
    }
}

fn item_summary(item: &Item) -> Value {
    let (name, class_name) = match item {
        Item::Ability(a) => (&a.name, &a.class_name),
        Item::Weapon(w) => (&w.name, &w.class_name),
        Item::Upgrade(u) => (&u.name, &u.class_name),
    };
    let mut summary = json!({ "id": item.id() });
    // Internal items have no localized name; it falls back to the class name.
    if name != class_name {
        summary["name"] = json!(name);
    }
    summary["className"] = json!(class_name);
    match item {
        Item::Ability(a) => summary["heroes"] = json!(a.heroes),
        Item::Weapon(w) => summary["heroes"] = json!(w.heroes),
        Item::Upgrade(u) => {
            summary["slot"] = json!(u.item_slot_type);
            summary["tier"] = json!(u.item_tier);
            summary["cost"] = json!(u.cost);
            summary["shopable"] = json!(u.shopable);
        }
    }
    summary
}

fn assets_error(tool: &str, error: &impl core::fmt::Display) -> CallToolResult {
    warn!("MCP {tool} failed: {error}");
    CallToolResult::error(vec![ContentBlock::text(format!(
        "Error calling tool '{tool}': failed to load game assets: {error}"
    ))])
}

fn lookup_not_found(error: String) -> CallToolResult {
    success(&ToolError {
        success: false,
        error,
        error_type: "NotFoundError".to_owned(),
    })
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

/// Every tool result is TOON (<https://toonformat.dev>): the same data model as JSON, with
/// arrays of uniform objects written as one header plus CSV-like rows, which costs clients
/// far fewer tokens than JSON.
pub(super) fn toon(value: &impl Serialize) -> String {
    toon_format::encode_default(value).unwrap_or_default()
}

fn success(value: &impl Serialize) -> CallToolResult {
    let text = toon(value);
    let mut result = CallToolResult::success(vec![ContentBlock::text(text.clone())]);
    result.structured_content = Some(json!({ "result": text }));
    result
}

fn query_error(error: String, error_type: String) -> CallToolResult {
    let text = toon(&ToolError {
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
            QueryError::Busy => "BusyError",
            QueryError::Cancelled => "CancelledError",
            QueryError::NotReadOnly => "PermissionError",
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

fn optional_integer(description: &str) -> Value {
    json!({
        "anyOf": [{ "type": "integer", "minimum": 0 }, { "type": "null" }],
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
        Tool::new(
            "list_heroes",
            "List the heroes of the current game version with their `id` (the hero id in the tables), `name` and `className`. Pass `id` to get the full details of one hero instead: description, stats, abilities, images.",
            object(json!({
                "properties": {
                    "id": optional_integer("Hero id; returns the full details of that hero")
                },
                "type": "object",
                "additionalProperties": false
            })),
        )
        .with_title("List Heroes"),
        Tool::new(
            "list_items",
            "List the items of one type in the current game version with their `id` (the item id in the tables), `name` and `className`; abilities and weapons also list their `heroes`, upgrades their `slot`, `tier`, `cost` and whether they are still `shopable`. Pass `id` to get the full details of one item instead: description, properties, upgrades, images.",
            object(json!({
                "properties": {
                    "type": {
                        "anyOf": [{ "type": "string", "enum": ["ability", "weapon", "upgrade"] }, { "type": "null" }],
                        "default": null,
                        "description": "Item type to list: `upgrade` for shop items, `ability` for hero abilities, `weapon` for hero weapons. Required unless `id` is set."
                    },
                    "id": optional_integer("Item id; returns the full details of that item")
                },
                "type": "object",
                "additionalProperties": false
            })),
        )
        .with_title("List Items"),
    ]
    .into_iter()
    .map(|tool| {
        tool.with_raw_output_schema(Arc::clone(&output_schema))
            .annotate(read_only.clone())
    })
    .collect()
});
