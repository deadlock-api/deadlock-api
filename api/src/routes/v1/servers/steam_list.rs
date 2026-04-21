use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::services::steam::types::SteamServer;

#[utoipa::path(
    get,
    path = "/steam",
    responses(
        (status = OK, body = [SteamServer]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching the Steam server list failed."),
    ),
    tags = ["Servers"],
    summary = "List Steam Game Servers",
    description = "
Returns the list of Deadlock game servers registered with the Steam master server
(`IGameServersService/GetServerList`), filtered to Deadlock's appid.
    "
)]
pub(super) async fn steam_list(State(state): State<AppState>) -> APIResult<impl IntoResponse> {
    state.steam_client.fetch_steam_server_list().await.map(Json)
}
