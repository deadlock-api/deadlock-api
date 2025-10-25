use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use serde::Deserialize;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils;
use crate::utils::parse::parse_steam_id;

#[derive(Clone, Deserialize, IntoParams, ToSchema)]
pub(super) struct DataPrivacyRequest {
    #[serde(deserialize_with = "parse_steam_id")]
    steam_id: u32,
    open_id_params: HashMap<String, String>,
}

async fn protect_account(pg_client: &sqlx::Pool<sqlx::Postgres>, steam_id: u32) -> APIResult<()> {
    let Ok(steam_id_i32) = i32::try_from(steam_id) else {
        return Err(APIError::status_msg(
            axum::http::StatusCode::BAD_REQUEST,
            "SteamID3 is out of range".to_string(),
        ));
    };
    sqlx::query!(
        r#"
        INSERT INTO protected_user_accounts (steam_id)
        VALUES ($1)
        ON CONFLICT (steam_id) DO NOTHING
        "#,
        steam_id_i32
    )
    .execute(pg_client)
    .await?;
    Ok(())
}

async fn unprotect_account(pg_client: &sqlx::Pool<sqlx::Postgres>, steam_id: u32) -> APIResult<()> {
    let Ok(steam_id_i32) = i32::try_from(steam_id) else {
        return Err(APIError::status_msg(
            axum::http::StatusCode::BAD_REQUEST,
            "SteamID3 is out of range".to_string(),
        ));
    };
    sqlx::query!(
        r#"
        DELETE FROM protected_user_accounts
        WHERE steam_id = $1
        "#,
        steam_id_i32
    )
    .execute(pg_client)
    .await?;
    Ok(())
}

#[utoipa::path(
    post,
    path = "/request-deletion",
    request_body = DataPrivacyRequest,
    responses(
        (status = OK),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["Data Privacy"],
    summary = "Request Data Deletion",
    description = "
Endpoint to request deletion of personal data.
    "
)]
pub(super) async fn request_deletion(
    State(state): State<AppState>,
    Json(DataPrivacyRequest {
        open_id_params,
        steam_id,
    }): Json<DataPrivacyRequest>,
) -> APIResult<impl IntoResponse> {
    let steamid64 = utils::parse::steamid3_to_steamid64(steam_id);
    if let Err(e) = state
        .steam_client
        .verify_user_owns_steam_id(&open_id_params, steamid64)
        .await
    {
        return Err(APIError::status_msg(
            axum::http::StatusCode::BAD_REQUEST,
            format!("Failed to verify OpenID parameters: {e}"),
        ));
    }
    protect_account(&state.pg_client, steam_id).await
}

#[utoipa::path(
    post,
    path = "/request-tracking",
    request_body = DataPrivacyRequest,
    responses(
        (status = OK),
        (status = INTERNAL_SERVER_ERROR, body = String)
    ),
    tags = ["Data Privacy"],
    summary = "Request Data Tracking",
    description = "
Endpoint to request tracking of personal data.

Use this to opt back into data tracking after previously requesting deletion.
    "
)]
pub(super) async fn request_tracking(
    State(state): State<AppState>,
    Json(DataPrivacyRequest {
        open_id_params,
        steam_id,
    }): Json<DataPrivacyRequest>,
) -> APIResult<impl IntoResponse> {
    let steamid64 = utils::parse::steamid3_to_steamid64(steam_id);
    if let Err(e) = state
        .steam_client
        .verify_user_owns_steam_id(&open_id_params, steamid64)
        .await
    {
        return Err(APIError::status_msg(
            axum::http::StatusCode::BAD_REQUEST,
            format!("Failed to verify OpenID parameters: {e}"),
        ));
    }
    unprotect_account(&state.pg_client, steam_id).await
}
