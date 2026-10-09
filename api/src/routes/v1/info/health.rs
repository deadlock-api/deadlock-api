use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use cached::macros::cached;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Pool, Postgres};
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};

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

#[cached(ttl_secs = 60, convert = "{ 0 }", key = "u8", sync_writes = "default")]
async fn check_health(
    ch_client: clickhouse::Client,
    pg_client: Pool<Postgres>,
    redis_client: &mut redis::aio::MultiplexedConnection,
) -> Result<Status, APIError> {
    // Check Clickhouse and Redis concurrently
    let (clickhouse, redis) = tokio::join!(
        ch_client
            .query("SELECT 1 SETTINGS log_comment = 'health_check'")
            .execute(),
        redis_client.exists::<&str, bool>("health_check"),
    );
    let status = Status {
        services: StatusServices {
            clickhouse: clickhouse.is_ok(),
            // A closed pool can't hand out connections
            postgres: !pg_client.is_closed(),
            redis: redis.is_ok(),
        },
    };

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
    description = "
Checks the health of the services.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn health_check(State(state): State<AppState>) -> APIResult<Json<Status>> {
    if crate::SHUTTING_DOWN.load(core::sync::atomic::Ordering::Relaxed) {
        return Err(APIError::status_msg(
            StatusCode::SERVICE_UNAVAILABLE,
            "Service is shutting down",
        ));
    }
    check_health(
        state.ch_client_ro.clone(),
        state.pg_client.clone(),
        &mut state.redis_client.clone(),
    )
    .await
    .map(Json)
}
