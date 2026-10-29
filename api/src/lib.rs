#![recursion_limit = "256"]
#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]
#![expect(
    clippy::unused_async_trait_impl,
    reason = "async-graphql's `Enum` derive emits async resolvers without `.await`"
)]

mod api_doc;
mod context;
mod error;
mod middleware;
pub mod routes;
mod services;
pub mod utils;

use core::time::Duration;

use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::middleware::{Next, from_fn, from_fn_with_state};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::{Json, Router};
use axum_prometheus::PrometheusMetricLayer;
pub use error::*;
use tower::Layer as _;
use tower::limit::GlobalConcurrencyLimitLayer;
use tower_http::compression::predicate::NotForContentType;
use tower_http::compression::{
    CompressionLayer, CompressionLevel, DefaultPredicate, Predicate as _,
};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::normalize_path::{NormalizePath, NormalizePathLayer};
use tower_http::trace::TraceLayer;
use tracing::debug;
pub use utils::observability::ConsoleFields;
use utoipa::OpenApi as _;
use utoipa_axum::router::OpenApiRouter;
use utoipa_scalar::{Scalar, Servable as _};

use crate::api_doc::ApiDoc;
use crate::context::AppState;
use crate::middleware::api_key::write_api_key_to_header;
use crate::middleware::cache::CacheControlMiddleware;
use crate::middleware::cache_bust::reject_cache_busts;
use crate::middleware::ch_client::scope_ch_client;
use crate::middleware::cors;
use crate::middleware::feature_flags::feature_flags;
use crate::middleware::request_id::request_id;
use crate::middleware::track_requests::track_requests;
use crate::services::patreon::verification_job::PatreonVerificationJob;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::observability;
use crate::utils::request::parse_api_key_str;

const DEFAULT_CACHE_TIME: u64 = 2 * 60; // Cloudflare Free Tier Minimal Cache Time
const MAX_BODY_BYTES: usize = 10 * 1024 * 1024;

pub static SHUTTING_DOWN: core::sync::atomic::AtomicBool =
    core::sync::atomic::AtomicBool::new(false);

/// Cancelled the moment a shutdown signal arrives, so long-lived streams (live SSE) can end
/// immediately instead of keeping the connection open until the container is force-killed.
pub static SHUTDOWN_TOKEN: std::sync::LazyLock<tokio_util::sync::CancellationToken> =
    std::sync::LazyLock::new(tokio_util::sync::CancellationToken::new);

/// Cancelled by [`shutdown_background_tasks`] once the server has stopped serving requests, so
/// insert batchers run their final flush and exit. Separate from [`SHUTDOWN_TOKEN`],
/// which fires before the drain while requests (and their log rows) are still arriving.
pub(crate) static BACKGROUND_SHUTDOWN: std::sync::LazyLock<tokio_util::sync::CancellationToken> =
    std::sync::LazyLock::new(tokio_util::sync::CancellationToken::new);

/// Background tasks that must finish (final flushes) before the process exits.
pub(crate) static BACKGROUND_TASKS: std::sync::LazyLock<tokio_util::task::TaskTracker> =
    std::sync::LazyLock::new(tokio_util::task::TaskTracker::new);

/// Signals background tasks to stop and waits up to `timeout` for their final flushes.
/// Call after the server stopped serving requests.
pub async fn shutdown_background_tasks(timeout: Duration) {
    BACKGROUND_SHUTDOWN.cancel();
    BACKGROUND_TASKS.close();
    if tokio::time::timeout(timeout, BACKGROUND_TASKS.wait())
        .await
        .is_err()
    {
        tracing::warn!("Background tasks did not finish within {timeout:?}, exiting anyway");
    }
}

const ROBOTS_TXT: &str = include_str!("../public/robots.txt");

/// Marks every non-2xx response `no-store`, overriding any `Cache-Control` set further in
/// (including by [`CacheControlMiddleware`]). Applied outside of every other layer that can
/// produce an error response.
async fn no_store_on_error(req: Request, next: Next) -> Response {
    let mut response = next.run(req).await;
    if !response.status().is_success() {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
    response
}

async fn favicon() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/x-icon")],
        include_bytes!("../public/favicon.ico"),
    )
}

pub async fn router(port: u16) -> Result<NormalizePath<Router>, StartupError> {
    debug!("Loading application state");
    let state = AppState::from_env().await?;
    debug!("Application state loaded");

    // Start the daily Patreon verification job for token refresh and membership sync
    if !cfg!(debug_assertions) {
        let patreon_verification_job = std::sync::Arc::new(PatreonVerificationJob::new(
            state.http_client.clone(),
            state.pg_client.clone(),
            state.feature_flags.clone(),
            state.config.patron_encryption_key.clone(),
            state.config.patreon.client_id.clone(),
            state.config.patreon.client_secret.clone(),
            state.config.patreon.redirect_uri.clone(),
        ));
        patreon_verification_job.start_background_verification();
    }

    let (mut prometheus_layer, metric_handle) = PrometheusMetricLayer::pair();
    prometheus_layer.enable_response_body_size();

    let infra = OpenApiRouter::new()
        // Redirect root to /docs
        .route("/", get(|| async { Redirect::to("/docs") }))
        // Serve favicon
        .route("/favicon.ico", get(favicon))
        // Prometheus metrics route
        .route("/metrics", get(|rk: RateLimitKey, State(state): State<AppState>| async move {
            let internal_key = parse_api_key_str(&state.config.internal_api_key);
            if rk.api_key.is_none() || rk.api_key != internal_key {
                return Err(APIError::status_msg(
                    StatusCode::FORBIDDEN,
                    "API key is required for this endpoint",
                ));
            }
            Ok(([(header::CACHE_CONTROL, "no-cache")], metric_handle.render()))
        }))
        // robots.txt
        .route("/robots.txt", get(async || ROBOTS_TXT))
        .layer(cors::public());

    let (router, mut api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(infra)
        // Add application routes
        .merge(routes::router(&state))
        .layer(prometheus_layer)
        // Add Middlewares
        .layer(from_fn_with_state(state.clone(), feature_flags))
        .layer(from_fn(reject_cache_busts))
        .layer(from_fn_with_state(state.clone(), scope_ch_client))
        .layer(from_fn_with_state(state.clone(), track_requests))
        .layer(
            CacheControlMiddleware::new(Duration::from_secs(DEFAULT_CACHE_TIME))
                .with_stale_while_revalidate(Duration::from_secs(DEFAULT_CACHE_TIME)),
        )
        // Level 1: Cloudflare always asks for brotli, and tower-http's default brotli quality 4
        // zero-fills ~16 MiB of hash tables per large body, about half the API's CPU. Quality 1
        // costs ~3x less CPU for ~15% bigger metadata and match-history bodies.
        .layer(
            CompressionLayer::new()
                .quality(CompressionLevel::Precise(1))
                .compress_when(DefaultPredicate::new().and(NotForContentType::new("text/event-stream"))),
        )
        // Both limits: `RequestBodyLimitLayer` caps streamed bodies, while the `Json`/`Bytes`
        // extractors apply their own 2 MiB default unless `DefaultBodyLimit` raises it.
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        // Global: `Router::layer` builds the layer once per route, and a plain
        // `ConcurrencyLimitLayer` would give every route its own semaphore.
        .layer(GlobalConcurrencyLimitLayer::new(1000))
        .layer(from_fn(no_store_on_error))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(observability::make_request_span)
                .on_response(observability::on_response)
                .on_failure(observability::on_failure),
        )
        // Outermost: normalize `?api_key=` / `Bearer` into `X-API-Key` before anything (the
        // request span, request tracking, rate limiting) reads the key.
        .layer(from_fn(write_api_key_to_header))
        // Outside the request span and request tracking, which both read the request id.
        .layer(from_fn(request_id))
        .split_for_parts();

    let server_url = if cfg!(debug_assertions) {
        &format!("http://localhost:{port}")
    } else {
        "https://api.deadlock-api.com"
    };
    api.servers = Some(vec![utoipa::openapi::Server::new(server_url)]);
    api_doc::fill_missing_response_descriptions(&mut api);
    state.feature_flags.register_routes(&api).await;

    let docs = Router::new()
        .merge(Scalar::with_url("/docs", api.clone()).custom_html(api_doc::SCALAR_HTML))
        .route("/openapi.json", get(|| async { Json(api) }))
        .layer(cors::public());
    let router = router.with_state(state).merge(docs);
    Ok(NormalizePathLayer::trim_trailing_slash().layer(router))
}
