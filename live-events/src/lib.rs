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
use tower_layer::Layer as _;
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
