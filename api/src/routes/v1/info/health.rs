use crate::context::AppState;
use crate::error::{APIError, APIResult};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use cached::TimedCache;
use cached::proc_macro::cached;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Pool, Postgres};
use utoipa::ToSchema;

#[derive(Debug, Copy, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct StatusServices {
    /// Whether Clickhouse is reachable.
    clickhouse: bool,
    /// Whether Postgres is reachable.
    postgres: bool,
    /// Whether Redis is reachable.
    redis: bool,
}

impl StatusServices {
    #[must_use]
    pub fn all_ok(&self) -> bool {
        self.clickhouse && self.postgres && self.redis
    }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct Status {
    /// Status of the services.
    pub services: StatusServices,
}

#[cached(
    ty = "TimedCache<u8, Status>",
    create = "{ TimedCache::with_lifespan(60) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn check_health(
    ch_client: clickhouse::Client,
    pg_client: Pool<Postgres>,
    redis_client: &mut redis::aio::MultiplexedConnection,
) -> APIResult<Status> {
    let mut status = Status::default();

    // Check Clickhouse connection
    status.services.clickhouse = ch_client.query("SELECT 1").execute().await.is_ok();

    // Check Postgres connection
    status.services.postgres = !pg_client.is_closed();

    // Check Redis connection
    status.services.redis = redis_client
        .exists::<&str, bool>("health_check")
        .await
        .is_ok();

    if status.services.all_ok() {
        Ok(status)
    } else {
        Err(APIError::StatusMsgJson {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: json!(status),
        })
    }
}

#[utoipa::path(
    get,
    path = "/health",
    responses(
        (status = OK, body = Status),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["Info"],
    summary = "Health Check",
    description = r"
Checks the health of the services.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn health_check(State(mut state): State<AppState>) -> APIResult<Json<Status>> {
    check_health(state.ch_client_ro, state.pg_client, &mut state.redis_client)
        .await
        .map(Json)
}
