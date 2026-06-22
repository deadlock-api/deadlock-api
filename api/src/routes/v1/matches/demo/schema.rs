use std::sync::LazyLock;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use bytes::Bytes;
use clickhouse::Row;
use futures::TryStreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio_util::io::StreamReader;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::demo::demofusion;
use crate::routes::v1::matches::demo::demofusion::{TableKind, TableSchema};
use crate::routes::v1::matches::salts::fetch_match_salts;
use crate::services::rate_limiter::extractor::RateLimitKey;

/// Shared HTTP client for streaming demo prefixes off Valve's replay servers.
static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(reqwest::Client::new);

/// Decompressed bytes to pull per growth step while hunting for the send-tables.
/// One pull is normally enough — the send-tables sit within the first bzip2 block.
const STEP: usize = 1 << 20; // 1 MiB

#[derive(Debug, Clone, Row, Deserialize)]
struct LastDemoSalts {
    match_id: u64,
    cluster_id: Option<u32>,
    replay_salt: Option<u32>,
}

#[derive(Serialize, ToSchema)]
struct ColumnSchema {
    name: String,
    /// Arrow data type, rendered as its canonical textual form (e.g. `Int32`, `Utf8`).
    data_type: String,
    nullable: bool,
}

#[derive(Serialize, ToSchema)]
struct TableSchemaResponse {
    name: String,
    /// `entity` for tables discovered from the demo's send-tables, `event` for the
    /// event tables common to every demo.
    kind: &'static str,
    columns: Vec<ColumnSchema>,
}

#[derive(Serialize, ToSchema)]
struct DemoSchemaResponse {
    match_id: u64,
    demo_url: String,
    tables: Vec<TableSchemaResponse>,
}

impl From<TableSchema> for TableSchemaResponse {
    fn from(table: TableSchema) -> Self {
        Self {
            name: table.name,
            kind: match table.kind {
                TableKind::Entity => "entity",
                TableKind::Event => "event",
            },
            columns: table
                .schema
                .fields()
                .iter()
                .map(|field| ColumnSchema {
                    name: field.name().clone(),
                    data_type: field.data_type().to_string(),
                    nullable: field.is_nullable(),
                })
                .collect(),
        }
    }
}

#[derive(Deserialize, IntoParams)]
pub(super) struct SchemaQuery {
    /// Match to read the schema for. If omitted, the schema of the most recent match we
    /// have a demo for is returned. When set, the demo's salts are fetched (rate limited)
    /// if they are not already stored.
    match_id: Option<u64>,
}

#[utoipa::path(
    get,
    path = "/schema",
    params(SchemaQuery),
    responses(
        (status = OK, body = DemoSchemaResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = NOT_FOUND, description = "No demo / salts available for the match"),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Reading the demo schema failed")
    ),
    tags = ["Demo"],
    summary = "Demo Schema",
    description = "
Returns the queryable schema of a match's demo file: every entity and event table with its
columns and Arrow types.

By default this returns the schema of the most recent match we have a demo for. Optionally
pass `match_id` to read the schema for a specific match; if we don't already have its salts,
they are fetched from Steam (rate limited, see `/{match_id}/salts`).
    "
)]
pub(super) async fn schema(
    Query(SchemaQuery { match_id }): Query<SchemaQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let (match_id, cluster_id, replay_salt) = if let Some(match_id) = match_id {
        let salts = fetch_match_salts(&state, &rate_limit_key, match_id, false, false).await?;
        (match_id, salts.replay_group_id, salts.replay_salt)
    } else {
        let row = state
            .ch_client_ro
            .query(
                "SELECT ?fields FROM match_salts \
                 WHERE replay_salt IS NOT NULL \
                 ORDER BY match_id DESC LIMIT 1 \
                 SETTINGS log_comment = 'demo_schema_last_match'",
            )
            .fetch_optional::<LastDemoSalts>()
            .await?
            .ok_or_else(|| APIError::status_msg(StatusCode::NOT_FOUND, "No demo available"))?;
        (row.match_id, row.cluster_id, row.replay_salt)
    };

    let (Some(cluster_id), Some(replay_salt)) = (cluster_id, replay_salt) else {
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            format!("No demo available for match {match_id}"),
        ));
    };

    let demo_url =
        format!("http://replay{cluster_id}.valve.net/1422450/{match_id}_{replay_salt}.dem.bz2");

    let tables = fetch_demo_schema(&demo_url).await?;

    Ok(Json(DemoSchemaResponse {
        match_id,
        demo_url,
        tables: tables.into_iter().map(TableSchemaResponse::from).collect(),
    }))
}

/// Stream just enough of the bzip2-compressed demo to decode its send-tables, then stop.
///
/// A demo's schema is immutable, so results are cached for 24h keyed on the demo URL,
/// matching the endpoint's `Cache-Control`.
async fn fetch_demo_schema(url: &str) -> Result<Vec<TableSchema>, APIError> {
    let response = HTTP_CLIENT
        .get(url)
        .send()
        .await?
        .error_for_status()
        .map_err(|e| {
            APIError::status_msg(
                StatusCode::NOT_FOUND,
                format!("Failed to download demo: {e}"),
            )
        })?;

    let reader = StreamReader::new(response.bytes_stream().map_err(std::io::Error::other));
    let mut decoder = async_compression::tokio::bufread::BzDecoder::new(reader);

    let mut demo_prefix: Vec<u8> = Vec::new();
    let mut step = vec![0u8; STEP];

    loop {
        let n = fill(&mut decoder, &mut step).await?;
        demo_prefix.extend_from_slice(&step[..n]);

        let prefix = Bytes::from(demo_prefix.clone());
        let result = tokio::task::spawn_blocking(move || demofusion::schema(prefix))
            .await
            .map_err(|e| APIError::internal(format!("Demo schema task failed: {e}")))?;

        match result {
            Ok(tables) => return Ok(tables),
            // Send-tables not in the prefix yet — pull more, unless the stream ended.
            Err(demofusion::Error::IncompleteDemo) if n > 0 => {}
            Err(demofusion::Error::IncompleteDemo) => {
                return Err(APIError::internal(
                    "Demo ended before its send-tables were available",
                ));
            }
            Err(e) => {
                return Err(APIError::internal(format!(
                    "Failed to read demo schema: {e}"
                )));
            }
        }
    }
}

/// Read until `buf` is full or the reader is exhausted, coalescing short reads so each
/// growth step adds a meaningful chunk.
async fn fill<R: AsyncRead + Unpin>(reader: &mut R, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut total = 0;
    while total < buf.len() {
        match reader.read(&mut buf[total..]).await? {
            0 => break,
            n => total += n,
        }
    }
    Ok(total)
}
