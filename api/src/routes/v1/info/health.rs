use crate::error::{APIError, APIResult};
use crate::state::AppState;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use redis::AsyncCommands;
use serde::Serialize;
use serde_json::json;
use utoipa::ToSchema;

#[derive(Debug, Serialize, Default, ToSchema)]
pub struct StatusServices {
    pub clickhouse: bool,
    pub postgres: bool,
    pub redis: bool,
}

impl StatusServices {
    pub fn all_ok(&self) -> bool {
        self.clickhouse && self.postgres && self.redis
    }
}

#[derive(Debug, Serialize, Default, ToSchema)]
pub struct Status {
    pub services: StatusServices,
}

#[utoipa::path(
    get,
    path = "/health",
    responses(
        (status = OK, body = Status),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["Info"],
)]
pub async fn health_check(State(mut state): State<AppState>) -> APIResult<Json<Status>> {
    let mut status = Status::default();

    // Check Clickhouse connection
    status.services.clickhouse = state
        .clickhouse_client
        .query("SELECT 1")
        .execute()
        .await
        .is_ok();

    // Check Postgres connection
    status.services.postgres = !state.postgres_client.is_closed();

    // Check Redis connection
    status.services.redis = state
        .redis_client
        .exists::<&str, bool>("health_check")
        .await
        .is_ok();

    match status.services.all_ok() {
        true => Ok(Json(status)),
        false => Err(APIError::StatusMsgJson {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: json!(status),
        }),
    }
}
