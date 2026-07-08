//! Stream SQL query results over a live match broadcast via Server-Sent Events.
//!
//! Unlike the async `/demo/query` job (which waits for a finished demo), this parses the live
//! GOTV/spectator broadcast incrementally and emits result rows as the match plays: one SSE event
//! per result row, a terminal `end` event when the broadcast stops, and an `error` event if the
//! query fails mid-stream.

use core::convert::Infallible;
use core::time::Duration;

use axum::Json;
use axum::extract::{Query, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use datafusion::arrow::json::LineDelimitedWriter;
use datafusion::arrow::record_batch::RecordBatch;
use datafusion::execution::SendableRecordBatchStream;
use futures::{Stream, StreamExt};
use reqwest::StatusCode;
use serde::Deserialize;
use utoipa::{IntoParams, ToSchema};

use super::demofusion;
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::live_url::resolve_broadcast_url;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[derive(Deserialize, IntoParams)]
pub(super) struct LiveQueryParams {
    /// SQL query to run over the broadcast's entity/event tables (see `/demo/schema`).
    query: String,
    /// Match to spectate and stream. Provide this or `broadcast_url`; `broadcast_url` wins if both
    /// are given. Resolving a match spectates its lobby and is rate-limited.
    #[serde(default)]
    match_id: Option<u64>,
    /// Explicit broadcast base URL (from `/live/urls`). Prefer POST when passing a URL so it is not
    /// embedded in access logs, browser history, or intermediary caches.
    #[serde(default)]
    broadcast_url: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub(super) struct LiveQueryRequest {
    /// SQL query to run over the broadcast's entity/event tables (see `/demo/schema`).
    query: String,
    /// Match to spectate and stream. Provide this or `broadcast_url`; `broadcast_url` wins if both
    /// are given. Resolving a match spectates its lobby and is rate-limited.
    #[serde(default)]
    match_id: Option<u64>,
    /// Explicit broadcast base URL (from `/live/urls`). Kept in the request body instead of the
    /// query string to avoid leaking transient broadcast tokens through URLs.
    #[serde(default)]
    broadcast_url: Option<String>,
}

struct LiveQueryInput {
    query: String,
    match_id: Option<u64>,
    broadcast_url: Option<String>,
}

impl From<LiveQueryParams> for LiveQueryInput {
    fn from(params: LiveQueryParams) -> Self {
        Self {
            query: params.query,
            match_id: params.match_id,
            broadcast_url: params.broadcast_url,
        }
    }
}

impl From<LiveQueryRequest> for LiveQueryInput {
    fn from(req: LiveQueryRequest) -> Self {
        Self {
            query: req.query,
            match_id: req.match_id,
            broadcast_url: req.broadcast_url,
        }
    }
}

#[utoipa::path(
    get,
    path = "/live/query",
    params(LiveQueryParams),
    responses(
        (status = OK, content_type = "text/event-stream", description = "\
SSE stream of result rows. Each `message` event's `data` is one result row as a JSON object; a \
terminal `end` event marks the end of the broadcast, and an `error` event carries any mid-stream \
failure."),
        (status = BAD_REQUEST, description = "Neither match_id nor broadcast_url given, or the query is invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = BAD_GATEWAY, description = "The live broadcast could not be fetched"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to start the live query")
    ),
    tags = ["Demo"],
    summary = "Live Demo Query (SSE)",
    description = "
Run a SQL query over a match's **live** broadcast and stream result rows over Server-Sent Events as
the match plays, instead of waiting for the demo to finish (see the async `/demo/query`).

Provide either `match_id` (the server spectates the lobby to obtain the broadcast URL) or an explicit
`broadcast_url` from `/live/urls`. Prefer `POST /live/query` when passing `broadcast_url`, so the
transient URL is not embedded in access logs, browser history, or intermediary caches.

Projection/filter queries emit rows continuously as they are decoded. A whole-match aggregation
(`GROUP BY` / `ORDER BY`) can only produce its final rows once the broadcast ends.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/m |
| Global | 60req/m |
"
)]
pub(super) async fn live_query(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    Query(params): Query<LiveQueryParams>,
) -> APIResult<impl IntoResponse> {
    live_query_response(rate_limit_key, state, params.into()).await
}

#[utoipa::path(
    post,
    path = "/live/query",
    request_body = LiveQueryRequest,
    responses(
        (status = OK, content_type = "text/event-stream", description = "\
SSE stream of result rows. Each `message` event's `data` is one result row as a JSON object; a \
terminal `end` event marks the end of the broadcast, and an `error` event carries any mid-stream \
failure."),
        (status = BAD_REQUEST, description = "Neither match_id nor broadcast_url given, or the query is invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = BAD_GATEWAY, description = "The live broadcast could not be fetched"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to start the live query")
    ),
    tags = ["Demo"],
    summary = "Live Demo Query (SSE, POST)",
    description = "
Run a SQL query over a match's **live** broadcast and stream result rows over Server-Sent Events as
the match plays. This POST variant is preferred when passing an explicit `broadcast_url`, because the
transient URL stays in the request body instead of the URL/query string.

Provide either `match_id` (the server spectates the lobby to obtain the broadcast URL) or an explicit
`broadcast_url` from `/live/urls`.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/m |
| Global | 60req/m |
"
)]
pub(super) async fn live_query_post(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    Json(req): Json<LiveQueryRequest>,
) -> APIResult<impl IntoResponse> {
    live_query_response(rate_limit_key, state, req.into()).await
}

async fn live_query_response(
    rate_limit_key: RateLimitKey,
    mut state: AppState,
    input: LiveQueryInput,
) -> APIResult<Response> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "demo_live_query",
            &[
                Quota::ip_limit(10, Duration::from_mins(1)),
                Quota::global_limit(60, Duration::from_mins(1)),
            ],
        )
        .await?;

    let broadcast_url = match (input.broadcast_url, input.match_id) {
        (Some(url), _) => url,
        (None, Some(match_id)) => {
            resolve_broadcast_url(&mut state, &rate_limit_key, match_id)
                .await?
                .0
        }
        (None, None) => {
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                "Provide either match_id or broadcast_url",
            ));
        }
    };

    let stream = demofusion::query_live(&broadcast_url, &input.query)
        .await
        .map_err(|e| super::format::map_demofusion_err(&e))?;

    Ok(Sse::new(sse_rows(stream))
        .keep_alive(KeepAlive::default())
        .into_response())
}

/// Adapt a result-batch stream into an SSE row stream: one `message` event per row, a terminal
/// `end` event, and an inline `error` event if a batch fails to decode or serialize mid-stream.
fn sse_rows(stream: SendableRecordBatchStream) -> impl Stream<Item = Result<Event, Infallible>> {
    stream
        .flat_map(|item| {
            let events = match item {
                Ok(batch) => batch_to_row_events(&batch),
                Err(e) => vec![error_event(&e.to_string())],
            };
            futures::stream::iter(events.into_iter().map(Ok))
        })
        .chain(futures::stream::once(async {
            Ok(Event::default().event("end").data("{}"))
        }))
}

/// Serialize one batch to newline-delimited JSON and turn each row into its own `data:` event.
fn batch_to_row_events(batch: &RecordBatch) -> Vec<Event> {
    let mut buf = Vec::new();
    let mut writer = LineDelimitedWriter::new(&mut buf);
    if let Err(e) = writer.write(batch).and_then(|()| writer.finish()) {
        return vec![error_event(&format!(
            "Row serialization failed (a projected column type may be unsupported): {e}"
        ))];
    }
    String::from_utf8_lossy(&buf)
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| Event::default().data(line))
        .collect()
}

fn error_event(msg: &str) -> Event {
    Event::default()
        .event("error")
        .data(serde_json::json!({ "error": msg }).to_string())
}
