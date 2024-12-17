#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![deny(clippy::panic)]
#![deny(clippy::lossy_float_literal)]
#![deny(clippy::redundant_clone)]

use error::ApplicationError;
use log::debug;
use salvo::__private::tracing::info;
use salvo::prelude::*;
use salvo::Server;

mod api;
mod error;
mod state;

#[tokio::main]
async fn main() -> Result<(), ApplicationError> {
    tracing_subscriber::fmt::init();

    debug!("Loading application state");
    let state = state::AppState::from_env().await?;
    debug!("Application state loaded");

    // Add Documentation Routes
    let router = Router::new()
        .hoop(affix_state::inject(state))
        .push(api::router());

    info!("Configured Routes\n{:?}", router.routers);

    let acceptor = TcpListener::new("0.0.0.0:3000").bind().await;
    Server::new(acceptor).serve(router).await;
    Ok(())
}
