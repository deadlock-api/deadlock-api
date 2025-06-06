mod utils;

use deadlock_api_rust::routes::v1::sql::route::TableSchemaRow;
use rstest::rstest;

#[tokio::test]
async fn test_list_tables() {
    let response = utils::request_endpoint("/v1/sql/tables", []).await;
    let tables: Vec<String> = response.json().await.expect("Failed to parse response");
    assert!(tables.len() >= 5);
}

#[rstest]
#[case("items")]
#[case("match_info")]
#[case("match_player")]
#[case("mmr_history")]
#[tokio::test]
async fn test_table_schema(#[case] table: &str) {
    let response = utils::request_endpoint(&format!("/v1/sql/tables/{table}/schema"), []).await;
    let schema: Vec<TableSchemaRow> = response.json().await.expect("Failed to parse response");
    assert!(!schema.is_empty());
}

#[rstest]
#[case("SELECT 1", r#"[{"1":1}]"#)]
#[case("SELECT COUNT() as count FROM match_info", r#"[{"count":100}]"#)]
#[case("SELECT COUNT() as count FROM match_player", r#"[{"count":1200}]"#)]
#[tokio::test]
async fn test_sql_query(#[case] query: &str, #[case] expected: &str) {
    let response = utils::request_endpoint("/v1/sql", [("query", query)]).await;
    let result: Vec<serde_json::Value> = response.json().await.expect("Failed to parse response");
    let expected: Vec<serde_json::Value> =
        serde_json::from_str(expected).expect("Failed to parse expected");
    assert_eq!(result.len(), expected.len());
    for (row, expected) in result.iter().zip(expected.iter()) {
        assert_eq!(row.as_str(), expected.as_str());
    }
}

#[rstest]
#[case("DROP TABLE match_info")]
#[case("TRUNCATE TABLE match_info")]
#[case("ALTER TABLE match_info ADD COLUMN test String")]
#[case("INSERT INTO match_info (match_id, start_time) VALUES (1, 1)")]
#[case("UPDATE match_info SET start_time = 1 WHERE match_id = 1")]
#[case("DELETE FROM match_info WHERE match_id = 1")]
#[case("CREATE TABLE test (test String)")]
#[case("SELECT username FROM match_salts")] // username is restricted
#[case("DROP USER default")]
#[case("KILL QUERY WHERE query_id = '123'")]
#[case("GRANT DELETE ON default.* TO api_readonly_user")]
#[tokio::test]
#[should_panic]
async fn test_bad_sql_query(#[case] query: &str) {
    utils::request_endpoint("/v1/sql", [("query", query)]).await;
}
