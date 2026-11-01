use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use cached::Cached as _;
use serde::Deserialize;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::steam::client::GET_PROTECTED_USERS_CACHED;
use crate::utils::sql::id_list;

#[derive(Clone, Deserialize)]
pub(crate) struct DataPrivacyRequest {
    #[serde(deserialize_with = "steam_id::de::account_id")]
    steam_id: u32,
    open_id_params: HashMap<String, String>,
}

/// `protected_user_accounts.steam_id` is `INTEGER`: store the u32 bit pattern, read back with
/// `i32::cast_unsigned`, so ids of 2^31 and above round-trip.
const fn steam_id_i32(steam_id: u32) -> i32 {
    steam_id.cast_signed()
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

async fn protect_account(pg_client: &sqlx::Pool<sqlx::Postgres>, steam_id: u32) -> APIResult<()> {
    let steam_id_i32 = steam_id_i32(steam_id);
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

    GET_PROTECTED_USERS_CACHED.write().await.cache_clear();

    Ok(())
}

async fn unprotect_account(pg_client: &sqlx::Pool<sqlx::Postgres>, steam_id: u32) -> APIResult<()> {
    let steam_id_i32 = steam_id_i32(steam_id);
    sqlx::query!(
        r#"
        DELETE FROM protected_user_accounts
        WHERE steam_id = $1
        "#,
        steam_id_i32
    )
    .execute(pg_client)
    .await?;

    GET_PROTECTED_USERS_CACHED.write().await.cache_clear();

    Ok(())
}

/// Row policies hiding protected accounts and anonymous players (`account_id = 0`), by the table
/// they guard. Every table with an `account_id` column that `api_readonly_user` or `dump_user` can
/// read needs one.
const GDPR_ROW_POLICIES: [(&str, &str); 6] = [
    ("gdpr_protection_mp", "match_player"),
    ("gdpr_protection_sp", "steam_profiles"),
    ("gdpr_protection_spon", "steam_profile_observed_names"),
    ("gdpr_protection_pms", "player_match_stats"),
    ("gdpr_protection_pmh", "player_match_history"),
    ("gdpr_protection_pmr", "player_match_roster"),
];

pub(crate) async fn update_row_policy(
    pg_client: &sqlx::Pool<sqlx::Postgres>,
    ch_client: &clickhouse::Client,
) -> APIResult<()> {
    let protected_accounts: Vec<u32> = sqlx::query!("SELECT steam_id FROM protected_user_accounts")
        .fetch_all(pg_client)
        .await?
        .into_iter()
        .map(|record| record.steam_id.cast_unsigned())
        .collect();

    let filter = row_policy_filter(&protected_accounts);
    for (policy, table) in GDPR_ROW_POLICIES {
        ch_client
            .query(&format!(
                "CREATE ROW POLICY OR REPLACE {policy} ON {table} AS RESTRICTIVE FOR SELECT USING {filter} TO api_readonly_user, dump_user"
            ))
            .execute()
            .await?;
    }

    Ok(())
}

/// Hides protected accounts and `account_id = 0`. Anonymous players all share that id, so they
/// can't be told apart and must not show up in any result (2026-11-01).
fn row_policy_filter(protected_accounts: &[u32]) -> String {
    if protected_accounts.is_empty() {
        "(account_id != 0)".to_owned()
    } else {
        format!(
            "(account_id != 0 AND account_id NOT IN ({}))",
            id_list(protected_accounts)
        )
    }
}

pub(crate) async fn request_deletion(
    State(state): State<AppState>,
    Json(DataPrivacyRequest {
        open_id_params,
        steam_id,
    }): Json<DataPrivacyRequest>,
) -> APIResult<impl IntoResponse> {
    verify_ownership(&state, &open_id_params, steam_id).await?;
    protect_account(&state.pg_client, steam_id).await?;
    update_row_policy(&state.pg_client, &state.ch_client).await?;
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
    unprotect_account(&state.pg_client, steam_id).await?;
    update_row_policy(&state.pg_client, &state.ch_client).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn row_policy_always_hides_anonymous_players() {
        assert_eq!(row_policy_filter(&[]), "(account_id != 0)");
        assert_eq!(
            row_policy_filter(&[7, 9]),
            "(account_id != 0 AND account_id NOT IN (7, 9))"
        );
    }
}
