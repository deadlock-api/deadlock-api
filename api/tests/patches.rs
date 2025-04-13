mod utils;

#[tokio::test]
async fn test_patches_big_days() {
    let response = utils::request_endpoint("/v1/patches/big-days").await;
    let patches: Vec<String> = response.json().await.expect("Failed to parse response");
    assert!(patches.len() > 7);
}

#[tokio::test]
async fn test_patches_feed() {
    let response = utils::request_endpoint("/v1/patches").await;
    let patches: Vec<serde_json::Value> = response.json().await.expect("Failed to parse response");
    assert!(patches.len() > 7);
}
