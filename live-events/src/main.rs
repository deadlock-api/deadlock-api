#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::pedantic)]

use core::time::Duration;
use std::net::{Ipv4Addr, SocketAddr};

use axum::ServiceExt;
use axum::extract::Request;
use deadlock_live_events::{StartupError, router};
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

const PORT: u16 = 3000;

/// How long open streams may keep the process alive after a shutdown signal. SSE and
/// demo streams last as long as their match, so they are cut off after this.
const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);

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
    let (signalled_tx, signalled_rx) = tokio::sync::oneshot::channel();
    let server = axum::serve(listener, ServiceExt::<Request>::into_make_service(router))
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            info!("Shutdown signal received, no longer accepting connections");
            let _ = signalled_tx.send(());
        })
        .into_future();
    let grace_over = async {
        if signalled_rx.await.is_ok() {
            tokio::time::sleep(SHUTDOWN_GRACE).await;
        } else {
            core::future::pending::<()>().await;
        }
    };
    tokio::select! {
        result = server => result?,
        () = grace_over => warn!("Shutdown grace period over, closing open streams"),
    }
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            error!("Failed to listen for Ctrl-C: {e}");
            core::future::pending::<()>().await;
        }
    };
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(e) => {
                error!("Failed to listen for SIGTERM: {e}");
                core::future::pending::<()>().await;
            }
        }
    };
    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
}
