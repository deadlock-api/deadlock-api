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
use serde_json::Value;
use tokio::time::Instant;
use utoipa::IntoParams;

use super::demofusion;
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::live_url::resolve_broadcast_url;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

const BROADCAST_READY_TIMEOUT_SECS: u64 = 30;
const BROADCAST_READY_POLL_SECS: u64 = 2;
const BROADCAST_SYNC_REQUEST_TIMEOUT_SECS: u64 = 5;
const BROADCAST_NOT_STARTED_MESSAGE: &str = "Broadcast has not started yet";

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
        (status = 425, description = "The Steam CDN broadcast URL exists, but /sync is not ready yet"),
        (status = BAD_GATEWAY, description = "The live broadcast could not be fetched"),
        (status = SERVICE_UNAVAILABLE, description = "The live broadcast relay is temporarily unavailable"),
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
| IP | 10req/m |
| Global | 60req/m |
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
                Quota::ip_limit(10, Duration::from_mins(1)),
                Quota::global_limit(60, Duration::from_mins(1)),
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

    wait_for_broadcast_ready(&broadcast_url).await?;

    let stream = demofusion::query_live(&broadcast_url, &params.query)
        .await
        .map_err(|e| super::format::map_demofusion_err(&e))?;

    Ok(Sse::new(sse_rows(stream)).keep_alive(KeepAlive::default()))
}

async fn wait_for_broadcast_ready(broadcast_url: &str) -> APIResult<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(BROADCAST_SYNC_REQUEST_TIMEOUT_SECS))
        .build()?;
    let deadline = Instant::now() + Duration::from_secs(BROADCAST_READY_TIMEOUT_SECS);

    loop {
        match probe_broadcast_sync(&client, broadcast_url).await {
            BroadcastSyncProbe::Ready => return Ok(()),
            BroadcastSyncProbe::NotStarted => {
                if Instant::now() >= deadline {
                    return Err(APIError::status_msg(
                        too_early_status(),
                        "Live broadcast URL is allocated, but the Steam CDN relay has not started yet. Retry shortly.",
                    ));
                }
            }
            BroadcastSyncProbe::TemporarilyUnavailable => {
                if Instant::now() >= deadline {
                    return Err(APIError::status_msg(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "Live broadcast relay is temporarily unavailable. Retry shortly.",
                    ));
                }
            }
            BroadcastSyncProbe::FailedStatus(status) => {
                return Err(APIError::status_msg(
                    StatusCode::BAD_GATEWAY,
                    format!("Live broadcast relay returned HTTP {status}."),
                ));
            }
            BroadcastSyncProbe::MalformedSync => {
                return Err(APIError::status_msg(
                    StatusCode::BAD_GATEWAY,
                    "Live broadcast relay returned an invalid /sync response.",
                ));
            }
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        let sleep_for = remaining.min(Duration::from_secs(BROADCAST_READY_POLL_SECS));
        if sleep_for.is_zero() {
            continue;
        }
        tokio::time::sleep(sleep_for).await;
    }
}

#[derive(Debug)]
enum BroadcastSyncProbe {
    Ready,
    NotStarted,
    TemporarilyUnavailable,
    FailedStatus(StatusCode),
    MalformedSync,
}

async fn probe_broadcast_sync(client: &reqwest::Client, broadcast_url: &str) -> BroadcastSyncProbe {
    let url = format!("{}/sync", broadcast_url.trim_end_matches('/'));
    let response = match client.get(url).send().await {
        Ok(response) => response,
        Err(_) => return BroadcastSyncProbe::TemporarilyUnavailable,
    };
    let status = response.status();
    let body = match response.text().await {
        Ok(body) => body,
        Err(_) => return BroadcastSyncProbe::TemporarilyUnavailable,
    };

    if status.is_success() {
        return match serde_json::from_str::<Value>(&body) {
            Ok(value)
                if value.get("fragment").and_then(Value::as_i64).is_some()
                    && value
                        .get("signup_fragment")
                        .and_then(Value::as_i64)
                        .is_some() =>
            {
                BroadcastSyncProbe::Ready
            }
            _ => BroadcastSyncProbe::MalformedSync,
        };
    }

    if status == StatusCode::NOT_FOUND
        && sync_error_message(&body).is_some_and(is_not_started_message)
    {
        return BroadcastSyncProbe::NotStarted;
    }
    if status == StatusCode::NOT_FOUND && is_not_started_message(&body) {
        return BroadcastSyncProbe::NotStarted;
    }
    if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
        return BroadcastSyncProbe::TemporarilyUnavailable;
    }

    BroadcastSyncProbe::FailedStatus(status)
}

fn too_early_status() -> StatusCode {
    StatusCode::from_u16(425).unwrap_or(StatusCode::SERVICE_UNAVAILABLE)
}

fn is_not_started_message(message: impl AsRef<str>) -> bool {
    message
        .as_ref()
        .to_ascii_lowercase()
        .contains(&BROADCAST_NOT_STARTED_MESSAGE.to_ascii_lowercase())
}

fn sync_error_message(body: &str) -> Option<String> {
    serde_json::from_str::<Value>(body).ok().and_then(|value| {
        value
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_owned)
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
