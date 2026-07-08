#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::pedantic)]

use std::net::{Ipv4Addr, SocketAddr};

use axum::ServiceExt;
use axum::extract::Request;
use deadlock_api_rust::{ConsoleFields, StartupError, router};
use mimalloc::MiMalloc;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_appender_tracing::layer::{OpenTelemetryTracingBridge, TracingSpanAttributes};
use opentelemetry_otlp::{LogExporter, SpanExporter, WithExportConfig};
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::logs::SdkLoggerProvider;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tokio::signal::unix::{SignalKind, signal};
use tracing::info;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::Layer;
use tracing_subscriber::filter::filter_fn;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

const PORT: u16 = 3000;
const SERVICE_NAME: &str = "deadlock-api";
const DRAIN_DELAY: core::time::Duration = core::time::Duration::from_secs(8);

struct OtelGuard {
    tracer_provider: SdkTracerProvider,
    logger_provider: SdkLoggerProvider,
}

impl Drop for OtelGuard {
    fn drop(&mut self) {
        if let Err(err) = self.tracer_provider.shutdown() {
            eprintln!("Failed to shut down OpenTelemetry tracer provider: {err}");
        }
        if let Err(err) = self.logger_provider.shutdown() {
            eprintln!("Failed to shut down OpenTelemetry logger provider: {err}");
        }
    }
}

fn build_otel_providers(
    endpoint: &str,
) -> Result<(SdkTracerProvider, SdkLoggerProvider), Box<dyn core::error::Error>> {
    let resource = Resource::builder().with_service_name(SERVICE_NAME).build();

    let span_exporter = SpanExporter::builder()
        .with_tonic()
        .with_endpoint(endpoint)
        .build()?;
    let tracer_provider = SdkTracerProvider::builder()
        .with_resource(resource.clone())
        .with_batch_exporter(span_exporter)
        .build();

    let log_exporter = LogExporter::builder()
        .with_tonic()
        .with_endpoint(endpoint)
        .build()?;
    let logger_provider = SdkLoggerProvider::builder()
        .with_resource(resource)
        .with_batch_exporter(log_exporter)
        .build();

    Ok((tracer_provider, logger_provider))
}

fn init_tracing() -> Option<OtelGuard> {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new(
        "debug,hyper_util=warn,tower_http=info,reqwest=warn,rustls=warn,sqlx=warn,h2=warn,datafusion=warn,datafusion_optimizer=warn",
    ));
    let fmt_layer = tracing_subscriber::fmt::layer().fmt_fields(ConsoleFields::default());

    let providers = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .ok()
        .and_then(|endpoint| match build_otel_providers(&endpoint) {
            Ok(providers) => Some((endpoint, providers)),
            Err(err) => {
                eprintln!("Failed to initialize OpenTelemetry OTLP export: {err}");
                None
            }
        });

    let (trace_layer, log_layer, guard, enabled_endpoint) = match providers {
        Some((endpoint, (tracer_provider, logger_provider))) => {
            opentelemetry::global::set_text_map_propagator(TraceContextPropagator::new());
            let trace_layer =
                tracing_opentelemetry::layer().with_tracer(tracer_provider.tracer(SERVICE_NAME));
            let log_layer = OpenTelemetryTracingBridge::builder(&logger_provider)
                .with_tracing_span_attributes(TracingSpanAttributes::allowlist([
                    "http.route",
                    "http.request.method",
                    "http.response.status_code",
                    "url.full",
                    "http.request.id",
                    "user_agent.original",
                    "client.address",
                    "deadlock.api_key",
                ]))
                .build()
                .with_filter(filter_fn(|meta| {
                    !meta.target().starts_with("opentelemetry")
                }));
            let guard = OtelGuard {
                tracer_provider,
                logger_provider,
            };
            (
                Some(trace_layer),
                Some(log_layer),
                Some(guard),
                Some(endpoint),
            )
        }
        None => (None, None, None, None),
    };

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer)
        .with(trace_layer)
        .with(log_layer)
        .init();

    if let Some(endpoint) = enabled_endpoint {
        info!("OpenTelemetry OTLP export enabled, sending traces and logs to {endpoint}");
    }
    guard
}

async fn shutdown_signal() {
    let interrupt = async {
        signal(SignalKind::interrupt())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    let terminate = async {
        signal(SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

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
    let _otel_guard = init_tracing();

    let router = router(PORT).await?;
    let address = SocketAddr::from((Ipv4Addr::UNSPECIFIED, PORT));
    let listener = tokio::net::TcpListener::bind(&address).await?;

    info!("Listening on http://{address}");
    let make_service = ServiceExt::<Request>::into_make_service(router);
    axum::serve(listener, make_service)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}
