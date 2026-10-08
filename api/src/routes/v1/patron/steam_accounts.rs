use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::context::AppState;
use crate::error::APIError;
use crate::routes::v1::patron::fetch_patron;
use crate::services::patreon::extractor::PatronSession;
use crate::services::patreon::steam_accounts_repository::{
    SteamAccount, SteamAccountsRepository, SteamAccountsRepositoryError,
};

/// Request body for adding a Steam account
#[derive(Debug, Deserialize, ToSchema)]
pub(crate) struct AddSteamAccountRequest {
    /// Steam ID3 (32-bit unsigned integer format)
    steam_id3: i64,
}

/// Response for a Steam account
#[derive(Debug, Serialize, ToSchema)]
pub(crate) struct SteamAccountResponse {
    id: Uuid,
    steam_id3: i64,
    created_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
}

impl From<SteamAccount> for SteamAccountResponse {
    fn from(account: SteamAccount) -> Self {
        Self {
            id: account.id,
            steam_id3: account.steam_id3,
            created_at: account.created_at,
            deleted_at: account.deleted_at,
        }
    }
}

/// Response for a Steam account in the list endpoint (includes `is_in_cooldown`)
#[derive(Debug, Serialize, ToSchema)]
pub(crate) struct SteamAccountListItem {
    id: Uuid,
    steam_id3: i64,
    created_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
    is_in_cooldown: bool,
}

/// Summary of the patron's Steam account slots
#[derive(Debug, Serialize, ToSchema)]
pub(crate) struct SlotsSummary {
    total_slots: i32,
    used_slots: i32,
    available_slots: i32,
    slots_in_cooldown: i32,
}

/// Response for listing Steam accounts
#[derive(Debug, Serialize, ToSchema)]
pub(crate) struct ListSteamAccountsResponse {
    accounts: Vec<SteamAccountListItem>,
    summary: SlotsSummary,
}

/// A removed account holds its slot for 24 hours after its removal.
fn in_cooldown(deleted_at: Option<DateTime<Utc>>) -> bool {
    let cooldown_threshold = Utc::now() - Duration::hours(24);
    deleted_at.is_some_and(|deleted| deleted > cooldown_threshold)
}

fn validate_steam_id3(steam_id3: i64) -> Result<(), APIError> {
    if u32::try_from(steam_id3).is_err() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Invalid steam_id3: must be a valid 32-bit unsigned integer (0 to 4294967295)",
        ));
    }
    Ok(())
}

fn account_not_found() -> APIError {
    APIError::status_msg(
        StatusCode::NOT_FOUND,
        "Account not found or does not belong to you",
    )
}

/// Slots taken by the patron's active accounts and removed accounts still in cooldown.
async fn used_slots(repo: &SteamAccountsRepository, patron_id: Uuid) -> Result<i32, APIError> {
    let active_count = repo.count_active_accounts(patron_id).await.map_err(|e| {
        tracing::error!("Failed to count active accounts: {e}");
        APIError::internal("Failed to count accounts")
    })?;
    let cooldown_count = repo
        .count_accounts_in_cooldown(patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to count accounts in cooldown: {e}");
            APIError::internal("Failed to count accounts")
        })?;
    Ok(active_count + cooldown_count)
}

/// The patron's account entry `account_id`.
async fn get_owned_account(
    repo: &SteamAccountsRepository,
    account_id: Uuid,
    patron_id: Uuid,
) -> Result<SteamAccount, APIError> {
    repo.get_account_by_id(account_id, patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get account: {e}");
            APIError::internal("Failed to retrieve account")
        })?
        .ok_or_else(account_not_found)
}

/// POST /v1/patron/steam-accounts
///
/// Adds a new Steam account to the patron's prioritized list.
///
/// Validation rules:
/// - `SteamID3` must be a valid 32-bit unsigned integer (0 to 4,294,967,295)
/// - Total active accounts + accounts in cooldown must not exceed `slot_limit`
/// - The specific `steam_id3` must not be in cooldown (deleted within 24 hours)
#[utoipa::path(
    post,
    path = "/steam-accounts",
    request_body = AddSteamAccountRequest,
    security(("api_key_header" = []), ("api_key_query" = [])),
    responses(
        (status = CREATED, body = SteamAccountResponse),
        (status = BAD_REQUEST, description = "Invalid `steam_id3` or no free slot left"),
        (status = UNAUTHORIZED, description = "Missing API key, or the key is not linked to a patron"),
    ),
    tags = ["Internal"],
    summary = "Add Prioritized Steam Account",
    description = "
Adds a Steam account to the patron's prioritized fetching list. Matches of prioritized accounts are fetched first.

Re-adding an account that was removed earlier restores that entry.

### Authentication
Requires an API key linked to an active Patreon membership, sent as `X-API-Key` header,
`api_key` query parameter or `Authorization: Bearer <key>`. A `patron_session` from the
website login works as well.
"
)]
pub(crate) async fn add_steam_account(
    State(app_state): State<AppState>,
    session: PatronSession,
    Json(request): Json<AddSteamAccountRequest>,
) -> Result<impl IntoResponse, APIError> {
    validate_steam_id3(request.steam_id3)?;

    let patron = fetch_patron(&app_state, session.patron_id).await?;

    let slot_limit = patron.slot_limit();

    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());

    // A soft-deleted entry for this steam_id3 is reactivated instead of creating a new record.
    let existing_deleted = repo
        .find_deleted_account_by_steam_id(session.patron_id, request.steam_id3)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check for deleted account: {e}");
            APIError::internal("Failed to check account status")
        })?;

    // An entry still in cooldown already holds its slot; anything else needs a free one.
    if !existing_deleted
        .as_ref()
        .is_some_and(|account| in_cooldown(account.deleted_at))
    {
        let used_slots = used_slots(&repo, session.patron_id).await?;
        if used_slots >= slot_limit {
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                format!(
                    "Cannot add account: slot limit exceeded (using {used_slots} of {slot_limit} slots)",
                ),
            ));
        }
    }

    let account = if let Some(deleted_account) = existing_deleted {
        // Sets deleted_at to NULL
        repo.reactivate_account(deleted_account.id, session.patron_id)
            .await
            .map_err(|e| {
                tracing::error!("Failed to reactivate account: {e}");
                APIError::internal("Failed to reactivate Steam account")
            })?
    } else {
        repo.add_steam_account(session.patron_id, request.steam_id3)
            .await
            .map_err(|e| {
                tracing::error!("Failed to add steam account: {e}");
                APIError::internal("Failed to add Steam account")
            })?
    };

    Ok((
        StatusCode::CREATED,
        Json(SteamAccountResponse::from(account)),
    ))
}

/// GET /v1/patron/steam-accounts
///
/// Lists all Steam accounts for the authenticated patron, including soft-deleted ones in cooldown.
/// Returns account details with `is_in_cooldown` status and a summary of slot usage.
#[utoipa::path(
    get,
    path = "/steam-accounts",
    security(("api_key_header" = []), ("api_key_query" = [])),
    responses(
        (status = OK, body = ListSteamAccountsResponse),
        (status = UNAUTHORIZED, description = "Missing API key, or the key is not linked to a patron"),
    ),
    tags = ["Internal"],
    summary = "List Prioritized Steam Accounts",
    description = "
Lists the patron's prioritized Steam accounts, including removed ones still in their 24 hour cooldown, and a summary of slot usage.

### Authentication
Requires an API key linked to an active Patreon membership, sent as `X-API-Key` header,
`api_key` query parameter or `Authorization: Bearer <key>`. A `patron_session` from the
website login works as well.
"
)]
pub(crate) async fn list_steam_accounts(
    State(app_state): State<AppState>,
    session: PatronSession,
) -> Result<impl IntoResponse, APIError> {
    let patron = fetch_patron(&app_state, session.patron_id).await?;

    let total_slots = patron.slot_limit();

    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());

    // Get all accounts for the patron (including soft-deleted)
    let accounts = repo
        .get_accounts_for_patron(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get accounts for patron: {e}");
            APIError::internal("Failed to fetch Steam accounts")
        })?;

    // Transform accounts to include is_in_cooldown flag
    let mut active_count = 0i32;
    let mut cooldown_count = 0i32;

    let account_items: Vec<SteamAccountListItem> = accounts
        .into_iter()
        .map(|account| {
            let is_in_cooldown = in_cooldown(account.deleted_at);

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

/// Resolves the `{account_id}` path segment to the id of one of the patron's entries.
///
/// The segment is either the entry's UUID or the account's `steam_id3`. A `steam_id3` can have
/// several entries (one active and older removed ones); the active one wins, otherwise the most
/// recently removed one.
async fn resolve_account_id(
    repo: &SteamAccountsRepository,
    patron_id: Uuid,
    account: &str,
) -> Result<Uuid, APIError> {
    if let Ok(id) = Uuid::parse_str(account) {
        return Ok(id);
    }
    let steam_id3 = account.parse::<u32>().map_err(|_| {
        APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Invalid account: must be a steam_id3 or an account entry id",
        )
    })?;
    let accounts = repo.get_accounts_for_patron(patron_id).await.map_err(|e| {
        tracing::error!("Failed to get accounts for patron: {e}");
        APIError::internal("Failed to fetch Steam accounts")
    })?;
    accounts
        .into_iter()
        .filter(|a| a.steam_id3 == i64::from(steam_id3))
        .max_by_key(|a| (a.deleted_at.is_none(), a.deleted_at))
        .map(|a| a.id)
        .ok_or_else(account_not_found)
}

/// Response for deleting a Steam account
#[derive(Debug, Serialize, ToSchema)]
pub(crate) struct DeleteSteamAccountResponse {
    message: String,
}

/// DELETE /v1/patron/steam-accounts/{account_id}
///
/// Soft-deletes a Steam account from the patron's prioritized list.
/// The slot will be in cooldown for 24 hours before it can be reused.
#[utoipa::path(
    delete,
    path = "/steam-accounts/{account_id}",
    params(("account_id" = String, Path, description = "The account's `steam_id3`, or the `id` of its entry as returned by the list endpoint")),
    security(("api_key_header" = []), ("api_key_query" = [])),
    responses(
        (status = OK, body = DeleteSteamAccountResponse),
        (status = UNAUTHORIZED, description = "Missing API key, or the key is not linked to a patron"),
        (status = NOT_FOUND, description = "Account not found or does not belong to the patron"),
    ),
    tags = ["Internal"],
    summary = "Remove Prioritized Steam Account",
    description = "
Removes a Steam account from the patron's prioritized fetching list. `account_id` is the `steam_id3` or the entry `id`. Its slot stays in a 24 hour cooldown before it can be reused.

### Authentication
Requires an API key linked to an active Patreon membership, sent as `X-API-Key` header,
`api_key` query parameter or `Authorization: Bearer <key>`. A `patron_session` from the
website login works as well.
"
)]
pub(crate) async fn delete_steam_account(
    State(app_state): State<AppState>,
    session: PatronSession,
    Path(account): Path<String>,
) -> Result<impl IntoResponse, APIError> {
    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());
    let account_id = resolve_account_id(&repo, session.patron_id, &account).await?;

    // Soft delete the account (sets deleted_at to NOW())
    // This also verifies the account belongs to the authenticated patron
    match repo.soft_delete_account(account_id, session.patron_id).await {
        Ok(()) => Ok(Json(DeleteSteamAccountResponse {
            message: "Steam account removed. The slot will be available for reuse after a 24-hour cooldown period.".to_string(),
        })),
        Err(SteamAccountsRepositoryError::AccountNotFound) => Err(account_not_found()),
        Err(e) => {
            tracing::error!("Failed to delete steam account: {e}");
            Err(APIError::internal("Failed to remove Steam account"))
        }
    }
}

/// Request body for replacing a Steam account
#[derive(Debug, Deserialize, ToSchema)]
pub(crate) struct ReplaceSteamAccountRequest {
    /// New Steam ID3 (32-bit unsigned integer format)
    steam_id3: i64,
}

/// PUT /v1/patron/steam-accounts/{account_id}
///
/// Replaces a soft-deleted Steam account after the 24-hour cooldown has passed.
/// Hard-deletes the old record and inserts a new one with the provided `steam_id3`.
#[utoipa::path(
    put,
    path = "/steam-accounts/{account_id}",
    params(("account_id" = String, Path, description = "The account's `steam_id3`, or the `id` of its entry as returned by the list endpoint")),
    request_body = ReplaceSteamAccountRequest,
    security(("api_key_header" = []), ("api_key_query" = [])),
    responses(
        (status = OK, body = SteamAccountResponse),
        (status = BAD_REQUEST, description = "Invalid `steam_id3`, the account is still active, or its cooldown has not passed"),
        (status = UNAUTHORIZED, description = "Missing API key, or the key is not linked to a patron"),
        (status = NOT_FOUND, description = "Account not found or does not belong to the patron"),
    ),
    tags = ["Internal"],
    summary = "Replace Prioritized Steam Account",
    description = "
Swaps a removed Steam account whose 24 hour cooldown has passed for a new `steam_id3`. `account_id` is the removed account's `steam_id3` or its entry `id`.

### Authentication
Requires an API key linked to an active Patreon membership, sent as `X-API-Key` header,
`api_key` query parameter or `Authorization: Bearer <key>`. A `patron_session` from the
website login works as well.
"
)]
pub(crate) async fn replace_steam_account(
    State(app_state): State<AppState>,
    session: PatronSession,
    Path(account): Path<String>,
    Json(request): Json<ReplaceSteamAccountRequest>,
) -> Result<impl IntoResponse, APIError> {
    validate_steam_id3(request.steam_id3)?;

    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());
    let account_id = resolve_account_id(&repo, session.patron_id, &account).await?;

    let account = get_owned_account(&repo, account_id, session.patron_id).await?;

    // Step 1: Verify account is soft-deleted (deleted_at IS NOT NULL)
    let deleted_at = account.deleted_at.ok_or_else(|| {
        APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Cannot replace an active account. Delete it first to start the 24-hour cooldown.",
        )
    })?;

    // Step 2: Verify cooldown has passed (deleted_at > 24 hours ago)
    if in_cooldown(Some(deleted_at)) {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Cooldown period not yet passed. You must wait 24 hours after deletion before replacing.",
        ));
    }

    // Step 3: Hard delete the old record
    repo.hard_delete_account(account_id, session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to hard delete old account: {e}");
            APIError::internal("Failed to replace account")
        })?;

    // Step 4: Insert new account with the provided steam_id3
    let new_account = repo
        .add_steam_account(session.patron_id, request.steam_id3)
        .await
        .map_err(|e| {
            tracing::error!("Failed to add new steam account: {e}");
            APIError::internal("Failed to replace account")
        })?;

    // Return 200 OK with new account details
    Ok(Json(SteamAccountResponse::from(new_account)))
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
#[utoipa::path(
    post,
    path = "/steam-accounts/{account_id}/reactivate",
    params(("account_id" = String, Path, description = "The account's `steam_id3`, or the `id` of its entry as returned by the list endpoint")),
    security(("api_key_header" = []), ("api_key_query" = [])),
    responses(
        (status = OK, body = SteamAccountResponse),
        (status = BAD_REQUEST, description = "The account is already active, or no free slot left"),
        (status = UNAUTHORIZED, description = "Missing API key, or the key is not linked to a patron"),
        (status = NOT_FOUND, description = "Account not found or does not belong to the patron"),
    ),
    tags = ["Internal"],
    summary = "Reactivate Prioritized Steam Account",
    description = "
Restores a previously removed Steam account to the patron's prioritized fetching list. `account_id` is the `steam_id3` or the entry `id`.

### Authentication
Requires an API key linked to an active Patreon membership, sent as `X-API-Key` header,
`api_key` query parameter or `Authorization: Bearer <key>`. A `patron_session` from the
website login works as well.
"
)]
pub(crate) async fn reactivate_steam_account(
    State(app_state): State<AppState>,
    session: PatronSession,
    Path(account): Path<String>,
) -> Result<impl IntoResponse, APIError> {
    let patron = fetch_patron(&app_state, session.patron_id).await?;

    let slot_limit = patron.slot_limit();

    let repo = SteamAccountsRepository::new(app_state.pg_client.clone());
    let account_id = resolve_account_id(&repo, session.patron_id, &account).await?;

    let account = get_owned_account(&repo, account_id, session.patron_id).await?;

    // Step 1: Verify account is currently soft-deleted
    if account.deleted_at.is_none() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Account is already active and does not need reactivation",
        ));
    }

    // Step 2: Check if reactivation would exceed slot_limit
    // If the account is still in cooldown, it's already counted in the used slots,
    // so reactivating it doesn't consume an additional slot — subtract 1.
    let used_slots =
        used_slots(&repo, session.patron_id).await? - i32::from(in_cooldown(account.deleted_at));
    if used_slots >= slot_limit {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Cannot reactivate account: slot limit exceeded (using {used_slots} of {slot_limit} slots)",
            ),
        ));
    }

    // Step 3: Reactivate the account (sets deleted_at to NULL)
    let reactivated = repo
        .reactivate_account(account_id, session.patron_id)
        .await
        .map_err(|e| match e {
            SteamAccountsRepositoryError::AccountNotFound => account_not_found(),
            SteamAccountsRepositoryError::Database(e) => {
                tracing::error!("Failed to reactivate account: {e}");
                APIError::internal("Failed to reactivate account")
            }
        })?;

    // Return 200 OK with reactivated account details
    Ok(Json(SteamAccountResponse::from(reactivated)))
}
