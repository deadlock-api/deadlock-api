use metrics_exporter_prometheus::{BuildError, PrometheusBuilder};
use opentelemetry::KeyValue;
use opentelemetry::trace::TracerProvider;
use opentelemetry_otlp::{ExportConfig, Protocol, WithExportConfig};
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::trace::{RandomIdGenerator, SdkTracerProvider};
use opentelemetry_semantic_conventions::SCHEMA_URL;
use opentelemetry_semantic_conventions::attribute::{
    DEPLOYMENT_ENVIRONMENT_NAME, SERVICE_NAME, SERVICE_VERSION,
};
use std::env;
use std::net::SocketAddrV4;
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

pub struct OtelGuard(SdkTracerProvider);

impl Drop for OtelGuard {
    fn drop(&mut self) {
        if let Err(err) = self.0.shutdown() {
            eprintln!("{err:?}");
        }
    }
}

fn resource(pkg_name: &str) -> Resource {
    let attrs = [
        KeyValue::new(SERVICE_NAME, pkg_name.to_string()),
        KeyValue::new(SERVICE_VERSION, env!("CARGO_PKG_VERSION")),
        KeyValue::new(
            DEPLOYMENT_ENVIRONMENT_NAME,
            if cfg!(debug_assertions) {
                "develop"
            } else {
                "production"
            },
        ),
    ];
    Resource::builder()
        .with_schema_url(attrs.clone(), SCHEMA_URL)
        .with_attributes(attrs)
        .build()
}

fn init_tracer_provider(pkg_name: &str) -> SdkTracerProvider {
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_export_config(ExportConfig {
            endpoint: Some("http://11.0.0.44:4317".to_string()),
            protocol: Protocol::Grpc,
            ..Default::default()
        })
        .build()
        .unwrap();

    SdkTracerProvider::builder()
        .with_id_generator(RandomIdGenerator::default())
        .with_resource(resource(pkg_name))
        .with_batch_exporter(exporter)
        .build()
}

pub fn init_tracing(pkg_name: &str) -> OtelGuard {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new(
        "debug,h2=warn,hyper_util=warn,reqwest=warn,rustls=warn,sqlx=warn,steam_vent=info",
    ));
    let fmt_layer = tracing_subscriber::fmt::layer();

    let tracer_provider = init_tracer_provider(pkg_name);
    let tracer = tracer_provider.tracer("tracing-otel-subscriber");
    let telemetry_layer = OpenTelemetryLayer::new(tracer);

    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(env_filter)
        .with(telemetry_layer)
        .init();

    OtelGuard(tracer_provider)
}

pub fn init_metrics() -> Result<(), BuildError> {
    PrometheusBuilder::new()
        .with_http_listener("0.0.0.0:9002".parse::<SocketAddrV4>().unwrap())
        .install()
}
