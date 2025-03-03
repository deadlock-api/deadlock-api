#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![deny(clippy::lossy_float_literal)]
#![deny(clippy::redundant_clone)]

use crate::api_doc::ApiDoc;
use axum::extract::Request;
use axum::middleware::from_fn;
use axum::response::Redirect;
use axum::routing::get;
use axum::{Router, ServiceExt};
use axum_prometheus::PrometheusMetricLayer;
use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;
use tower_http::compression::{CompressionLayer, DefaultPredicate};
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};
use tower_http::normalize_path::{NormalizePath, NormalizePathLayer};
use tower_layer::Layer;
use tracing::{debug, info};
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_scalar::{Scalar, Servable};

mod api_doc;
mod config;
mod error;
mod middleware;
mod routes;
mod state;
mod utils;

use crate::middleware::api_key::write_api_key_to_header;
use crate::middleware::cache::CacheControlMiddleware;
use crate::state::AppState;
use error::*;
use middleware::fallback;

const DEFAULT_CACHE_TIME: u64 = 60;

async fn get_router() -> ApplicationResult<NormalizePath<Router>> {
    debug!("Loading application state");
    let state = AppState::from_env().await?;
    debug!("Application state loaded");

    let (mut prometheus_layer, metric_handle) = PrometheusMetricLayer::pair();
    prometheus_layer.enable_response_body_size();

    let (router, mut api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        // Redirect root to /docs
        .route("/", get(|| async { Redirect::to("/docs") }))
        // Add application routes
        .merge(routes::router())
        // Add prometheus metrics route
        .route("/metrics", get(|| async move { metric_handle.render() }))
        .layer(prometheus_layer)
        // Add Middlewares
        .layer(from_fn(write_api_key_to_header))
        .layer(CacheControlMiddleware::new(Duration::from_secs(
            DEFAULT_CACHE_TIME,
        )))
        .layer(
            CorsLayer::default()
                .allow_headers(AllowHeaders::any())
                .allow_origin(AllowOrigin::any())
                .allow_methods(AllowMethods::any()),
        )
        .layer(CompressionLayer::<DefaultPredicate>::default())
        .fallback(fallback::fallback)
        .split_for_parts();

    let server_url = match cfg!(debug_assertions) {
        true => "http://localhost:3000",
        false => "https://api.deadlock-api.com",
    };
    api.servers = Some(vec![utoipa::openapi::Server::new(server_url)]);

    let router = router
        .with_state(state)
        .merge(Scalar::with_url("/docs", api));
    Ok(NormalizePathLayer::trim_trailing_slash().layer(router))
}

#[tokio::main]
async fn main() -> ApplicationResult<()> {
    tracing_subscriber::fmt::init();

    let router = get_router().await?;
    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, 3000));
    let listener = tokio::net::TcpListener::bind(&address).await?;
    info!("Listening on http://{address}");
    Ok(axum::serve(listener, ServiceExt::<Request>::into_make_service(router)).await?)
}
