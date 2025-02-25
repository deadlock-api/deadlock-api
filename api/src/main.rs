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
use axum::ServiceExt;
use log::{debug, info};
use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;
use tower_http::compression::{CompressionLayer, DefaultPredicate};
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};
use tower_http::normalize_path::NormalizePathLayer;
use tower_layer::Layer;
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
use error::*;

const DEFAULT_CACHE_TIME: u64 = 60;

#[tokio::main]
async fn main() -> ApplicationResult<()> {
    tracing_subscriber::fmt::init();

    debug!("Loading application state");
    let state = state::AppState::from_env().await?;
    debug!("Application state loaded");

    let (router, api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .route("/", get(|| async { Redirect::to("/docs") }))
        .merge(routes::router())
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
        .split_for_parts();

    let router = router
        .with_state(state)
        .merge(Scalar::with_url("/docs", api));
    let router = NormalizePathLayer::trim_trailing_slash().layer(router);

    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, 3000));
    let listener = tokio::net::TcpListener::bind(&address).await?;
    info!("Listening on http://{}", address);
    Ok(axum::serve(listener, ServiceExt::<Request>::into_make_service(router)).await?)
}
