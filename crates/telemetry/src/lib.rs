//! Logging and metrics setup shared by the services: console logs plus OTLP traces and logs,
//! (feature `prometheus`) a Prometheus scrape endpoint for the `metrics` facade, and (feature
//! `process-memory`) gauges of the process's memory by owner.

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

#[cfg(feature = "process-memory")]
pub mod process_memory;

#[cfg(feature = "prometheus")]
use core::net::SocketAddrV4;

#[cfg(feature = "prometheus")]
use metrics_exporter_prometheus::PrometheusBuilder;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_appender_tracing::layer::{OpenTelemetryTracingBridge, TracingSpanAttributes};
use opentelemetry_otlp::{LogExporter, SpanExporter, WithExportConfig as _};
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::logs::SdkLoggerProvider;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::filter::filter_fn;
use tracing_subscriber::fmt::FormatFields;
use tracing_subscriber::fmt::format::DefaultFields;
use tracing_subscriber::layer::SubscriberExt as _;
use tracing_subscriber::util::SubscriberInitExt as _;
use tracing_subscriber::{EnvFilter, Layer as _};

pub struct OtelGuard {
    tracer_provider: SdkTracerProvider,
    logger_provider: SdkLoggerProvider,
}

impl Drop for OtelGuard {
    fn drop(&mut self) {
        // The console layer of the global subscriber still logs these.
        if let Err(err) = self.tracer_provider.shutdown() {
            tracing::error!("Failed to shut down OpenTelemetry tracer provider: {err}");
        }
        if let Err(err) = self.logger_provider.shutdown() {
            tracing::error!("Failed to shut down OpenTelemetry logger provider: {err}");
        }
    }
}

fn build_otel_providers(
    endpoint: &str,
    service_name: &str,
) -> Result<(SdkTracerProvider, SdkLoggerProvider), Box<dyn core::error::Error>> {
    let resource = Resource::builder()
        .with_service_name(service_name.to_owned())
        .build();

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

/// Default `EnvFilter` directives of [`init_tracing`], used when `RUST_LOG` is unset.
pub const TOOLS_LOG_FILTER: &str = "debug,h2=warn,hyper_util=warn,reqwest=warn,rustls=warn,sqlx=warn,\
     steam_vent=info,opentelemetry_sdk=info,tower=info,opentelemetry-otlp=info";

/// How [`init_tracing_with`] sets up logging for one service.
pub struct TracingConfig<'a, N> {
    /// `service.name` of the exported traces and logs.
    pub service_name: &'a str,
    /// `EnvFilter` directives used when `RUST_LOG` is unset.
    pub default_filter: &'a str,
    /// Span fields copied onto every exported log record. None when empty.
    pub span_attributes: &'a [&'static str],
    /// Field formatter of the console log layer.
    pub console_fields: N,
}

impl<'a> TracingConfig<'a, DefaultFields> {
    /// Default console format, no span fields on exported log records.
    #[must_use]
    pub fn new(service_name: &'a str, default_filter: &'a str) -> Self {
        Self {
            service_name,
            default_filter,
            span_attributes: &[],
            console_fields: DefaultFields::new(),
        }
    }
}

/// Console logging plus OTLP export with the workers' defaults, see [`init_tracing_with`].
#[must_use]
pub fn init_tracing(service_name: &str) -> Option<OtelGuard> {
    init_tracing_with(TracingConfig::new(service_name, TOOLS_LOG_FILTER))
}

/// Installs the global subscriber: console logs, and OTLP traces and logs when
/// `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Keep the guard alive until exit, dropping it flushes
/// the exporters.
#[must_use]
pub fn init_tracing_with<N>(config: TracingConfig<'_, N>) -> Option<OtelGuard>
where
    N: for<'w> FormatFields<'w> + Send + Sync + 'static,
{
    let TracingConfig {
        service_name,
        default_filter,
        span_attributes,
        console_fields,
    } = config;
    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(default_filter));
    let fmt_layer = tracing_subscriber::fmt::layer().fmt_fields(console_fields);

    // Logged once the subscriber is up.
    let mut otel_error = None;
    let providers = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .ok()
        .and_then(
            |endpoint| match build_otel_providers(&endpoint, service_name) {
                Ok(providers) => Some((endpoint, providers)),
                Err(err) => {
                    otel_error = Some(err);
                    None
                }
            },
        );

    let (trace_layer, log_layer, guard, enabled_endpoint) = match providers {
        Some((endpoint, (tracer_provider, logger_provider))) => {
            opentelemetry::global::set_text_map_propagator(TraceContextPropagator::new());
            let trace_layer = tracing_opentelemetry::layer()
                .with_tracer(tracer_provider.tracer(service_name.to_owned()));
            let mut log_bridge = OpenTelemetryTracingBridge::builder(&logger_provider);
            if !span_attributes.is_empty() {
                log_bridge = log_bridge.with_tracing_span_attributes(
                    TracingSpanAttributes::allowlist(span_attributes.iter().copied()),
                );
            }
            let log_layer = log_bridge.build().with_filter(filter_fn(|meta| {
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

    if let Some(err) = otel_error {
        tracing::error!("Failed to initialize OpenTelemetry OTLP export: {err}");
    }
    if let Some(endpoint) = enabled_endpoint {
        tracing::info!(
            "OpenTelemetry OTLP export enabled for {service_name}, sending traces and logs to \
             {endpoint}"
        );
    }
    guard
}

#[cfg(feature = "prometheus")]
#[derive(Debug, thiserror::Error)]
pub enum MetricsError {
    #[error(transparent)]
    Addr(#[from] core::net::AddrParseError),
    #[error(transparent)]
    Install(#[from] metrics_exporter_prometheus::BuildError),
}

#[cfg(feature = "prometheus")]
pub fn init_metrics() -> Result<(), MetricsError> {
    Ok(PrometheusBuilder::new()
        .with_http_listener("0.0.0.0:9002".parse::<SocketAddrV4>()?)
        .install()?)
}
