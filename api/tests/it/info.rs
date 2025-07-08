use deadlock_api_rust::routes::v1::info::health::Status;
use deadlock_api_rust::routes::v1::info::route::APIInfo;

use crate::request_endpoint;

#[tokio::test]
async fn test_info() {
    let response = request_endpoint("/v1/info", []).await;
    let info: APIInfo = response.json().await.expect("Failed to parse response");

    let expected_table_sizes = [
        ("match_salts", 100),
        ("match_info", 100),
        ("match_player", 1200),
    ];
    for (table, expected_rows) in expected_table_sizes {
        let table_sizes = info
            .table_sizes
            .as_ref()
            .expect("Failed to find table sizes");
        let rows = table_sizes
            .get(table)
            .and_then(|t| t.rows)
            .expect("Failed to find table size for {table}");
        assert_eq!(rows, expected_rows);
    }
}

#[tokio::test]
async fn test_health() {
    let response = request_endpoint("/v1/info/health", []).await;
    let status: Status = response.json().await.expect("Failed to parse response");
    assert!(status.services.all_ok());
}
