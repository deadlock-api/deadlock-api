use deadlock_api_rust::routes::v1::sql::route::TableSchemaRow;
use rstest::rstest;

use crate::request_endpoint;

#[tokio::test]
async fn test_list_tables() {
    let response = request_endpoint("/v1/sql/tables", []).await;
    let tables: Vec<String> = response.json().await.expect("Failed to parse response");
    assert!(tables.len() >= 5);
}

#[rstest]
#[case("items")]
#[case("match_player")]
#[tokio::test]
async fn test_table_schema(#[case] table: &str) {
    let response = request_endpoint(&format!("/v1/sql/tables/{table}/schema"), []).await;
    let schema: Vec<TableSchemaRow> = response.json().await.expect("Failed to parse response");
    assert!(!schema.is_empty());
}

#[tokio::test]
async fn test_sql_query_literal() {
    let response = request_endpoint("/v1/sql", [("query", "SELECT 1")]).await;
    let result: Vec<serde_json::Value> = response.json().await.expect("Failed to parse response");
    assert_eq!(result, vec![serde_json::json!({"1": 1})]);
}

#[rstest]
#[case("SELECT COUNT() as count FROM match_player")]
#[tokio::test]
async fn test_sql_query_count(#[case] query: &str) {
    let response = request_endpoint("/v1/sql", [("query", query)]).await;
    let result: Vec<serde_json::Value> = response.json().await.expect("Failed to parse response");
    assert_eq!(result.len(), 1);
    let count = result[0]["count"]
        .as_u64()
        .expect("count should be a number");
    assert!(count > 0, "table should have rows, got {count}");
}

#[rstest]
#[case("DROP TABLE match_player")]
#[case("TRUNCATE TABLE match_player")]
#[case("ALTER TABLE match_player ADD COLUMN test String")]
#[case("INSERT INTO match_player (match_id, start_time) VALUES (1, 1)")]
#[case("UPDATE match_player SET start_time = 1 WHERE match_id = 1")]
#[case("DELETE FROM match_player WHERE match_id = 1")]
#[case("CREATE TABLE test (test String)")]
#[case("SELECT username FROM match_salts")] // username is restricted
#[case("DROP USER default")]
#[case("KILL QUERY WHERE query_id = '123'")]
#[case("GRANT DELETE ON default.* TO api_readonly_user")]
#[tokio::test]
#[should_panic(expected = "Status code is not 200")]
async fn test_bad_sql_query(#[case] query: &str) {
    request_endpoint("/v1/sql", [("query", query)]).await;
}
