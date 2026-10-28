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

use core::net::{Ipv4Addr, SocketAddr};

use axum::ServiceExt;
use axum::extract::Request;
use deadlock_api_rust::{ConsoleFields, StartupError, router};
use mimalloc::MiMalloc;
use tokio::signal::unix::{SignalKind, signal};
use tracing::{error, info};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

const PORT: u16 = 3000;
const SERVICE_NAME: &str = "deadlock-api";
const DRAIN_DELAY: core::time::Duration = core::time::Duration::from_secs(8);
/// Upper bound for the final background flushes (request logs, insert batchers) after the server
/// stopped. Drain + flush stay well within the container's 60s stop grace period.
const FINAL_FLUSH_TIMEOUT: core::time::Duration = core::time::Duration::from_secs(20);

/// Span fields copied onto every exported log record.
const OTEL_LOG_SPAN_ATTRIBUTES: &[&str] = &[
    "http.route",
    "http.request.method",
    "http.response.status_code",
    "url.full",
    "http.request.id",
    "user_agent.original",
    "client.address",
    "deadlock.api_key",
];

/// Resolves on the first `kind` signal; never, when its handler can't be installed.
async fn wait_for_signal(kind: SignalKind, name: &str) {
    match signal(kind) {
        Ok(mut stream) => {
            stream.recv().await;
        }
        Err(e) => {
            error!("Failed to install the {name} handler: {e}");
            core::future::pending::<()>().await;
        }
    }
}

async fn shutdown_signal() {
    let interrupt = wait_for_signal(SignalKind::interrupt(), "SIGINT");
    let terminate = wait_for_signal(SignalKind::terminate(), "SIGTERM");

    tokio::select! {
        () = interrupt => {},
        () = terminate => {},
    }

    info!("Shutdown signal received, draining for {DRAIN_DELAY:?} before stopping");
    deadlock_api_rust::SHUTTING_DOWN.store(true, core::sync::atomic::Ordering::Relaxed);
    // Close long-lived streams (live SSE) right away so they don't hold connections open through
    // the drain and block graceful shutdown until the container is force-killed.
    deadlock_api_rust::SHUTDOWN_TOKEN.cancel();
    #[cfg(not(debug_assertions))]
    tokio::time::sleep(DRAIN_DELAY).await;
}

#[tokio::main]
async fn main() -> Result<(), StartupError> {
    let _otel_guard = telemetry::init_tracing_with(telemetry::TracingConfig {
        service_name: SERVICE_NAME,
        default_filter: "debug,hyper_util=warn,tower_http=info,reqwest=warn,rustls=warn,sqlx=warn,h2=warn,\
             datafusion=warn,datafusion_optimizer=warn,sqlparser=info,haste_broadcast=info",
        span_attributes: OTEL_LOG_SPAN_ATTRIBUTES,
        console_fields: ConsoleFields::default(),
    });

    let router = router(PORT).await?;
    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, PORT));
    let listener = tokio::net::TcpListener::bind(&address).await?;

    info!("Listening on http://{address}");
    let make_service = ServiceExt::<Request>::into_make_service(router);
    axum::serve(listener, make_service)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Server stopped, flushing background batchers");
    deadlock_api_rust::shutdown_background_tasks(FINAL_FLUSH_TIMEOUT).await;
    Ok(())
}
