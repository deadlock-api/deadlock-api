use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use serde::Deserialize;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::protected_accounts;

#[derive(Clone, Deserialize)]
pub(crate) struct DataPrivacyRequest {
    #[serde(deserialize_with = "steam_id::de::account_id")]
    steam_id: u32,
    open_id_params: HashMap<String, String>,
}

/// Checks the `OpenID` login proves the requester owns `steam_id`.
async fn verify_ownership(
    state: &AppState,
    open_id_params: &HashMap<String, String>,
    steam_id: u32,
) -> APIResult<()> {
    let steamid64 = steam_id::SteamId::from_account_id(steam_id).steam64();
    state
        .steam_client
        .verify_user_owns_steam_id(open_id_params, steamid64)
        .await
        .map_err(|e| {
            APIError::status_msg(
                axum::http::StatusCode::BAD_REQUEST,
                format!("Failed to verify OpenID parameters: {e}"),
            )
        })
}

pub(crate) async fn request_deletion(
    State(state): State<AppState>,
    Json(DataPrivacyRequest {
        open_id_params,
        steam_id,
    }): Json<DataPrivacyRequest>,
) -> APIResult<impl IntoResponse> {
    verify_ownership(&state, &open_id_params, steam_id).await?;
    protected_accounts::protect(&state.pg_client, steam_id).await?;
    protected_accounts::update_row_policy(&state.pg_client, &state.ch_client).await?;
    Ok(())
}

pub(crate) async fn request_tracking(
    State(state): State<AppState>,
    Json(DataPrivacyRequest {
        open_id_params,
        steam_id,
    }): Json<DataPrivacyRequest>,
) -> APIResult<impl IntoResponse> {
    verify_ownership(&state, &open_id_params, steam_id).await?;
    protected_accounts::unprotect(&state.pg_client, steam_id).await?;
    protected_accounts::update_row_policy(&state.pg_client, &state.ch_client).await?;
    Ok(())
}
