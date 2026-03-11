use core::str::FromStr;
use std::borrow::ToOwned;
use std::collections::HashMap;
use std::time::Instant;

use axum::extract::{MatchedPath, Request, State};
use axum::http::header;
use axum::middleware::Next;
use axum::response::IntoResponse;
use uuid::Uuid;

use crate::context::AppState;
use crate::middleware::api_key::extract_api_key;
use crate::services::request_logger::RequestLog;

fn get_header(req: &Request, name: &str) -> Option<String> {
    req.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned)
}

#[allow(clippy::too_many_lines)]
pub(crate) async fn track_requests(
    State(AppState { request_logger, .. }): State<AppState>,
    matched_path: MatchedPath,
    req: Request,
    next: Next,
) -> impl IntoResponse {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let uri_string = uri.to_string();
    let query_params: HashMap<String, String> = uri
        .query()
        .map(|q| {
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
        })
        .unwrap_or_default();
    let user_agent = get_header(&req, "user-agent");
    let api_key = extract_api_key(&req).and_then(|s| s.to_str().ok().map(ToOwned::to_owned));
    let referer = get_header(&req, "referer");
    let accept = get_header(&req, "accept");
    let accept_encoding = get_header(&req, "accept-encoding");

    // Get client IP from various headers (prefer CF-Connecting-IP for Cloudflare)
    let client_ip = get_header(&req, "cf-connecting-ip")
        .or_else(|| {
            get_header(&req, "x-forwarded-for")
                .map(|s| s.split(',').next().unwrap_or("").trim().to_owned())
        })
        .or_else(|| get_header(&req, "x-real-ip"));

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

    // Create metrics labels
    let labels = [
        ("method", method.to_string()),
        ("endpoint", matched_path.as_str().to_owned()),
        ("status", status_code.to_string()),
        (
            "user_agent",
            user_agent.clone().unwrap_or("unknown".to_owned()),
        ),
    ];
    metrics::counter!("api_requests", &labels).increment(1);
    metrics::histogram!("api_request_duration_seconds", &labels).record(duration.as_secs_f64());

    // Log to ClickHouse buffer (skip non-API routes)
    let path_str = matched_path.as_str();
    if !matches!(
        path_str,
        "/" | "/docs" | "/favicon.ico" | "/robots.txt" | "/metrics" | "/openapi.json"
    ) {
        let api_key_uuid = api_key.and_then(|k| {
            let stripped = k.strip_prefix("HEXE-").unwrap_or(&k);
            Uuid::from_str(stripped).ok()
        });
        let log = RequestLog {
            timestamp: chrono::Utc::now().timestamp_millis(),
            method: method.to_string(),
            path: path_str.to_owned(),
            uri: uri_string,
            query_params,
            status_code,
            duration_ms: u64::try_from(duration.as_millis()).unwrap_or(u64::MAX),
            user_agent,
            api_key: api_key_uuid,
            client_ip,
            response_size,
            content_type,
            referer,
            accept,
            accept_encoding,
            rate_limit_remaining,
            rate_limit_reset,
        };
        request_logger.log(log).await;
    }

    response
}
