use std::time::Instant;

use axum::extract::{MatchedPath, Request};
use axum::middleware::Next;
use axum::response::IntoResponse;

use crate::middleware::api_key::extract_api_key;

pub(crate) async fn track_requests(req: Request, next: Next) -> impl IntoResponse {
    let endpoint = if let Some(matched_path) = req.extensions().get::<MatchedPath>() {
        matched_path.as_str().to_owned()
    } else {
        req.uri().path().to_owned()
    };
    let method = req.method().clone();
    let api_key = if let Some(api_key) = extract_api_key(&req)
        && let Ok(api_key) = api_key.to_str()
    {
        api_key.to_owned()
    } else {
        "unknown".to_owned()
    };
    let start = Instant::now();
    let response = next.run(req).await;
    let duration = start.elapsed();
    let labels = [
        ("method", method.to_string()),
        ("endpoint", endpoint),
        ("status", response.status().to_string()),
        ("api_key", api_key),
    ];
    metrics::counter!("api_requests", &labels).increment(1);
    metrics::histogram!("api_request_duration_seconds", &labels).record(duration.as_secs_f64());
    response
}
