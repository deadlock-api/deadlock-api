#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::correctness)]
#![deny(clippy::suspicious)]
#![deny(clippy::style)]
#![deny(clippy::complexity)]
#![deny(clippy::perf)]
#![deny(clippy::pedantic)]
#![deny(clippy::std_instead_of_core)]
#![allow(clippy::unreadable_literal)]
#![allow(clippy::missing_errors_doc)]
#![allow(clippy::needless_for_each)] // This is currently caused by an issue in utoipa, see: https://github.com/juhaku/utoipa/pull/1423

mod api_doc;
mod context;
mod error;
mod middleware;
pub mod routes;
mod services;
pub mod utils;

use core::time::Duration;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::middleware::{from_fn, from_fn_with_state};
use axum::response::{IntoResponse, Redirect};
use axum::routing::get;
use axum::{Json, Router};
use axum_prometheus::PrometheusMetricLayer;
pub use error::*;
use tower_http::compression::predicate::NotForContentType;
use tower_http::compression::{CompressionLayer, DefaultPredicate, Predicate};
use tower_http::cors::CorsLayer;
use tower_http::normalize_path::{NormalizePath, NormalizePathLayer};
use tower_layer::Layer;
use tracing::debug;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_scalar::{Scalar, Servable};

use crate::api_doc::ApiDoc;
use crate::context::AppState;
use crate::middleware::api_key::write_api_key_to_header;
use crate::middleware::cache::CacheControlMiddleware;
use crate::middleware::feature_flags::feature_flags;
use crate::middleware::track_requests::track_requests;
use crate::services::rate_limiter::extractor::RateLimitKey;

const DEFAULT_CACHE_TIME: u64 = 2 * 60; // Cloudflare Free Tier Minimal Cache Time

const ROBOTS_TXT: &str = r"
User-agent: *
Disallow: /
Allow: /docs
";

async fn favicon() -> impl IntoResponse {
    let favicon = include_bytes!("../public/favicon.ico");
    let mut headers = HeaderMap::new();
    if let Ok(content_type) = "image/x-icon".parse() {
        headers.insert(header::CONTENT_TYPE, content_type);
    }
    (headers, favicon)
}

pub async fn router(port: u16) -> Result<NormalizePath<Router>, StartupError> {
    debug!("Loading application state");
    let state = AppState::from_env().await?;
    debug!("Application state loaded");

    let (mut prometheus_layer, metric_handle) = PrometheusMetricLayer::pair();
    prometheus_layer.enable_response_body_size();

    let (router, mut api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        // Redirect root to /docs
        .route("/", get(|| async { Redirect::to("/docs") }))
        // Serve favicon
        .route("/favicon.ico", get(favicon))
        // Add application routes
        .merge(routes::router())
        // Add prometheus metrics route
        .route("/metrics", get(|rk: RateLimitKey, State(AppState{config, ..}): State<AppState>| async move {
            let internal_key = config.internal_api_key.strip_prefix("HEXE-").unwrap_or(&config.internal_api_key);
            if rk.api_key.is_none_or(|k| k.to_string() != internal_key) {
                return Err(APIError::status_msg(
                    StatusCode::FORBIDDEN,
                    "API key is required for this endpoint",
                ));
            }
            let mut headers = HeaderMap::new();
            if let Ok(value) = "no-cache".parse() {
                headers.append(header::CACHE_CONTROL, value);
            }
            Ok((headers, metric_handle.render()))
        }))
        .layer(prometheus_layer)
        // Add robots.txt
        .route("/robots.txt", get(async || ROBOTS_TXT))
        // Add Middlewares
        .layer(from_fn_with_state(state.clone(), feature_flags))
        .layer(from_fn(write_api_key_to_header))
        .layer(from_fn_with_state(state.clone(), track_requests))
        .layer(
            CacheControlMiddleware::new(Duration::from_secs(DEFAULT_CACHE_TIME))
                .with_stale_if_error(Duration::from_secs(DEFAULT_CACHE_TIME))
                .with_stale_while_revalidate(Duration::from_secs(DEFAULT_CACHE_TIME)),
        )
        .layer(CorsLayer::permissive())
        .layer(CompressionLayer::new().compress_when(DefaultPredicate::new().and(NotForContentType::new("text/event-stream"))))
        .split_for_parts();

    let server_url = if cfg!(debug_assertions) {
        &format!("http://localhost:{port}")
    } else {
        "https://api.deadlock-api.com"
    };
    api.servers = Some(vec![utoipa::openapi::Server::new(server_url)]);

    let router = router
        .with_state(state)
        .merge(Scalar::with_url("/docs", api.clone()))
        .route("/openapi.json", get(|| async { Json(api) }));
    Ok(NormalizePathLayer::trim_trailing_slash().layer(router))
}
