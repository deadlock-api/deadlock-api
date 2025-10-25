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

async fn update_row_policy(
    pg_client: &sqlx::Pool<sqlx::Postgres>,
    ch_client: &clickhouse::Client,
) -> APIResult<()> {
    let protected_accounts: Vec<i32> = sqlx::query!("SELECT steam_id FROM protected_user_accounts")
        .fetch_all(pg_client)
        .await?
        .into_iter()
        .map(|record| record.steam_id)
        .collect();

    if protected_accounts.is_empty() {
        let query = "DROP ROW POLICY IF EXISTS gdpr_protection ON default.*";
        ch_client.query(query).execute().await?;
        return Ok(());
    }

    let protected_accounts_list = protected_accounts
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<String>>()
        .join(", ");
    let policy_queries = [
        format!(
            "CREATE ROW POLICY OR REPLACE gdpr_protection_pmh ON player_match_history AS RESTRICTIVE FOR SELECT USING (account_id NOT IN ({protected_accounts_list})) TO api_readonly_user"
        ),
        format!(
            "CREATE ROW POLICY OR REPLACE gdpr_protection_mp ON match_player AS RESTRICTIVE FOR SELECT USING (account_id NOT IN ({protected_accounts_list})) TO api_readonly_user"
        ),
        format!(
            "CREATE ROW POLICY OR REPLACE gdpr_protection_sp ON steam_profiles AS RESTRICTIVE FOR SELECT USING (account_id NOT IN ({protected_accounts_list})) TO api_readonly_user"
        ),
    ];
    for policy_query in &policy_queries {
        ch_client.query(policy_query).execute().await?;
    }

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
    protect_account(&state.pg_client, steam_id).await?;
    update_row_policy(&state.pg_client, &state.ch_client).await?;
    Ok(())
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
    unprotect_account(&state.pg_client, steam_id).await?;
    update_row_policy(&state.pg_client, &state.ch_client).await?;
    Ok(())
}
