use deadlock_api_rust::run_api;

#[tokio::main]
async fn main() {
    run_api(3000).await.expect("Failed to run api server");
}
