use core::net::IpAddr;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::{is_safe_identifier, is_safe_label, require_game_server_secret};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::game_server::{GAME_SERVER_TTL_SECS, GameServerInfo, GameServerService};

#[derive(Debug, Deserialize, ToSchema)]
pub(super) struct ServerStatusRequest {
    /// Unique identifier for the game server
    server_id: String,
    /// Game mode this server is running (e.g. "ranked", "unranked")
    game_mode: String,
    /// Region the server is located in (e.g. "eu", "na", "sa", "asia", "oceania")
    region: String,
    /// Hostname of the game server
    #[serde(default)]
    hostname: Option<String>,
    /// IP address of the game server
    ip: String,
    /// Port the game server is listening on
    port: u16,
    /// Current number of players on this server
    current_player_count: u32,
}

#[derive(Debug, Serialize, ToSchema)]
pub(super) struct ServerStatusResponse {
    /// The server ID that reported status
    server_id: String,
    /// TTL in seconds before this registration expires
    ttl_secs: i64,
}

#[utoipa::path(
    post,
    path = "/status",
    request_body = ServerStatusRequest,
    responses(
        (status = OK, body = ServerStatusResponse),
        (status = UNAUTHORIZED, description = "Invalid or missing game server secret."),
        (status = BAD_REQUEST, description = "Invalid request body."),
    ),
    tags = ["Servers"],
    summary = "Game Server Status",
    description = "
Reports the current status of a game server.
Game servers must call this endpoint at least once every 30 seconds to remain active.
Requires a valid game server secret as a Bearer token.
    "
)]
pub(super) async fn status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ServerStatusRequest>,
) -> APIResult<impl IntoResponse> {
    require_game_server_secret(&headers, &state.config.game_server_secret)?;

    if !is_safe_identifier(&request.server_id) {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "server_id must be 1-64 alphanumeric characters, hyphens, or underscores",
        ));
    }
    if !is_safe_label(&request.game_mode) {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "game_mode must be 1-64 non-control characters",
        ));
    }
    if !is_safe_label(&request.region) {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "region must be 1-64 non-control characters",
        ));
    }
    if let Some(ref h) = request.hostname {
        if h.len() > 253 || h.chars().any(|c| c.is_control()) {
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                "hostname must be at most 253 non-control characters",
            ));
        }
    }
    if request.ip.parse::<IpAddr>().is_err() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "ip must be a valid IPv4 or IPv6 address",
        ));
    }
    if request.port == 0 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "port must be greater than 0",
        ));
    }

    let info = GameServerInfo {
        server_id: request.server_id.clone(),
        game_mode: request.game_mode,
        region: request.region,
        hostname: request.hostname.filter(|h| !h.is_empty()),
        ip: request.ip,
        port: request.port,
        current_player_count: request.current_player_count,
        last_updated: chrono::Utc::now().to_rfc3339(),
    };

    let service = GameServerService::new(state.redis_client.clone());
    service.register(&info).await?;

    Ok(Json(ServerStatusResponse {
        server_id: request.server_id,
        ttl_secs: GAME_SERVER_TTL_SECS,
    }))
}
