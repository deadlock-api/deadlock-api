use deadlock_api_rust::run_api;
use reqwest::StatusCode;

#[tokio::test]
async fn test_api_health() {
    // Start app
    let handle = tokio::spawn(run_api());

    // Check health
    let health = tryhard::retry_fn(|| reqwest::get("http://localhost:3000/v1/info/health"))
        .retries(30)
        .fixed_backoff(tokio::time::Duration::from_secs(1))
        .await
        .expect("Failed to get health");

    let status = health.status();
    handle.abort();

    match status {
        StatusCode::OK => println!("{:#?}", health.text().await),
        status => panic!("App is not healthy: {status}"),
    }
}
