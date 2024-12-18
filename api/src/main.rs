#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![deny(clippy::lossy_float_literal)]
#![deny(clippy::redundant_clone)]

use crate::api_doc::ApiDoc;
use axum::response::Redirect;
use axum::routing::get;
use error::ApplicationError;
use log::{debug, info};
use std::net::{Ipv4Addr, SocketAddr};
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_swagger_ui::SwaggerUi;

mod api;
mod api_doc;
mod error;
mod limiter;
mod state;

#[tokio::main]
async fn main() -> Result<(), ApplicationError> {
    tracing_subscriber::fmt::init();

    debug!("Loading application state");
    let state = state::AppState::from_env().await?;
    debug!("Application state loaded");

    let (router, api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .route("/", get(|| async { Redirect::to("/docs") }))
        .merge(api::router())
        .split_for_parts();

    let router = router
        .with_state(state)
        .merge(SwaggerUi::new("/docs").url("/openapi.json", api));

    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, 3000));
    let listener = tokio::net::TcpListener::bind(&address).await?;
    info!("Listening on http://{}", address);
    Ok(axum::serve(listener, router.into_make_service()).await?)
}
