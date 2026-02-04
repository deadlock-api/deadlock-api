use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use chrono::{DateTime, Duration, TimeDelta, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::context::AppState;
use crate::error::APIError;
use crate::services::patreon::extractor::PatronSession;
use crate::services::patreon::repository::PatronRepository;
use crate::services::patreon::steam_accounts_repository::{
    SteamAccountsRepository, SteamAccountsRepositoryError,
};

/// Request body for adding a Steam account
#[derive(Debug, Deserialize)]
pub(crate) struct AddSteamAccountRequest {
    /// Steam ID3 (32-bit unsigned integer format)
    steam_id3: i64,
}

/// Response for a Steam account
#[derive(Debug, Serialize)]
pub(crate) struct SteamAccountResponse {
    id: Uuid,
    steam_id3: i64,
    created_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
}

/// Response for a Steam account in the list endpoint (includes `is_in_cooldown`)
#[derive(Debug, Serialize)]
pub(crate) struct SteamAccountListItem {
    id: Uuid,
    steam_id3: i64,
    created_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
    is_in_cooldown: bool,
}

/// Summary of the patron's Steam account slots
#[derive(Debug, Serialize)]
pub(crate) struct SlotsSummary {
    total_slots: i32,
    used_slots: i32,
    available_slots: i32,
    slots_in_cooldown: i32,
}

/// Response for listing Steam accounts
#[derive(Debug, Serialize)]
pub(crate) struct ListSteamAccountsResponse {
    accounts: Vec<SteamAccountListItem>,
    summary: SlotsSummary,
}

/// POST /v1/patron/steam-accounts
///
/// Adds a new Steam account to the patron's prioritized list.
///
/// Validation rules:
/// - `SteamID3` must be a valid 32-bit unsigned integer (0 to 4,294,967,295)
/// - Total active accounts + accounts in cooldown must not exceed `slot_limit`
/// - The specific `steam_id3` must not be in cooldown (deleted within 24 hours)
pub(crate) async fn add_steam_account(
    State(app_state): State<AppState>,
    session: PatronSession,
    Json(request): Json<AddSteamAccountRequest>,
) -> Result<impl IntoResponse, APIError> {
    // Step 1: Validate SteamID3 is a valid 32-bit unsigned integer
    // u32 range: 0 to 4,294,967,295
    if request.steam_id3 < 0 || request.steam_id3 > i64::from(u32::MAX) {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Invalid steam_id3: must be a valid 32-bit unsigned integer (0 to 4294967295)",
        ));
    }

    // Fetch patron record to get current slot_override (JWT may have stale slot_limit)
    let patron_repo = PatronRepository::new(
        app_state.pg_client.clone(),
        app_state.config.patron_encryption_key.clone(),
    );

    let patron = patron_repo
        .get_patron_by_id(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get patron: {e}");
            APIError::internal("Failed to fetch patron data")
        })?
        .ok_or_else(|| {
            tracing::error!(
                "Patron not found for session patron_id: {}",
                session.patron_id
            );
            APIError::internal("Patron record not found")
        })?;

    // Calculate slot limit from database: use slot_override if set, otherwise pledge_amount_cents / 100 capped at 10
    let slot_limit = patron
        .slot_override
        .unwrap_or_else(|| (patron.pledge_amount_cents.unwrap_or(0) / 100).min(10));

    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());

    // Step 2: Count active accounts and accounts in cooldown
    let active_count = repo
        .count_active_accounts(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to count active accounts: {e}");
            APIError::internal("Failed to count accounts")
        })?;

    let cooldown_count = repo
        .count_accounts_in_cooldown(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to count accounts in cooldown: {e}");
            APIError::internal("Failed to count accounts")
        })?;

    // Step 3: Check if adding would exceed slot_limit
    let used_slots = active_count + cooldown_count;
    if used_slots >= slot_limit {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Cannot add account: slot limit exceeded (using {used_slots} of {slot_limit} slots)",
            ),
        ));
    }

    // Step 4: Check if this specific steam_id3 is in cooldown
    let is_in_cooldown = repo
        .is_steam_id_in_cooldown(session.patron_id, request.steam_id3)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check cooldown status: {e}");
            APIError::internal("Failed to check cooldown status")
        })?;

    if is_in_cooldown {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Slot still in cooldown: this Steam account was removed within the last 24 hours",
        ));
    }

    // Step 5: Insert new record
    let account = repo
        .add_steam_account(session.patron_id, request.steam_id3)
        .await
        .map_err(|e| {
            tracing::error!("Failed to add steam account: {e}");
            APIError::internal("Failed to add Steam account")
        })?;

    // Return 201 Created with account details
    Ok((
        StatusCode::CREATED,
        Json(SteamAccountResponse {
            id: account.id,
            steam_id3: account.steam_id3,
            created_at: account.created_at,
            deleted_at: account.deleted_at,
        }),
    ))
}

/// GET /v1/patron/steam-accounts
///
/// Lists all Steam accounts for the authenticated patron, including soft-deleted ones in cooldown.
/// Returns account details with `is_in_cooldown` status and a summary of slot usage.
pub(crate) async fn list_steam_accounts(
    State(app_state): State<AppState>,
    session: PatronSession,
) -> Result<impl IntoResponse, APIError> {
    // Fetch patron record to get current slot_override
    let patron_repo = PatronRepository::new(
        app_state.pg_client.clone(),
        app_state.config.patron_encryption_key.clone(),
    );

    let patron = patron_repo
        .get_patron_by_id(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get patron: {e}");
            APIError::internal("Failed to fetch patron data")
        })?
        .ok_or_else(|| {
            tracing::error!(
                "Patron not found for session patron_id: {}",
                session.patron_id
            );
            APIError::internal("Patron record not found")
        })?;

    // Calculate slot limit from database: use slot_override if set, otherwise pledge_amount_cents / 100 capped at 10
    let total_slots = patron
        .slot_override
        .unwrap_or_else(|| (patron.pledge_amount_cents.unwrap_or(0) / 100).min(10));

    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());

    // Get all accounts for the patron (including soft-deleted)
    let accounts = repo
        .get_accounts_for_patron(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get accounts for patron: {e}");
            APIError::internal("Failed to fetch Steam accounts")
        })?;

    // Calculate cooldown threshold (24 hours ago)
    let cooldown_threshold = Utc::now() - Duration::hours(24);

    // Transform accounts to include is_in_cooldown flag
    let mut active_count = 0i32;
    let mut cooldown_count = 0i32;

    let account_items: Vec<SteamAccountListItem> = accounts
        .into_iter()
        .map(|account| {
            let is_in_cooldown = account
                .deleted_at
                .is_some_and(|deleted| deleted > cooldown_threshold);

            // Count active and cooldown slots
            if account.deleted_at.is_none() {
                active_count += 1;
            } else if is_in_cooldown {
                cooldown_count += 1;
            }

            SteamAccountListItem {
                id: account.id,
                steam_id3: account.steam_id3,
                created_at: account.created_at,
                deleted_at: account.deleted_at,
                is_in_cooldown,
            }
        })
        .collect();

    let used_slots = active_count + cooldown_count;
    let available_slots = (total_slots - used_slots).max(0);

    let response = ListSteamAccountsResponse {
        accounts: account_items,
        summary: SlotsSummary {
            total_slots,
            used_slots,
            available_slots,
            slots_in_cooldown: cooldown_count,
        },
    };

    Ok(Json(response))
}

/// Response for deleting a Steam account
#[derive(Debug, Serialize)]
pub(crate) struct DeleteSteamAccountResponse {
    message: String,
}

/// DELETE /v1/patron/steam-accounts/{account_id}
///
/// Soft-deletes a Steam account from the patron's prioritized list.
/// The slot will be in cooldown for 24 hours before it can be reused.
pub(crate) async fn delete_steam_account(
    State(app_state): State<AppState>,
    session: PatronSession,
    Path(account_id): Path<Uuid>,
) -> Result<impl IntoResponse, APIError> {
    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());

    // Soft delete the account (sets deleted_at to NOW())
    // This also verifies the account belongs to the authenticated patron
    match repo.soft_delete_account(account_id, session.patron_id).await {
        Ok(()) => Ok(Json(DeleteSteamAccountResponse {
            message: "Steam account removed. The slot will be available for reuse after a 24-hour cooldown period.".to_string(),
        })),
        Err(SteamAccountsRepositoryError::AccountNotFound) => {
            Err(APIError::status_msg(
                StatusCode::NOT_FOUND,
                "Account not found or does not belong to you",
            ))
        }
        Err(e) => {
            tracing::error!("Failed to delete steam account: {e}");
            Err(APIError::internal("Failed to remove Steam account"))
        }
    }
}

/// Request body for replacing a Steam account
#[derive(Debug, Deserialize)]
pub(crate) struct ReplaceSteamAccountRequest {
    /// New Steam ID3 (32-bit unsigned integer format)
    steam_id3: i64,
}

/// PUT /v1/patron/steam-accounts/{account_id}
///
/// Replaces a soft-deleted Steam account after the 24-hour cooldown has passed.
/// Hard-deletes the old record and inserts a new one with the provided `steam_id3`.
pub(crate) async fn replace_steam_account(
    State(app_state): State<AppState>,
    session: PatronSession,
    Path(account_id): Path<Uuid>,
    Json(request): Json<ReplaceSteamAccountRequest>,
) -> Result<impl IntoResponse, APIError> {
    // Step 1: Validate SteamID3 is a valid 32-bit unsigned integer
    if request.steam_id3 < 0 || request.steam_id3 > i64::from(u32::MAX) {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Invalid steam_id3: must be a valid 32-bit unsigned integer (0 to 4294967295)",
        ));
    }

    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());

    // Step 2: Get the account and verify it belongs to the patron
    let account = repo
        .get_account_by_id(account_id, session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get account: {e}");
            APIError::internal("Failed to retrieve account")
        })?
        .ok_or_else(|| {
            APIError::status_msg(
                StatusCode::NOT_FOUND,
                "Account not found or does not belong to you",
            )
        })?;

    // Step 3: Verify account is soft-deleted (deleted_at IS NOT NULL)
    let deleted_at = account.deleted_at.ok_or_else(|| {
        APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Cannot replace an active account. Delete it first to start the 24-hour cooldown.",
        )
    })?;

    // Step 4: Verify cooldown has passed (deleted_at > 24 hours ago)
    let cooldown_threshold = Utc::now() - TimeDelta::hours(24);
    if deleted_at > cooldown_threshold {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Cooldown period not yet passed. You must wait 24 hours after deletion before replacing.",
        ));
    }

    // Step 5: Hard delete the old record
    repo.hard_delete_account(account_id, session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to hard delete old account: {e}");
            APIError::internal("Failed to replace account")
        })?;

    // Step 6: Insert new account with the provided steam_id3
    let new_account = repo
        .add_steam_account(session.patron_id, request.steam_id3)
        .await
        .map_err(|e| {
            tracing::error!("Failed to add new steam account: {e}");
            APIError::internal("Failed to replace account")
        })?;

    // Return 200 OK with new account details
    Ok(Json(SteamAccountResponse {
        id: new_account.id,
        steam_id3: new_account.steam_id3,
        created_at: new_account.created_at,
        deleted_at: new_account.deleted_at,
    }))
}

/// POST /v1/patron/steam-accounts/{account_id}/reactivate
///
/// Reactivates a previously soft-deleted Steam account.
/// Use this endpoint when a patron has upgraded and wants to restore previously deleted accounts.
///
/// Validation rules:
/// - Account must belong to the authenticated patron
/// - Account must currently be soft-deleted (`deleted_at` IS NOT NULL)
/// - Reactivation must not exceed the patron's current `slot_limit`
pub(crate) async fn reactivate_steam_account(
    State(app_state): State<AppState>,
    session: PatronSession,
    Path(account_id): Path<Uuid>,
) -> Result<impl IntoResponse, APIError> {
    // Fetch patron record to get current slot_override (JWT may have stale slot_limit)
    let patron_repo = PatronRepository::new(
        app_state.pg_client.clone(),
        app_state.config.patron_encryption_key.clone(),
    );

    let patron = patron_repo
        .get_patron_by_id(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get patron: {e}");
            APIError::internal("Failed to fetch patron data")
        })?
        .ok_or_else(|| {
            tracing::error!(
                "Patron not found for session patron_id: {}",
                session.patron_id
            );
            APIError::internal("Patron record not found")
        })?;

    // Calculate slot limit from database: use slot_override if set, otherwise pledge_amount_cents / 100 capped at 10
    let slot_limit = patron
        .slot_override
        .unwrap_or_else(|| (patron.pledge_amount_cents.unwrap_or(0) / 100).min(10));

    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());

    // Step 1: Get the account and verify it belongs to the patron
    let account = repo
        .get_account_by_id(account_id, session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get account: {e}");
            APIError::internal("Failed to retrieve account")
        })?
        .ok_or_else(|| {
            APIError::status_msg(
                StatusCode::NOT_FOUND,
                "Account not found or does not belong to you",
            )
        })?;

    // Step 2: Verify account is currently soft-deleted
    if account.deleted_at.is_none() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Account is already active and does not need reactivation",
        ));
    }

    // Step 3: Count current active accounts and accounts in cooldown
    let active_count = repo
        .count_active_accounts(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to count active accounts: {e}");
            APIError::internal("Failed to count accounts")
        })?;

    let cooldown_count = repo
        .count_accounts_in_cooldown(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to count accounts in cooldown: {e}");
            APIError::internal("Failed to count accounts")
        })?;

    // Step 4: Check if reactivation would exceed slot_limit
    let used_slots = active_count + cooldown_count;
    if used_slots >= slot_limit {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Cannot reactivate account: slot limit exceeded (using {used_slots} of {slot_limit} slots)",
            ),
        ));
    }

    // Step 5: Reactivate the account (sets deleted_at to NULL)
    let reactivated = repo
        .reactivate_account(account_id, session.patron_id)
        .await
        .map_err(|e| match e {
            SteamAccountsRepositoryError::AccountNotFound => APIError::status_msg(
                StatusCode::NOT_FOUND,
                "Account not found or does not belong to you",
            ),
            SteamAccountsRepositoryError::Database(e) => {
                tracing::error!("Failed to reactivate account: {e}");
                APIError::internal("Failed to reactivate account")
            }
        })?;

    // Return 200 OK with reactivated account details
    Ok(Json(SteamAccountResponse {
        id: reactivated.id,
        steam_id3: reactivated.steam_id3,
        created_at: reactivated.created_at,
        deleted_at: reactivated.deleted_at,
    }))
}
