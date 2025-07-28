#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::pedantic)]

use std::net::{Ipv4Addr, SocketAddr};

use axum::ServiceExt;
use axum::extract::Request;
use deadlock_api_rust::{StartupError, router};
use mimalloc::MiMalloc;
use tracing::info;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

const PORT: u16 = 3000;

fn init_tracing() {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new(
        "debug,hyper_util=warn,tower_http=info,reqwest=warn,rustls=warn,sqlx=warn",
    ));
    let fmt_layer = tracing_subscriber::fmt::layer();

    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(env_filter)
        .init();
}

#[tokio::main]
async fn main() -> Result<(), StartupError> {
    init_tracing();

    let router = router(PORT).await?;
    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, PORT));
    let listener = tokio::net::TcpListener::bind(&address).await?;

    info!("Listening on http://{address}");
    axum::serve(listener, ServiceExt::<Request>::into_make_service(router)).await?;
    Ok(())
}
