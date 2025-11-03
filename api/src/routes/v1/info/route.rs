use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use clickhouse::Row;
use futures::future::join3;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::context::AppState;

const TABLE_SIZES_QUERY: &str = "
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
";

const FETCHED_MATCHES_LAST_24H_QUERY: &str = "
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
";

const USER_INGESTED_MATCHES_LAST24H: &str = "
SELECT uniq(match_id) AS matches
FROM match_salts
WHERE created_at > toStartOfDay(now() - INTERVAL 1 DAY) AND username is null
";

#[derive(Deserialize, Row)]
struct TableSizeRow {
    /// Name of the table.
    table: String,
    /// Whether the table is a view.
    is_view: bool,
    /// Number of rows in the table.
    rows: Option<u64>,
    /// Compressed size of the table in bytes.
    data_compressed_bytes: Option<u64>,
    /// Uncompressed size of the table in bytes.
    data_uncompressed_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, Default)]
pub struct TableSize {
    /// Whether the table is a view.
    is_view: bool,
    /// Number of rows in the table.
    pub rows: Option<u64>,
    /// Compressed size of the table in bytes.
    data_compressed_bytes: Option<u64>,
    /// Uncompressed size of the table in bytes.
    data_uncompressed_bytes: Option<u64>,
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
    fetched_matches_per_day: Option<u64>,
    /// The sizes of all tables in the database.
    pub table_sizes: Option<HashMap<String, TableSize>>,
    /// The number of matches ingested by users in the last 24 hours.
    user_ingested_matches_last24h: Option<u64>,
}

async fn fetch_ch_info(ch_client: &clickhouse::Client) -> APIInfo {
    let (table_sizes, fetched_matches_per_day, user_ingested_matches_last24h) = join3(
        ch_client
            .query(TABLE_SIZES_QUERY)
            .fetch_all::<TableSizeRow>(),
        ch_client
            .query(FETCHED_MATCHES_LAST_24H_QUERY)
            .fetch_one::<u64>(),
        ch_client
            .query(USER_INGESTED_MATCHES_LAST24H)
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
        user_ingested_matches_last24h: user_ingested_matches_last24h.ok(),
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
    description = "
Returns information about the API.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn info(State(state): State<AppState>) -> impl IntoResponse {
    Json(fetch_ch_info(&state.ch_client_ro).await)
}
