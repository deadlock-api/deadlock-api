//! Graceful shutdown on SIGTERM (container stop) or Ctrl-C.

use core::future::Future;
use std::sync::OnceLock;

use tokio_util::sync::CancellationToken;
use tracing::{error, info};

static SHUTDOWN: OnceLock<CancellationToken> = OnceLock::new();

/// A token cancelled once the process receives SIGTERM or Ctrl-C. The first call
/// installs the signal handlers, so it must run inside the tokio runtime.
#[must_use]
pub fn shutdown_token() -> CancellationToken {
    SHUTDOWN
        .get_or_init(|| {
            let token = CancellationToken::new();
            let cancel = token.clone();
            tokio::spawn(async move {
                wait_for_signal().await;
                info!("Received shutdown signal");
                cancel.cancel();
            });
            token
        })
        .clone()
}

/// Runs `fut` until it finishes or a shutdown signal arrives, whichever is first. For
/// loops that keep no state worth flushing: on shutdown the work in progress is dropped
/// and `Ok(())` is returned, so `main` returns and the telemetry guards flush.
pub async fn run_until_shutdown<F>(fut: F) -> anyhow::Result<()>
where
    F: Future<Output = anyhow::Result<()>>,
{
    let shutdown = shutdown_token();
    tokio::select! {
        result = fut => result,
        () = shutdown.cancelled() => {
            info!("Shutting down");
            Ok(())
        }
    }
}

async fn wait_for_signal() {
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            error!("Failed to listen for Ctrl-C: {e}");
            core::future::pending::<()>().await;
        }
    };
    #[cfg(unix)]
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
    #[cfg(not(unix))]
    let terminate = core::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
}
