#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![deny(clippy::lossy_float_literal)]
#![deny(clippy::redundant_clone)]

mod api_doc;
mod config;
mod error;
mod middleware;
pub mod routes;
pub mod services;
pub mod state;
pub mod utils;

use crate::api_doc::ApiDoc;
use crate::middleware::api_key::write_api_key_to_header;
use crate::middleware::cache::CacheControlMiddleware;
use crate::middleware::feature_flags::feature_flags;
use crate::state::AppState;
use crate::utils::tracing::init_tracing;
use axum::extract::Request;
use axum::http::{HeaderMap, header};
use axum::middleware::{from_fn, from_fn_with_state};
use axum::response::{IntoResponse, Redirect};
use axum::routing::get;
use axum::{Json, Router, ServiceExt};
use axum_prometheus::PrometheusMetricLayer;
use error::*;
use middleware::fallback;
use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;
use tower_http::compression::{CompressionLayer, DefaultPredicate};
use tower_http::cors::CorsLayer;
use tower_http::normalize_path::{NormalizePath, NormalizePathLayer};
use tower_layer::Layer;
use tracing::{debug, info};
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_scalar::{Scalar, Servable};

const DEFAULT_CACHE_TIME: u64 = 60;

async fn favicon() -> impl IntoResponse {
    let favicon = include_bytes!("../public/favicon.ico");
    let mut headers = HeaderMap::new();
    if let Ok(content_type) = "image/x-icon".parse() {
        headers.insert(header::CONTENT_TYPE, content_type);
    }
    (headers, favicon)
}

async fn get_router(port: u16) -> ApplicationResult<NormalizePath<Router>> {
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
        .route("/metrics", get(|| async move { metric_handle.render() }))
        .layer(prometheus_layer)
        // Add Middlewares
        .layer(from_fn(write_api_key_to_header))
        .layer(from_fn_with_state(state.clone(), feature_flags))
        .layer(CacheControlMiddleware::new(Duration::from_secs(
            DEFAULT_CACHE_TIME,
        )))
        .layer(CorsLayer::permissive())
        .layer(CompressionLayer::<DefaultPredicate>::default())
        .fallback(fallback::fallback)
        .split_for_parts();

    let server_url = match cfg!(debug_assertions) {
        true => &format!("http://localhost:{port}"),
        false => "https://api.deadlock-api.com",
    };
    api.servers = Some(vec![utoipa::openapi::Server::new(server_url)]);

    let router = router
        .with_state(state)
        .merge(Scalar::with_url("/docs", api.clone()))
        .route("/openapi.json", get(|| async { Json(api) }));
    Ok(NormalizePathLayer::trim_trailing_slash().layer(router))
}

pub async fn run_api(port: u16) -> ApplicationResult<()> {
    init_tracing();

    let router = get_router(port).await?;
    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, port));
    let listener = tokio::net::TcpListener::bind(&address).await?;
    info!("Listening on http://{address}");
    axum::serve(listener, ServiceExt::<Request>::into_make_service(router)).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::get_router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    #[ignore]
    #[tokio::test]
    async fn test_router() {
        let router = get_router(3000).await.expect("Router");

        {
            // Test docs redirect from root
            let response = router
                .clone()
                .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::SEE_OTHER)
        }

        {
            // Test docs route
            let response = router
                .clone()
                .oneshot(Request::builder().uri("/docs").body(Body::empty()).unwrap())
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::OK)
        }

        {
            // Test metrics route
            let response = router
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/metrics")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::OK)
        }
    }
}
