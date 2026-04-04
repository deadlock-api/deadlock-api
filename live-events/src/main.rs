#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::pedantic)]

use std::net::{Ipv4Addr, SocketAddr};

use axum::ServiceExt;
use axum::extract::Request;
use deadlock_live_events::{StartupError, router};
use tracing::info;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

const PORT: u16 = 3000;

fn init_tracing() {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new(
        "debug,hyper_util=warn,tower_http=info,reqwest=warn,rustls=warn,sqlx=warn,h2=warn",
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

    let router = router()?;
    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, PORT));
    let listener = tokio::net::TcpListener::bind(&address).await?;

    info!("Listening on http://{address}");
    axum::serve(listener, ServiceExt::<Request>::into_make_service(router)).await?;
    Ok(())
}
