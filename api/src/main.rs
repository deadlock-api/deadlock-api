use deadlock_api_rust::run_api;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

pub fn init_tracing() {
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
async fn main() {
    init_tracing();
    run_api(3000).await.expect("Failed to run api server");
}
