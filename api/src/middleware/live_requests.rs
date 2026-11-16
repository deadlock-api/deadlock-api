use std::time::Instant;

use axum::body::HttpBody as _;
use axum::extract::{MatchedPath, Request, State};
use axum::http::header::CONTENT_LENGTH;
use axum::middleware::Next;
use axum::response::Response;

use crate::context::AppState;
use crate::services::ch_cost::ChCost;
use crate::services::live_requests::{LiveRequest, Origin};
use crate::utils::request::header_str;

/// Feeds served requests to the live request map. Counts every request in flight (two relaxed
/// atomics); while nobody watches, that and one atomic load are all it does.
pub(crate) async fn live_requests(
    State(state): State<AppState>,
    matched_path: MatchedPath,
    req: Request,
    next: Next,
) -> Response {
    if matches!(matched_path.as_str(), "/" | "/metrics") {
        return next.run(req).await;
    }
    let _in_flight = state.live_requests.begin();
    if !state.live_requests.is_watched() {
        return next.run(req).await;
    }
    let origin = Origin::from_headers(req.headers());
    let start = Instant::now();
    let response = next.run(req).await;
    let ch = response
        .extensions()
        .get::<ChCost>()
        .copied()
        .unwrap_or_default();
    let response_bytes = response
        .body()
        .size_hint()
        .exact()
        .or_else(|| header_str(response.headers(), CONTENT_LENGTH)?.parse().ok())
        .unwrap_or(0);
    state.live_requests.record(LiveRequest::new(
        origin,
        matched_path.as_str().to_owned(),
        response.status().as_u16(),
        start.elapsed(),
        response_bytes,
        ch,
    ));
    response
}
