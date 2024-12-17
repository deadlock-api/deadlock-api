use log::warn;
use redis::AsyncCommands;
use salvo::{handler, Depot, Router};

mod v1;
mod v2;

#[handler]
async fn health_check(depot: &mut Depot) -> Result<&'static str, &'static str> {
    let Ok(state) = depot.obtain_mut::<crate::state::AppState>() else {
        return Err("State not found");
    };

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

pub fn router() -> Router {
    Router::new()
        .push(
            Router::with_path("/health")
                .get(health_check)
                .head(health_check),
        )
        .push(Router::with_path("/v2").push(v2::router()))
        .push(Router::with_path("/v1").push(v1::router()))
}
