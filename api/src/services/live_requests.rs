//! A live, sampled feed of the requests the API serves, for the website's live request map.
//!
//! Costs nothing while nobody watches: [`LiveRequests::is_watched`] is one atomic load, and the
//! request middleware skips everything else when it is false. While someone watches, each request
//! adds a small row to a per-tick reservoir sample, and one background task encodes every
//! [`TICK`] into a single JSON message that all viewers share (a [`Bytes`] clone each).
//!
//! Nothing identifying leaves the API: no IP, query string, account id or API key, only the
//! client's coordinates rounded to 0.1° (Cloudflare's visitor location headers are already
//! city-level), its country, the Cloudflare data center that handed it to us and the route
//! template.

use core::sync::atomic::{AtomicUsize, Ordering};
use core::time::Duration;
use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use axum::http::HeaderMap;
use bytes::Bytes;
use rand::RngExt as _;
use serde::Serialize;
use tokio::sync::broadcast;
use tokio::time::{Instant, MissedTickBehavior};
use tracing::warn;

use crate::services::ch_cost::ChCost;
use crate::services::edge_traffic::{self, EdgeMinute};
use crate::utils::request::header_str;

/// How often a batch goes out.
pub(crate) const TICK: Duration = Duration::from_millis(500);

/// Most requests a batch carries; past it the tick is sampled (`n` still counts all). Today's
/// ~250 requests/s fit with room to spare, so the map draws every request.
const MAX_EVENTS_PER_TICK: usize = 512;

/// Batches a slow viewer may fall behind before it skips ahead.
const CHANNEL_CAPACITY: usize = 8;

/// Viewers at once on this replica, and per client (API key, or IP without one).
const MAX_VIEWERS: usize = 500;
const MAX_VIEWERS_PER_CLIENT: usize = 4;

/// Where a request came from, read from Cloudflare's headers before the request is handled.
#[derive(Debug, Default)]
pub(crate) struct Origin {
    /// Client coordinates rounded to 0.1°, from `cf-iplatitude` / `cf-iplongitude`.
    lat_lon: Option<(f32, f32)>,
    /// ISO 3166 alpha-2 country, from `cf-ipcountry`.
    country: Option<[u8; 2]>,
    /// IATA code of the Cloudflare data center that handed the request to us, from the `cf-ray`
    /// suffix. Usually one near our server, not the client's edge.
    colo: Option<[u8; 3]>,
}

impl Origin {
    pub(crate) fn from_headers(headers: &HeaderMap) -> Self {
        let coord = |name: &str, limit: f32| {
            header_str(headers, name)
                .and_then(|v| v.trim().parse::<f32>().ok())
                .filter(|v| v.is_finite() && v.abs() <= limit)
                .map(|v| (v * 10.0).round() / 10.0)
        };
        let lat_lon = coord("cf-iplatitude", 90.0).zip(coord("cf-iplongitude", 180.0));
        let country = header_str(headers, "cf-ipcountry")
            .and_then(|c| <[u8; 2]>::try_from(c.as_bytes()).ok())
            .filter(|c| c.iter().all(u8::is_ascii_uppercase));
        let colo = header_str(headers, "cf-ray")
            .and_then(|ray| ray.rsplit_once('-'))
            .and_then(|(_, colo)| <[u8; 3]>::try_from(colo.as_bytes()).ok())
            .filter(|c| c.iter().all(u8::is_ascii_uppercase));
        Self {
            lat_lon,
            country,
            colo,
        }
    }
}

/// One served request as the feed shows it.
#[derive(Debug)]
pub(crate) struct LiveRequest {
    pub(crate) origin: Origin,
    /// The matched route template, e.g. `/v1/players/{account_id}/match-history`.
    pub(crate) route: String,
    pub(crate) status: u16,
    pub(crate) duration_ms: u32,
    pub(crate) response_bytes: u64,
    /// What its `ClickHouse` queries cost; empty for cached and static responses.
    pub(crate) ch: ChCost,
}

impl LiveRequest {
    pub(crate) fn new(
        origin: Origin,
        route: String,
        status: u16,
        duration: Duration,
        response_bytes: u64,
        ch: ChCost,
    ) -> Self {
        Self {
            origin,
            route,
            status,
            duration_ms: u32::try_from(duration.as_millis()).unwrap_or(u32::MAX),
            response_bytes,
            ch,
        }
    }
}

struct Sampled {
    /// Milliseconds into the tick at which the request finished.
    offset_ms: u16,
    request: LiveRequest,
}

struct Pending {
    started: Instant,
    /// Requests seen this tick, sampled or not.
    seen: u64,
    /// `ClickHouse` cost of all of them.
    ch: ChCost,
    events: Vec<Sampled>,
}

impl Pending {
    fn new() -> Self {
        Self {
            started: Instant::now(),
            seen: 0,
            ch: ChCost::default(),
            events: Vec::new(),
        }
    }
}

/// The feed: a viewer count the middleware checks, the current tick's sample, and the channel
/// batches go out on.
pub(crate) struct LiveRequests {
    /// Requests being handled right now, counted whether or not anyone watches.
    in_flight: AtomicUsize,
    /// Most requests in flight at once since the last tick.
    peak: AtomicUsize,
    viewers: AtomicUsize,
    per_client: Mutex<HashMap<String, usize>>,
    pending: Mutex<Pending>,
    /// The newest complete minute of Cloudflare-served traffic, when configured.
    edge: Mutex<Option<EdgeMinute>>,
    tx: broadcast::Sender<Bytes>,
}

impl Default for LiveRequests {
    fn default() -> Self {
        Self {
            in_flight: AtomicUsize::new(0),
            peak: AtomicUsize::new(0),
            viewers: AtomicUsize::new(0),
            per_client: Mutex::default(),
            pending: Mutex::new(Pending::new()),
            edge: Mutex::new(None),
            tx: broadcast::Sender::new(CHANNEL_CAPACITY),
        }
    }
}

impl LiveRequests {
    /// Whether anyone is watching; the middleware does nothing else when not.
    pub(crate) fn is_watched(&self) -> bool {
        self.viewers.load(Ordering::Relaxed) > 0
    }

    /// Counts a request as in flight until the returned guard drops (also when the client hangs
    /// up and the request future is dropped). Two relaxed atomics, run for every request.
    pub(crate) fn begin(self: &std::sync::Arc<Self>) -> InFlight {
        let now = self
            .in_flight
            .fetch_add(1, Ordering::Relaxed)
            .saturating_add(1);
        self.peak.fetch_max(now, Ordering::Relaxed);
        InFlight(std::sync::Arc::clone(self))
    }

    /// Adds a finished request to the current tick's reservoir sample.
    pub(crate) fn record(&self, request: LiveRequest) {
        let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
        let offset_ms = u16::try_from(pending.started.elapsed().as_millis()).unwrap_or(u16::MAX);
        pending.seen = pending.seen.saturating_add(1);
        pending.ch.queries = pending.ch.queries.saturating_add(request.ch.queries);
        pending.ch.read_rows = pending.ch.read_rows.saturating_add(request.ch.read_rows);
        pending.ch.read_bytes = pending.ch.read_bytes.saturating_add(request.ch.read_bytes);
        let sampled = Sampled { offset_ms, request };
        if pending.events.len() < MAX_EVENTS_PER_TICK {
            pending.events.push(sampled);
            return;
        }
        // Algorithm R: the request replaces a random sampled one with chance MAX / seen, so every
        // request of the tick is equally likely to be shown.
        let slot = rand::rng().random_range(0..pending.seen);
        if let Some(event) = usize::try_from(slot)
            .ok()
            .and_then(|i| pending.events.get_mut(i))
        {
            *event = sampled;
        }
    }

    /// Registers a viewer of `client_id`; the returned [`Viewer`] unregisters it on drop.
    pub(crate) fn subscribe(
        self: &std::sync::Arc<Self>,
        client_id: String,
    ) -> Result<Viewer, &'static str> {
        {
            let mut per_client = self
                .per_client
                .lock()
                .unwrap_or_else(PoisonError::into_inner);
            let count = per_client.entry(client_id.clone()).or_default();
            if *count >= MAX_VIEWERS_PER_CLIENT {
                return Err("Too many live request streams open, close one first");
            }
            if self
                .viewers
                .try_update(Ordering::Relaxed, Ordering::Relaxed, |v| {
                    (v < MAX_VIEWERS).then(|| v.saturating_add(1))
                })
                .is_err()
            {
                if *count == 0 {
                    per_client.remove(&client_id);
                }
                return Err("Too many viewers right now, try again later");
            }
            *count = count.saturating_add(1);
        }
        Ok(Viewer {
            feed: std::sync::Arc::clone(self),
            client_id,
            rx: self.tx.subscribe(),
        })
    }

    /// Keeps the newest complete minute of Cloudflare-served traffic while anyone watches: one
    /// small analytics query a minute, none while nobody does.
    pub(crate) fn spawn_edge_poller(
        self: &std::sync::Arc<Self>,
        http: reqwest::Client,
        token: String,
        zone: String,
    ) {
        let feed = std::sync::Arc::clone(self);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(15));
            interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
            let mut last_error = None;
            loop {
                tokio::select! {
                    () = crate::SHUTDOWN_TOKEN.cancelled() => break,
                    _ = interval.tick() => {}
                }
                let target = edge_traffic::target_minute();
                let current = feed
                    .edge
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .as_ref()
                    .map(|m| m.minute);
                if !feed.is_watched() || current == Some(target) {
                    continue;
                }
                match edge_traffic::fetch_minute(&http, &token, &zone, target).await {
                    Ok(minute) => {
                        last_error = None;
                        *feed.edge.lock().unwrap_or_else(PoisonError::into_inner) = Some(minute);
                    }
                    Err(e) => edge_traffic::log_failure(&mut last_error, e),
                }
            }
        });
    }

    /// The newest minute of Cloudflare-served traffic as an SSE payload (`{"hm": ...}`), for a
    /// viewer that just connected.
    pub(crate) fn edge_minute(&self) -> Option<String> {
        let edge = self.edge.lock().unwrap_or_else(PoisonError::into_inner);
        edge.as_ref()
            .map(|minute| serde_json::json!({ "hm": minute.json }).to_string())
    }

    /// Encodes and sends one batch per [`TICK`] while anyone watches, until shutdown.
    pub(crate) fn spawn_ticker(self: &std::sync::Arc<Self>) {
        let feed = std::sync::Arc::clone(self);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(TICK);
            interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
            let mut edge_sent = None;
            loop {
                tokio::select! {
                    () = crate::SHUTDOWN_TOKEN.cancelled() => break,
                    _ = interval.tick() => {}
                }
                let pending = core::mem::replace(
                    &mut *feed.pending.lock().unwrap_or_else(PoisonError::into_inner),
                    Pending::new(),
                );
                let in_flight = feed.in_flight.load(Ordering::Relaxed);
                let peak = feed.peak.swap(in_flight, Ordering::Relaxed);
                if !feed.is_watched() {
                    continue;
                }
                let (ch, ch_limit) = crate::services::ch_admission::load();
                let load = Queue {
                    in_flight,
                    peak: peak.max(in_flight),
                    ch_running: ch.in_flight,
                    ch_waiting: ch.waiting,
                    ch_limit,
                };
                // A new minute of Cloudflare-served traffic goes out once; new viewers get it
                // when they connect (see `edge_minute`).
                let edge = feed
                    .edge
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .as_ref()
                    .filter(|minute| edge_sent != Some(minute.minute))
                    .cloned();
                if let Some(minute) = &edge {
                    edge_sent = Some(minute.minute);
                }
                match encode_batch(&pending, load, edge.as_ref().map(|m| &m.json)) {
                    // No receivers is not an error worth handling: the next tick checks again.
                    Ok(batch) => drop(feed.tx.send(batch)),
                    Err(e) => warn!("Failed to encode live request batch: {e}"),
                }
            }
        });
    }
}

/// A request in flight; see [`LiveRequests::begin`].
pub(crate) struct InFlight(std::sync::Arc<LiveRequests>);

impl Drop for InFlight {
    fn drop(&mut self) {
        self.0.in_flight.fetch_sub(1, Ordering::Relaxed);
    }
}

/// A registered viewer: receives the batches, and frees its slot on drop.
pub(crate) struct Viewer {
    feed: std::sync::Arc<LiveRequests>,
    client_id: String,
    pub(crate) rx: broadcast::Receiver<Bytes>,
}

impl Drop for Viewer {
    fn drop(&mut self) {
        self.feed.viewers.fetch_sub(1, Ordering::Relaxed);
        let mut per_client = self
            .feed
            .per_client
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if let Some(count) = per_client.get_mut(&self.client_id) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                per_client.remove(&self.client_id);
            }
        }
    }
}

/// What the server is working on at the end of a tick.
#[derive(Debug, Default, Clone, Copy)]
struct Queue {
    in_flight: usize,
    peak: usize,
    ch_running: usize,
    ch_waiting: usize,
    ch_limit: usize,
}

/// One batch on the wire. Rows are positional arrays to keep it small; routes are referenced by
/// their index in `r`.
#[derive(Serialize)]
struct Batch<'a> {
    /// Unix time of the tick's start, in milliseconds.
    t: i64,
    /// Tick length in milliseconds.
    d: u16,
    /// Requests served during the tick, including the ones not sampled.
    n: u64,
    /// API requests in flight at the end of the tick, and the most at once during it.
    q: usize,
    qp: usize,
    /// `ClickHouse` queries running and waiting for a slot, and the current slot limit.
    cr: usize,
    cw: usize,
    cl: usize,
    /// `ClickHouse` queries the tick's requests ran, and the rows and bytes they read.
    cq: u64,
    rr: u64,
    rb: u64,
    /// A new minute of the requests Cloudflare answered itself (see `edge_traffic`), absent
    /// while it has not changed.
    #[serde(skip_serializing_if = "Option::is_none")]
    hm: Option<&'a serde_json::Value>,
    /// Route templates of this batch.
    r: Vec<&'a str>,
    /// `[offset_ms, lat, lon, country, colo, route, status, duration_ms, bytes, rows_read]`;
    /// lat/lon, country and colo are null when unknown.
    e: Vec<Row<'a>>,
}

type Row<'a> = (
    u16,
    Option<f32>,
    Option<f32>,
    Option<&'a str>,
    Option<&'a str>,
    usize,
    u16,
    u32,
    u64,
    u64,
);

fn encode_batch(
    pending: &Pending,
    queue: Queue,
    edge: Option<&serde_json::Value>,
) -> serde_json::Result<Bytes> {
    let elapsed = pending.started.elapsed();
    let started_ms = chrono::Utc::now()
        .timestamp_millis()
        .saturating_sub(i64::try_from(elapsed.as_millis()).unwrap_or(0));
    let mut routes: Vec<&str> = Vec::new();
    let mut events = pending.events.iter().collect::<Vec<_>>();
    events.sort_unstable_by_key(|e| e.offset_ms);
    let rows = events
        .into_iter()
        .map(|Sampled { offset_ms, request }| {
            let route = routes
                .iter()
                .position(|r| *r == request.route)
                .unwrap_or_else(|| {
                    routes.push(&request.route);
                    routes.len().saturating_sub(1)
                });
            let origin = &request.origin;
            (
                *offset_ms,
                origin.lat_lon.map(|(lat, _)| lat),
                origin.lat_lon.map(|(_, lon)| lon),
                origin.country.as_ref().and_then(|c| str::from_utf8(c).ok()),
                origin.colo.as_ref().and_then(|c| str::from_utf8(c).ok()),
                route,
                request.status,
                request.duration_ms,
                request.response_bytes,
                request.ch.read_rows,
            )
        })
        .collect();
    let batch = Batch {
        t: started_ms,
        d: u16::try_from(elapsed.as_millis()).unwrap_or(u16::MAX),
        n: pending.seen,
        q: queue.in_flight,
        qp: queue.peak,
        cr: queue.ch_running,
        cw: queue.ch_waiting,
        cl: queue.ch_limit,
        cq: pending.ch.queries,
        rr: pending.ch.read_rows,
        rb: pending.ch.read_bytes,
        hm: edge,
        r: routes,
        e: rows,
    };
    serde_json::to_vec(&batch).map(Bytes::from)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::http::HeaderValue;

    use super::*;

    fn request(route: &str) -> LiveRequest {
        LiveRequest {
            origin: Origin::default(),
            route: route.to_owned(),
            status: 200,
            duration_ms: 12,
            response_bytes: 345,
            ch: ChCost {
                queries: 1,
                read_rows: 10,
                ..ChCost::default()
            },
        }
    }

    #[test]
    fn origin_from_cloudflare_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("cf-iplatitude", HeaderValue::from_static("60.16952"));
        headers.insert("cf-iplongitude", HeaderValue::from_static("24.93545"));
        headers.insert("cf-ipcountry", HeaderValue::from_static("FI"));
        headers.insert("cf-ray", HeaderValue::from_static("8f1a2b3c4d5e6f70-FRA"));
        let origin = Origin::from_headers(&headers);
        assert_eq!(origin.lat_lon, Some((60.2, 24.9)));
        assert_eq!(origin.country, Some(*b"FI"));
        assert_eq!(origin.colo, Some(*b"FRA"));
    }

    #[test]
    fn origin_rejects_junk() {
        let mut headers = HeaderMap::new();
        headers.insert("cf-iplatitude", HeaderValue::from_static("123"));
        headers.insert("cf-iplongitude", HeaderValue::from_static("24"));
        headers.insert("cf-ipcountry", HeaderValue::from_static("XXX"));
        headers.insert(
            "cf-ray",
            HeaderValue::from_static("0194d6c2-uuid-not-a-ray"),
        );
        let origin = Origin::from_headers(&headers);
        assert_eq!(origin.lat_lon, None);
        assert_eq!(origin.country, None);
        assert_eq!(origin.colo, None);
    }

    #[test]
    fn sample_is_capped_and_counts_everything() {
        let feed = LiveRequests::default();
        for i in 0..1000 {
            feed.record(request(if i % 2 == 0 { "/a" } else { "/b" }));
        }
        let pending = feed.pending.lock().unwrap();
        assert_eq!(pending.seen, 1000);
        assert_eq!(pending.events.len(), MAX_EVENTS_PER_TICK);
        let json: serde_json::Value =
            serde_json::from_slice(&encode_batch(&pending, Queue::default(), None).unwrap())
                .unwrap();
        assert_eq!(json["n"], 1000);
        assert_eq!(json["r"].as_array().unwrap().len(), 2);
        assert_eq!(json["e"][0].as_array().unwrap().len(), 10);
        assert_eq!(json["rr"], 10_000);
        assert_eq!(json["cq"], 1000);
    }

    #[test]
    fn in_flight_counts_until_drop() {
        let feed = Arc::new(LiveRequests::default());
        let a = feed.begin();
        let b = feed.begin();
        drop(a);
        assert_eq!(feed.in_flight.load(Ordering::Relaxed), 1);
        assert_eq!(feed.peak.load(Ordering::Relaxed), 2);
        drop(b);
        assert_eq!(feed.in_flight.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn viewer_slots_are_capped_and_freed() {
        let feed = Arc::new(LiveRequests::default());
        assert!(!feed.is_watched());
        let viewers = (0..MAX_VIEWERS_PER_CLIENT)
            .map(|_| feed.subscribe("ip".to_owned()).unwrap())
            .collect::<Vec<_>>();
        assert!(feed.is_watched());
        assert!(feed.subscribe("ip".to_owned()).is_err());
        let other = feed.subscribe("other".to_owned()).unwrap();
        drop(viewers);
        drop(other);
        assert!(!feed.is_watched());
        assert!(feed.per_client.lock().unwrap().is_empty());
    }
}
