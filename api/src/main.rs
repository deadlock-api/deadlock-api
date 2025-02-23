#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![deny(clippy::lossy_float_literal)]
#![deny(clippy::redundant_clone)]

use crate::api_doc::ApiDoc;
use axum::response::{Html, Redirect};
use axum::routing::get;
use log::{debug, info};
use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;
use tower_http::compression::{CompressionLayer, DefaultPredicate};
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_scalar::Scalar;

mod api_doc;
mod config;
mod error;
mod middleware;
mod routes;
mod state;
mod utils;

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

    let docs = Scalar::new(api).to_html();

    let router = router
        .with_state(state)
        .route("/docs", get(async move || Html(docs.clone())));

    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, 3000));
    let listener = tokio::net::TcpListener::bind(&address).await?;
    info!("Listening on http://{}", address);
    Ok(axum::serve(listener, router.into_make_service()).await?)
}
