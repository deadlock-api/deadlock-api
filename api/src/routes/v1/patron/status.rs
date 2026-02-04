use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::context::AppState;
use crate::error::APIError;
use crate::services::patreon::extractor::PatronSession;
use crate::services::patreon::repository::PatronRepository;
use crate::services::patreon::steam_accounts_repository::SteamAccountsRepository;

/// Summary of the patron's Steam accounts
#[derive(Debug, Serialize)]
pub(crate) struct SteamAccountsSummary {
    active_count: i32,
    cooldown_count: i32,
    available_slots: i32,
}

/// Response for the patron status endpoint
#[derive(Debug, Serialize)]
pub(crate) struct PatronStatusResponse {
    tier_id: Option<String>,
    pledge_amount_cents: Option<i32>,
    total_slots: i32,
    is_active: bool,
    last_verified_at: Option<DateTime<Utc>>,
    steam_accounts_summary: SteamAccountsSummary,
}

/// GET /v1/patron/status
///
/// Returns the authenticated patron's current membership status and Steam account summary.
pub(crate) async fn get_patron_status(
    State(app_state): State<AppState>,
    session: PatronSession,
) -> Result<impl IntoResponse, APIError> {
    // Fetch patron record from database
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

    // Get Steam account counts
    let steam_repo = SteamAccountsRepository::new(app_state.pg_client.clone());

    let active_count = steam_repo
        .count_active_accounts(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to count active accounts: {e}");
            APIError::internal("Failed to fetch Steam account data")
        })?;

    let cooldown_count = steam_repo
        .count_accounts_in_cooldown(session.patron_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to count accounts in cooldown: {e}");
            APIError::internal("Failed to fetch Steam account data")
        })?;

    // Calculate slot limit from database: use slot_override if set, otherwise pledge_amount_cents / 100 capped at 10
    let total_slots = patron
        .slot_override
        .unwrap_or_else(|| (patron.pledge_amount_cents.unwrap_or(0) / 100).min(10));

    let used_slots = active_count + cooldown_count;
    let available_slots = (total_slots - used_slots).max(0);

    Ok(Json(PatronStatusResponse {
        tier_id: patron.tier_id,
        pledge_amount_cents: patron.pledge_amount_cents,
        total_slots,
        is_active: patron.is_active,
        last_verified_at: patron.last_verified_at,
        steam_accounts_summary: SteamAccountsSummary {
            active_count,
            cooldown_count,
            available_slots,
        },
    }))
}
