//! `GET /v1/info/live-requests`: the sampled live request feed as Server-Sent Events.

use core::convert::Infallible;
use core::time::Duration;

use axum::extract::State;
use axum::http::header::CACHE_CONTROL;
use axum::http::{HeaderValue, StatusCode};
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use futures::{Stream, StreamExt as _};
use tokio::sync::broadcast::error::RecvError;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::live_requests::Viewer;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Limits, Quota, RateLimit, Scope, describe};

/// Opening a stream; a browser reconnects on its own when one ends.
const RATE_LIMIT: RateLimit = RateLimit::new(
    "live_requests",
    &[Quota::new(Scope::Ip, 30, Duration::from_mins(10))],
);

/// How long one stream lasts. Ends forgotten tabs; `EventSource` reconnects after it.
const MAX_STREAM: Duration = Duration::from_mins(30);

#[utoipa::path(
    get,
    path = "/live-requests",
    responses(
        (status = OK, content_type = "text/event-stream", description = "\
SSE stream with one `message` event every 500 ms. Its `data` is a JSON object: `t` the tick's start \
(unix ms), `d` its length (ms), `n` the requests served in it, `q` the requests in progress at its \
end and `qp` the most at once during it, `cr` / `cw` the `ClickHouse` queries running / waiting for \
a slot and `cl` the current slot limit, `cq` / `rr` / `rb` the `ClickHouse` queries the tick's \
requests ran and the rows / bytes they read, `r` the route templates of this batch, and `e` the sampled requests as `[offset_ms, lat, lon, country, colo, route_index, status, \
duration_ms, response_bytes, rows_read]`, where `colo` is the IATA code of the Cloudflare data center that \
handed the request to the API (the Ray id's, usually one near the API rather than the client's edge) and `lat`, `lon`, `country` and `colo` are null when unknown. `hm` carries a minute \
of the requests Cloudflare answered itself as `{m: unix_minute, g: [[kind, colo, country, count], ...], \
s: {tr, cr, tb, cb, at, ac, lr, lb}, d: {lr, lb}}`: kind 0-4 is API cache hits, website, assets, other \
subdomains, data lake; `s` holds the minute's requests (`tr`) and response bytes (`tb`) with the cached \
ones (`cr`, `cb`), the API's requests (`at`) with its cached ones (`ac`) and the data lake's requests \
and bytes (`lr`, `lb`); `d` the data lake's since midnight UTC (null if unavailable). It comes first \
on connect and then whenever a new minute is complete, a few minutes behind real time. `im` carries \
the matches the ingest worker just wrote to the database, one entry per flush (about one a minute): \
`{t: unix_ms, n: matches_written, m: [[match_id, start_time, duration_s, game_mode, match_mode, \
average_badge, winning_team, region, team0_hero_ids, team1_hero_ids], ...]}`, `m` a random sample \
of at most 300 of them and `region` the server region (null if unknown). The newest entry comes \
first on connect, with `ih`: `[t, n]` of the last 30 flushes."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded, or too many streams open")
    ),
    tags = ["Info"],
    summary = "Live Requests (SSE)",
    description = describe(
        "
A live, sampled feed of the requests the API is serving, as drawn on the website's live map.

Each request carries only its approximate location (rounded to 0.1°), country, the Cloudflare data
center it went through, its route template, status, duration and response size. No IP addresses,
query strings or API keys. Every request is in the feed, up to 512 a batch (sampled beyond that; `n` counts all of them).

Responses Cloudflare serves from its cache never reach the API and are not in the feed.

A client may hold 4 streams at once. A stream ends after 30 minutes.
",
        Limits::from([("Opening a stream", RATE_LIMIT.quotas)]),
    )
)]
pub(super) async fn live_requests(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .check(&rate_limit_key, RATE_LIMIT)
        .await?;
    let viewer = state
        .live_requests
        .subscribe(rate_limit_key.client_id())
        .map_err(|reason| APIError::status_msg(StatusCode::TOO_MANY_REQUESTS, reason))?;
    // The current minute of Cloudflare-served traffic first; batches carry it only when it changes.
    let edge = state
        .live_requests
        .edge_minute()
        .map(|data| Ok(Event::default().data(data)));
    // And the ingest worker's newest flush, so the list of written matches is not empty.
    let ingest = state
        .live_requests
        .ingest_entry()
        .map(|data| Ok(Event::default().data(data)));
    let stream = futures::stream::iter(edge.into_iter().chain(ingest))
        .chain(batches(viewer))
        .take_until(crate::SHUTDOWN_TOKEN.clone().cancelled_owned())
        .take_until(tokio::time::sleep(MAX_STREAM));
    Ok((
        [(CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Sse::new(stream).keep_alive(KeepAlive::default()),
    ))
}

/// The viewer's batches as SSE events. A viewer that falls behind skips to the newest batch; the
/// viewer (and its slot) lives as long as the stream.
fn batches(viewer: Viewer) -> impl Stream<Item = Result<Event, Infallible>> {
    futures::stream::unfold(viewer, |mut viewer| async move {
        loop {
            match viewer.rx.recv().await {
                Ok(batch) => {
                    let data = str::from_utf8(&batch).unwrap_or_default();
                    return Some((Ok(Event::default().data(data)), viewer));
                }
                Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => return None,
            }
        }
    })
}
