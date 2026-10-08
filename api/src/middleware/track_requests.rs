use std::borrow::ToOwned;
use std::collections::HashMap;
use std::time::Instant;

use axum::extract::{MatchedPath, Request, State};
use axum::http::header;
use axum::middleware::Next;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::services::request_logger::RequestLog;
use crate::utils::request::{client_ip, parse_api_key};

fn get_header(req: &Request, name: &str) -> Option<String> {
    req.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned)
}

pub(crate) async fn track_requests(
    State(state): State<AppState>,
    matched_path: MatchedPath,
    req: Request,
    next: Next,
) -> impl IntoResponse {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let uri_string = uri.to_string();
    let query_params: HashMap<String, String> = uri.query().map_or_default(|q| {
        q.split('&')
            .filter_map(|pair| {
                let mut parts = pair.splitn(2, '=');
                let key = parts.next()?;
                let value = parts.next().unwrap_or("");
                Some((
                    urlencoding::decode(key).unwrap_or_default().into_owned(),
                    urlencoding::decode(value).unwrap_or_default().into_owned(),
                ))
            })
            .collect()
    });
    let user_agent = get_header(&req, "user-agent");
    let api_key = parse_api_key(req.headers());
    let referer = get_header(&req, "referer");
    let accept = get_header(&req, "accept");
    let accept_encoding = get_header(&req, "accept-encoding");

    let client_ip = client_ip(req.headers()).map(ToOwned::to_owned);

    let start = Instant::now();
    let response = next.run(req).await;
    let duration = start.elapsed();

    let status_code = response.status().as_u16();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned);
    let rate_limit_remaining = response
        .headers()
        .get("ratelimit-remaining")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());
    let rate_limit_reset = response
        .headers()
        .get("ratelimit-reset")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());

    // Use Content-Length header for response size instead of buffering the entire body
    let response_size = response
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    // Create metrics labels. Keep these bounded: a raw user agent label would create a new
    // series per distinct client string.
    let labels = [
        ("method", method.to_string()),
        ("endpoint", matched_path.as_str().to_owned()),
        ("status", status_code.to_string()),
    ];
    metrics::counter!("api_requests", &labels).increment(1);
    metrics::histogram!("api_request_duration_seconds", &labels).record(duration.as_secs_f64());

    // Log to ClickHouse buffer (skip non-API routes)
    let path_str = matched_path.as_str();
    if !matches!(
        path_str,
        "/" | "/docs" | "/favicon.ico" | "/robots.txt" | "/metrics" | "/openapi.json"
    ) {
        let log = RequestLog {
            timestamp: chrono::Utc::now().timestamp_millis(),
            method: method.to_string(),
            path: path_str.to_owned(),
            uri: uri_string,
            query_params,
            status_code,
            duration_ms: u64::try_from(duration.as_millis()).unwrap_or(u64::MAX),
            user_agent,
            api_key,
            client_ip,
            response_size,
            content_type,
            referer,
            accept,
            accept_encoding,
            rate_limit_remaining,
            rate_limit_reset,
        };
        state.request_logger.insert(vec![log]).await;
    }

    response
}
