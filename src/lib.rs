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

mod demo;
mod demo_parser;
mod error;
mod events;
mod state;
pub mod utils;

use axum::Router;
use axum::routing::get;
pub use error::*;
use tower_http::cors::CorsLayer;
use tower_http::normalize_path::{NormalizePath, NormalizePathLayer};
use tower_layer::Layer;
use tracing::debug;

use crate::state::AppState;

pub fn router() -> Result<NormalizePath<Router>, StartupError> {
    debug!("Loading application state");
    let state = AppState::from_env()?;
    debug!("Application state loaded");

    let router = Router::new()
        .route(
            "/v1/matches/{match_id}/live/demo/events",
            get(events::events),
        )
        .route("/v1/matches/{match_id}/live/demo", get(demo::demo))
        .route("/v1/live/demo/events", get(events::events_by_broadcast_url))
        .route("/v1/live/demo", get(demo::demo_by_broadcast_url))
        .layer(CorsLayer::permissive())
        .with_state(state);
    Ok(NormalizePathLayer::trim_trailing_slash().layer(router))
}
