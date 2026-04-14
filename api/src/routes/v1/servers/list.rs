use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use serde::Serialize;
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::APIResult;
use crate::services::game_server::{GameServerInfo, GameServerService};

#[derive(Debug, Serialize, ToSchema)]
pub(super) struct ListServersResponse {
    servers: Vec<GameServerInfo>,
}

#[utoipa::path(
    get,
    path = "/",
    responses(
        (status = OK, body = ListServersResponse),
    ),
    tags = ["Servers"],
    summary = "List Game Servers",
    description = "Returns all currently active game servers."
)]
pub(super) async fn list(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    let service = GameServerService::new(state.redis_client.clone());
    let servers = service.list_all().await?;

    Ok(Json(ListServersResponse { servers }))
}
