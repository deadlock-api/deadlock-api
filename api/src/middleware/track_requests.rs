use std::borrow::ToOwned;
use std::collections::HashMap;
use std::time::Instant;

use axum::extract::{MatchedPath, Request, State};
use axum::http::HeaderMap;
use axum::http::header::{self, AsHeaderName};
use axum::middleware::Next;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::services::request_logger::RequestLog;
use crate::utils::request::{client_ip, header_str, parse_api_key};

fn get_header(headers: &HeaderMap, name: impl AsHeaderName) -> Option<String> {
    header_str(headers, name).map(ToOwned::to_owned)
}

fn get_header_u64(headers: &HeaderMap, name: impl AsHeaderName) -> Option<u64> {
    header_str(headers, name)?.parse().ok()
}

pub(crate) async fn track_requests(
    State(state): State<AppState>,
    matched_path: MatchedPath,
    req: Request,
    next: Next,
) -> impl IntoResponse {
    let method = req.method().clone();
    let uri = req.uri().to_string();
    let query_params: HashMap<String, String> = req.uri().query().map_or_default(|q| {
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
    let headers = req.headers();
    let user_agent = get_header(headers, header::USER_AGENT);
    let api_key = parse_api_key(headers);
    let referer = get_header(headers, header::REFERER);
    let accept = get_header(headers, header::ACCEPT);
    let accept_encoding = get_header(headers, header::ACCEPT_ENCODING);

    let client_ip = client_ip(headers).map(ToOwned::to_owned);

    let start = Instant::now();
    let response = next.run(req).await;
    let duration = start.elapsed();

    let status_code = response.status().as_u16();
    let headers = response.headers();
    let content_type = get_header(headers, header::CONTENT_TYPE);
    let rate_limit_remaining = get_header_u64(headers, "ratelimit-remaining");
    let rate_limit_reset = get_header_u64(headers, "ratelimit-reset");

    // Use Content-Length header for response size instead of buffering the entire body
    let response_size = get_header_u64(headers, header::CONTENT_LENGTH).unwrap_or(0);

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
            uri,
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
        state.request_logger.insert_one(log).await;
    }

    response
}
