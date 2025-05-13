use crate::state::AppState;
use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use futures::future::join;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use utoipa::ToSchema;

const TABLE_SIZES_QUERY: &str = r#"
SELECT
    name                     AS table,
    toBool(parts IS NULL)    AS is_view,
    total_rows               AS rows,
    total_bytes              AS data_compressed_bytes,
    total_bytes_uncompressed AS data_uncompressed_bytes
FROM system.tables
WHERE database = 'default'
    AND name NOT LIKE 'system.%'
    AND name NOT LIKE '%inner%'
    AND total_rows IS NOT NULL
    AND total_bytes IS NOT NULL
    AND total_bytes_uncompressed IS NOT NULL
ORDER BY table
"#;

const FETCHED_MATCHES_LAST_24H_QUERY: &str = r#"
WITH fetched_matches AS (
    SELECT match_id
    FROM match_info
    WHERE created_at > now() - INTERVAL 1 DAY
    UNION
    DISTINCT
    SELECT match_id
    FROM match_salts
    WHERE created_at > now() - INTERVAL 1 DAY
)
SELECT COUNT() as fetched_matches_per_day
FROM fetched_matches
"#;

#[derive(Deserialize, Row)]
pub struct TableSizeRow {
    /// Name of the table.
    pub table: String,
    /// Whether the table is a view.
    pub is_view: bool,
    /// Number of rows in the table.
    pub rows: Option<u64>,
    /// Compressed size of the table in bytes.
    pub data_compressed_bytes: Option<u64>,
    /// Uncompressed size of the table in bytes.
    pub data_uncompressed_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, Default)]
pub struct TableSize {
    /// Whether the table is a view.
    pub is_view: bool,
    /// Number of rows in the table.
    pub rows: Option<u64>,
    /// Compressed size of the table in bytes.
    pub data_compressed_bytes: Option<u64>,
    /// Uncompressed size of the table in bytes.
    pub data_uncompressed_bytes: Option<u64>,
}

impl From<TableSizeRow> for TableSize {
    fn from(row: TableSizeRow) -> Self {
        TableSize {
            is_view: row.is_view,
            rows: row.rows,
            data_compressed_bytes: row.data_compressed_bytes,
            data_uncompressed_bytes: row.data_uncompressed_bytes,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct APIInfo {
    /// The number of matches fetched in the last 24 hours.
    pub fetched_matches_per_day: Option<u64>,
    /// The sizes of all tables in the database.
    pub table_sizes: Option<HashMap<String, TableSize>>,
}

#[cached(
    ty = "TimedCache<u8, APIInfo>",
    create = "{ TimedCache::with_lifespan(5 * 60) }",
    convert = "{ 0 }",
    sync_writes = "default"
)]
pub async fn fetch_ch_info(ch_client: &clickhouse::Client) -> APIInfo {
    let (table_sizes, fetched_matches_per_day) = join(
        ch_client
            .query(TABLE_SIZES_QUERY)
            .fetch_all::<TableSizeRow>(),
        ch_client
            .query(FETCHED_MATCHES_LAST_24H_QUERY)
            .fetch_one::<u64>(),
    )
    .await;
    APIInfo {
        fetched_matches_per_day: fetched_matches_per_day.ok(),
        table_sizes: table_sizes.ok().map(|v| {
            v.into_iter()
                .map(|row| (row.table.clone(), row.into()))
                .collect()
        }),
    }
}

#[utoipa::path(
    get,
    path = "/",
    responses(
        (status = OK, body = APIInfo),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["Info"],
    summary = "API Info",
    description = "Returns information about the API."
)]
pub async fn info(State(state): State<AppState>) -> impl IntoResponse {
    Json(fetch_ch_info(&state.ch_client).await)
}
