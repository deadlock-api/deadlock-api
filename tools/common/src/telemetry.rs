use core::net::SocketAddrV4;

use metrics_exporter_prometheus::PrometheusBuilder;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge;
use opentelemetry_otlp::{LogExporter, SpanExporter, WithExportConfig};
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::logs::SdkLoggerProvider;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::filter::filter_fn;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};

pub struct OtelGuard {
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

#[must_use]
pub fn init_tracing(service_name: &str) -> Option<OtelGuard> {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new(
        "debug,h2=warn,hyper_util=warn,reqwest=warn,rustls=warn,sqlx=warn,steam_vent=info,\
         opentelemetry_sdk=info,tower=info,opentelemetry-otlp=info",
    ));
    let fmt_layer = tracing_subscriber::fmt::layer();

    let providers = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .ok()
        .and_then(
            |endpoint| match build_otel_providers(&endpoint, service_name) {
                Ok(providers) => Some((endpoint, providers)),
                Err(err) => {
                    eprintln!("Failed to initialize OpenTelemetry OTLP export: {err}");
                    None
                }
            },
        );

    let (trace_layer, log_layer, guard, enabled_endpoint) = match providers {
        Some((endpoint, (tracer_provider, logger_provider))) => {
            opentelemetry::global::set_text_map_propagator(TraceContextPropagator::new());
            let trace_layer = tracing_opentelemetry::layer()
                .with_tracer(tracer_provider.tracer(service_name.to_owned()));
            let log_layer =
                OpenTelemetryTracingBridge::new(&logger_provider).with_filter(filter_fn(|meta| {
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
        tracing::info!(
            "OpenTelemetry OTLP export enabled for {service_name}, sending traces and logs to \
             {endpoint}"
        );
    }
    guard
}

pub fn init_metrics() -> anyhow::Result<()> {
    Ok(PrometheusBuilder::new()
        .with_http_listener("0.0.0.0:9002".parse::<SocketAddrV4>()?)
        .install()?)
}
