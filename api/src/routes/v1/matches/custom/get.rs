use crate::context::AppState;
use crate::error::{APIError, APIResult};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use tracing::warn;
use utoipa::{IntoParams, ToSchema};

#[derive(Serialize, ToSchema)]
pub struct GetCustomMatchIdResponse {
    pub match_id: u64,
}

#[derive(Deserialize, IntoParams)]
pub struct PartyIdQuery {
    pub party_id: u64,
}

pub async fn get_party_match_id(
    redis_client: &mut redis::aio::MultiplexedConnection,
    party_id: u64,
) -> APIResult<u64> {
    let match_id: String = redis_client
        .get(format!("{party_id}:match-id"))
        .await
        .map_err(|e| {
            warn!("Failed to get match id from redis: {e}");
            APIError::StatusMsg {
                status: StatusCode::NOT_FOUND,
                message: "Can't find match id".to_string(),
            }
        })?;
    match_id.parse::<u64>().map_err(|_| {
        warn!("Failed to parse match id from redis");
        APIError::StatusMsg {
            status: StatusCode::NOT_FOUND,
            message: "Can't find match id".to_string(),
        }
    })
}

#[utoipa::path(
    get,
    path = "/{party_id}/match-id",
    params(PartyIdQuery),
    responses(
        (status = 200, description = "Successfully fetched custom match id.", body = GetCustomMatchIdResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetch Custom Match ID failed")
    ),
    tags = ["Custom Matches [PREVIEW]"],
    summary = "Get Custom Match ID",
    description = "This endpoint allows you to get the match id of a custom match."
)]
pub async fn get_custom(
    Path(PartyIdQuery { party_id }): Path<PartyIdQuery>,
    State(mut state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_party_match_id(&mut state.redis_client, party_id)
        .await
        .map(|match_id| GetCustomMatchIdResponse { match_id })
        .map(Json)
}
