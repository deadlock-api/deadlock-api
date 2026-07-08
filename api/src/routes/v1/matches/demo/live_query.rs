//! Stream SQL query results over a live match broadcast via Server-Sent Events.
//!
//! Unlike the async `/demo/query` job (which waits for a finished demo), this parses the live
//! GOTV/spectator broadcast incrementally and emits result rows as the match plays: one SSE event
//! per result row, a terminal `end` event when the broadcast stops, and an `error` event if the
//! query fails mid-stream.

use core::convert::Infallible;
use core::time::Duration;

use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use datafusion::arrow::json::LineDelimitedWriter;
use datafusion::arrow::record_batch::RecordBatch;
use datafusion::execution::SendableRecordBatchStream;
use futures::{Stream, StreamExt};
use reqwest::StatusCode;
use serde::Deserialize;
use utoipa::IntoParams;

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
    /// Explicit broadcast base URL (from `/live/urls`). Provide this or `match_id`.
    #[serde(default)]
    broadcast_url: Option<String>,
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
`broadcast_url` from `/live/urls`.

Projection/filter queries emit rows continuously as they are decoded. A whole-match aggregation
(`GROUP BY` / `ORDER BY`) can only produce its final rows once the broadcast ends.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 20req/m |
| Global | 100req/m |
"
)]
pub(super) async fn live_query(
    rate_limit_key: RateLimitKey,
    State(mut state): State<AppState>,
    Query(params): Query<LiveQueryParams>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "demo_live_query",
            &[
                Quota::ip_limit(20, Duration::from_mins(1)),
                Quota::global_limit(100, Duration::from_mins(1)),
            ],
        )
        .await?;

    let broadcast_url = match (params.broadcast_url, params.match_id) {
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

    // The response head is returned immediately; the (fallible, potentially slow) broadcast setup
    // runs lazily inside the stream so a stale/unavailable relay surfaces as a terminal `error`
    // event rather than a pre-response gateway error, and the keep-alive ping holds the connection
    // open through the wait for the signon fragment.
    let stream = live_sse(broadcast_url, params.query)
        .take_until(crate::SHUTDOWN_TOKEN.clone().cancelled_owned());
    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    ))
}

/// Run the live-query setup lazily as the stream's first step so the SSE response head is sent
/// before it completes. On success, stream result rows; on setup failure, emit a single `error`
/// event followed by the terminal `end`.
fn live_sse(broadcast_url: String, query: String) -> impl Stream<Item = Result<Event, Infallible>> {
    futures::stream::once(async move { demofusion::query_live(&broadcast_url, &query).await })
        .flat_map(|res| match res {
            Ok(rows) => sse_rows(rows).left_stream(),
            Err(e) => futures::stream::iter([
                Ok(error_event(&format!("Live broadcast error: {e}"))),
                Ok(end_event()),
            ])
            .right_stream(),
        })
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
        .chain(futures::stream::once(async { Ok(end_event()) }))
}

fn end_event() -> Event {
    Event::default().event("end").data("{}")
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
