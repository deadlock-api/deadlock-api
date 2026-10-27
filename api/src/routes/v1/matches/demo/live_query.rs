//! Stream SQL query results over a live match broadcast via Server-Sent Events.
//!
//! Unlike the async `/demo/query` job (which waits for a finished demo), this parses the live
//! GOTV/spectator broadcast incrementally and emits result rows as the match plays: one SSE event
//! per result row, a terminal `end` event when the broadcast stops, and an `error` event if the
//! query fails mid-stream.

use core::convert::Infallible;
use core::task::Poll;
use core::time::Duration;
use std::collections::{HashMap, VecDeque};
use std::sync::{LazyLock, Mutex, PoisonError};

use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use datafusion::arrow::json::LineDelimitedWriter;
use datafusion::arrow::record_batch::RecordBatch;
use datafusion::execution::SendableRecordBatchStream;
use futures::{Stream, StreamExt as _};
use reqwest::StatusCode;
use serde::Deserialize;
use tokio::sync::mpsc::{UnboundedReceiver, unbounded_channel};
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;
use utoipa::IntoParams;

use super::demofusion;
use crate::context::{AppState, LiveQueryConfig};
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::live_url::resolve_broadcast_url;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::broadcast_url::validate_broadcast_url;

/// How long one live query may stream, from the request on. Long enough for the longest match plus
/// the broadcast delay; past it the query is cut off so a stuck or runaway one cannot run forever.
const LIVE_QUERY_TIMEOUT: Duration = Duration::from_hours(2);

/// Running live queries per client id, oldest first, plus their total.
#[derive(Default)]
struct StreamSlots {
    per_client: HashMap<String, VecDeque<(u64, CancellationToken)>>,
    total: usize,
    next_id: u64,
}

static STREAM_SLOTS: LazyLock<Mutex<StreamSlots>> = LazyLock::new(Mutex::default);

/// One running live query; frees its slot on drop unless a newer stream of the same client
/// already took it over.
struct StreamSlot {
    client_id: String,
    id: u64,
    /// Cancelled when a newer stream of the same client evicts this one.
    evicted: CancellationToken,
}

impl StreamSlot {
    /// Takes a slot for `client_id`, ending the client's oldest stream if it is at its limit (see
    /// [`LiveQueryConfig`]). Fails only when the replica as a whole is full.
    fn acquire(client_id: String, limits: &LiveQueryConfig) -> Result<Self, &'static str> {
        let mut guard = STREAM_SLOTS.lock().unwrap_or_else(PoisonError::into_inner);
        let slots = &mut *guard;
        let streams = slots.per_client.entry(client_id.clone()).or_default();
        if streams.len() >= limits.streams_per_client.max(1) {
            if let Some((_, oldest)) = streams.pop_front() {
                oldest.cancel();
                slots.total = slots.total.saturating_sub(1);
            }
        } else if slots.total >= limits.streams_per_replica {
            if streams.is_empty() {
                slots.per_client.remove(&client_id);
            }
            return Err("Too many live queries are running on the server, try again later");
        }
        let id = slots.next_id;
        slots.next_id = slots.next_id.wrapping_add(1);
        let evicted = CancellationToken::new();
        streams.push_back((id, evicted.clone()));
        slots.total = slots.total.saturating_add(1);
        Ok(Self {
            client_id,
            id,
            evicted,
        })
    }
}

impl Drop for StreamSlot {
    fn drop(&mut self) {
        let mut guard = STREAM_SLOTS.lock().unwrap_or_else(PoisonError::into_inner);
        let slots = &mut *guard;
        let Some(streams) = slots.per_client.get_mut(&self.client_id) else {
            return;
        };
        let before = streams.len();
        streams.retain(|(id, _)| *id != self.id);
        if streams.len() < before {
            slots.total = slots.total.saturating_sub(1);
        }
        if streams.is_empty() {
            slots.per_client.remove(&self.client_id);
        }
    }
}

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
failure. While the broadcast relay is still spinning up (common right after spectating a fresh \
match), `status` events report retry progress instead of the stream going quiet."),
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

**Joining controllers and pawns:** while a hero is dead, `CCitadelPlayerController.m_hPawn` points
at a `CCitadelObserverPawn`, not the hero's `CCitadelPlayerPawn`. Join controllers to hero pawns by
hero id or pawn entity index rather than through `m_hPawn`.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | With broadcast_url: 20req/m<br>With match_id: 6req/h |
| Key | With broadcast_url: -<br>With match_id: 10req/10m, 50req/h |
| Global | With broadcast_url: 100req/m<br>With match_id, without API key: 60req/10m, 300req/h<br>With match_id, with API key: 20req/10m, 100req/h |

With `match_id`, only spectating counts against the limits; a match spectated within the last hour is served from cache.

A limited number of live queries per client (API key, or IP without one) stream at once, 16 by
default. One more ends the client's oldest stream with an `error` event (status 409), so open a new
stream only when you no longer need an old one. A `429` means the server as a whole is at its live
query limit.

A query whose result rows queue up unread (a client not reading the stream, or a join/aggregation
that holds rows until the broadcast ends) is stopped with an `error` event once it buffers too much
(128 MiB by default).
"
)]
pub(super) async fn live_query(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
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
    // Taken before spectating so a full server doesn't spend spectate quota.
    let limits = &state.config.live_query;
    let slot = StreamSlot::acquire(rate_limit_key.client_id(), limits)
        .map_err(|reason| APIError::status_msg(StatusCode::TOO_MANY_REQUESTS, reason))?;

    let broadcast_url = match (params.broadcast_url, params.match_id) {
        (Some(url), _) => url,
        (None, Some(match_id)) => {
            resolve_broadcast_url(&state, &rate_limit_key, match_id)
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

    // Both a caller-supplied URL and a resolved one (the cache also holds ingested URLs) must
    // point at a Valve broadcast host before the server fetches it.
    validate_broadcast_url(&broadcast_url)
        .map_err(|reason| APIError::status_msg(StatusCode::BAD_REQUEST, reason))?;

    // The response head is returned immediately; the (fallible, potentially slow) broadcast setup
    // runs lazily inside the stream so a stale/unavailable relay surfaces as a terminal `error`
    // event rather than a pre-response gateway error, and the keep-alive ping holds the connection
    // open through the wait for the signon fragment.
    let evicted = slot.evicted.clone();
    let queue_limit_bytes = limits.queue_limit_mib.saturating_mul(1 << 20);
    let stream = live_sse(
        broadcast_url,
        params.query,
        evicted.clone(),
        queue_limit_bytes,
    )
    .take_until(crate::SHUTDOWN_TOKEN.clone().cancelled_owned())
    .take_until(evicted.clone().cancelled_owned())
    .chain(evicted_event(evicted, limits.streams_per_client));
    Ok(Sse::new(release_on_end(stream, slot)).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    ))
}

/// Run the live-query setup lazily as the stream's first step so the SSE response head is sent
/// before it completes. On success, stream result rows; on setup failure, emit a single `error`
/// event followed by the terminal `end`. Concurrently, any progress messages `query_live` reports
/// while retrying the initial connection are forwarded as `status` events.
fn live_sse(
    broadcast_url: String,
    query: String,
    cancel: CancellationToken,
    queue_limit_bytes: usize,
) -> impl Stream<Item = Result<Event, Infallible>> {
    let now = Instant::now();
    // Adding a constant timeout of minutes to the current instant cannot overflow.
    let deadline = now.checked_add(LIVE_QUERY_TIMEOUT).unwrap_or(now);
    let (status_tx, status_rx) = unbounded_channel::<String>();
    let status_stream = receiver_stream(status_rx).map(|msg| Ok(status_event(&msg)));

    let result_stream = futures::stream::once(async move {
        demofusion::query_live(&broadcast_url, &query, status_tx, cancel, queue_limit_bytes).await
    })
    .flat_map(move |res| match res {
        Ok(rows) => sse_rows(rows, deadline).left_stream(),
        Err(e) => {
            // Reuse the same status classification as the non-live `/demo/query` path (e.g. a
            // relay fetch failure is a 502) instead of leaking whatever raw status Valve's relay
            // happened to answer with as if it meant something about this request.
            let api_err = super::format::map_demofusion_err(&e);
            let message = api_err.to_string();
            let status = api_err.into_response().status();
            futures::stream::iter([Ok(error_event(status, &message)), Ok(end_event())])
                .right_stream()
        }
    });

    futures::stream::select(status_stream, result_stream)
}

/// The `error` and `end` events of a stream a newer one of the same client evicted; nothing for a
/// stream that ended on its own.
fn evicted_event(
    evicted: CancellationToken,
    streams_per_client: usize,
) -> impl Stream<Item = Result<Event, Infallible>> {
    futures::stream::once(async move { evicted.is_cancelled() }).flat_map(move |was_evicted| {
        let events = if was_evicted {
            vec![
                Ok(error_event(
                    StatusCode::CONFLICT,
                    &format!(
                        "Ended by a newer live query from the same client (at most \
                         {streams_per_client} run at once)"
                    ),
                )),
                Ok(end_event()),
            ]
        } else {
            Vec::new()
        };
        futures::stream::iter(events)
    })
}

/// Holds `slot` until `stream` yields its last item or is dropped, so a finished live query frees
/// its slot even while the client keeps the connection open.
fn release_on_end<S: Stream>(stream: S, slot: StreamSlot) -> impl Stream<Item = S::Item> {
    let mut slot = Some(slot);
    stream.chain(futures::stream::poll_fn(move |_| {
        drop(slot.take());
        Poll::Ready(None)
    }))
}

/// Adapt an `UnboundedReceiver` into a `Stream`, ending once the sender is dropped and the queue
/// drains.
fn receiver_stream<T>(rx: UnboundedReceiver<T>) -> impl Stream<Item = T> {
    futures::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|item| (item, rx))
    })
}

/// Adapt a result-batch stream into an SSE row stream: one `message` event per row, a terminal
/// `end` event, and an inline `error` event if a batch fails to decode or serialize mid-stream.
/// At `deadline` the query is dropped (stopping the broadcast parse) and a timeout `error` sent.
fn sse_rows(
    stream: SendableRecordBatchStream,
    deadline: Instant,
) -> impl Stream<Item = Result<Event, Infallible>> {
    futures::stream::unfold(Some(stream), move |stream| async move {
        let mut stream = stream?;
        let events = match tokio::time::timeout_at(deadline, stream.next()).await {
            Ok(Some(Ok(batch))) => batch_to_row_events(&batch),
            Ok(Some(Err(e))) => vec![error_event(
                StatusCode::INTERNAL_SERVER_ERROR,
                &e.to_string(),
            )],
            Ok(None) => return None,
            Err(_) => {
                let message = format!(
                    "Live query timed out after {} min",
                    LIVE_QUERY_TIMEOUT.as_secs() / 60
                );
                return Some((
                    vec![error_event(StatusCode::REQUEST_TIMEOUT, &message)],
                    None,
                ));
            }
        };
        Some((events, Some(stream)))
    })
    .flat_map(|events| futures::stream::iter(events.into_iter().map(Ok)))
    .chain(futures::stream::once(async { Ok(end_event()) }))
}

fn end_event() -> Event {
    Event::default().event("end").data("{}")
}

fn status_event(msg: &str) -> Event {
    Event::default()
        .event("status")
        .data(serde_json::json!({ "message": msg }).to_string())
}

/// Serialize one batch to newline-delimited JSON and turn each row into its own `data:` event.
fn batch_to_row_events(batch: &RecordBatch) -> Vec<Event> {
    let mut buf = Vec::new();
    let mut writer = LineDelimitedWriter::new(&mut buf);
    if let Err(e) = writer.write(batch).and_then(|()| writer.finish()) {
        return vec![error_event(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Row serialization failed (a projected column type may be unsupported): {e}"),
        )];
    }
    String::from_utf8_lossy(&buf)
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| Event::default().data(line))
        .collect()
}

fn error_event(status: StatusCode, msg: &str) -> Event {
    Event::default()
        .event("error")
        .data(serde_json::json!({ "status": status.as_u16(), "error": msg }).to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use datafusion::arrow::datatypes::Schema;
    use datafusion::physical_plan::stream::RecordBatchStreamAdapter;

    use super::*;

    #[tokio::test]
    async fn sse_rows_ends_with_a_timeout_error_at_the_deadline() {
        let silent: SendableRecordBatchStream = Box::pin(RecordBatchStreamAdapter::new(
            Arc::new(Schema::empty()),
            futures::stream::pending(),
        ));
        let events: Vec<String> = sse_rows(silent, Instant::now())
            .map(|event| format!("{:?}", event.unwrap()))
            .collect()
            .await;
        assert_eq!(events.len(), 2, "{events:?}");
        assert!(events[0].contains("timed out"), "{events:?}");
        assert!(events[1].contains("end"), "{events:?}");
    }

    fn limits() -> LiveQueryConfig {
        LiveQueryConfig::default()
    }

    #[test]
    fn a_new_stream_past_the_limit_evicts_the_oldest() {
        let client = "test:evicts_the_oldest".to_owned();
        let mut slots: VecDeque<_> = (0..limits().streams_per_client)
            .map(|_| StreamSlot::acquire(client.clone(), &limits()).unwrap())
            .collect();
        slots.push_back(StreamSlot::acquire(client.clone(), &limits()).unwrap());
        let evicted = slots.pop_front().unwrap();
        assert!(evicted.evicted.is_cancelled());
        assert!(slots.iter().all(|s| !s.evicted.is_cancelled()));

        // The evicted stream going away must not free a slot the newer streams hold.
        drop(evicted);
        slots.push_back(StreamSlot::acquire(client, &limits()).unwrap());
        assert!(slots.front().unwrap().evicted.is_cancelled());
        assert_eq!(slots.iter().filter(|s| s.evicted.is_cancelled()).count(), 1);
    }

    #[tokio::test]
    async fn finished_stream_frees_its_slot_before_being_dropped() {
        let client = "test:finished_stream_frees_its_slot".to_owned();
        let others: Vec<_> = (1..limits().streams_per_client)
            .map(|_| StreamSlot::acquire(client.clone(), &limits()).unwrap())
            .collect();
        let mut stream = Box::pin(release_on_end(
            futures::stream::iter([1, 2]),
            StreamSlot::acquire(client.clone(), &limits()).unwrap(),
        ));
        assert_eq!(stream.next().await, Some(1));
        assert_eq!(stream.next().await, Some(2));
        assert_eq!(stream.next().await, None);
        // The ended stream (still alive here) no longer counts, so no other stream is evicted.
        let _new = StreamSlot::acquire(client, &limits()).unwrap();
        assert!(others.iter().all(|s| !s.evicted.is_cancelled()));
    }

    #[tokio::test]
    async fn evicted_stream_ends_with_an_error() {
        let token = CancellationToken::new();
        let events: Vec<String> = evicted_event(token.clone(), 16)
            .map(|event| format!("{:?}", event.unwrap()))
            .collect()
            .await;
        assert!(events.is_empty(), "{events:?}");

        token.cancel();
        let events: Vec<String> = evicted_event(token, 16)
            .map(|event| format!("{:?}", event.unwrap()))
            .collect()
            .await;
        assert_eq!(events.len(), 2, "{events:?}");
        assert!(events[0].contains("newer live query"), "{events:?}");
    }
}
