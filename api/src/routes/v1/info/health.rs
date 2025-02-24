use crate::state::AppState;
use axum::extract::State;
use log::warn;
use redis::AsyncCommands;

#[utoipa::path(
    get,
    path = "/health",
    responses(
        (status = OK, body = String),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["Info"],
)]
pub async fn health_check(State(mut state): State<AppState>) -> Result<&'static str, &'static str> {
    // Check Clickhouse connection
    if state
        .clickhouse_client
        .query("SELECT 1")
        .execute()
        .await
        .is_err()
    {
        return Err("Clickhouse Connection Error");
    }

    // Check Postgres connection
    if state.postgres_client.is_closed() {
        return Err("Postgres Connection Error");
    }

    // Check Redis connection
    if let Err(e) = state
        .redis_client
        .exists::<&str, bool>("health_check")
        .await
    {
        warn!("Redis connection error: {}", e);
        return Err("Redis Connection Error");
    }

    Ok("OK")
}
