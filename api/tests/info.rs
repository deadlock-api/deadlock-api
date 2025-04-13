mod utils;

use deadlock_api_rust::routes::v1::info::api_info::APIInfo;
use deadlock_api_rust::routes::v1::info::health::Status;

#[tokio::test]
async fn test_info() {
    let response = utils::request_endpoint("/v1/info").await;
    let info: APIInfo = response.json().await.expect("Failed to parse response");

    assert_eq!(
        info.table_sizes
            .get("active_matches")
            .and_then(|t| t.rows)
            .unwrap(),
        20
    );
    for table in ["match_info", "match_salts", "match_player"] {
        assert_eq!(info.table_sizes.get(table).and_then(|t| t.rows).unwrap(), 5);
    }
}

#[tokio::test]
async fn test_health() {
    let response = utils::request_endpoint("/v1/info/health").await;
    let status: Status = response.json().await.expect("Failed to parse response");
    assert!(status.services.all_ok());
}
