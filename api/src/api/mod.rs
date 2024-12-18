use crate::state::AppState;
use axum::extract::State;
use log::warn;
use redis::AsyncCommands;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

mod v1;
mod v2;

#[utoipa::path(
    method(get, head),
    path = "/health",
    responses(
        (status = OK, body = String),
        (status = INTERNAL_SERVER_ERROR, body = String)
    )
)]
async fn health_check(State(mut state): State<AppState>) -> Result<&'static str, &'static str> {
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

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(health_check))
        .nest("/v2", v2::router())
        .nest("/v1", v1::router())
}
