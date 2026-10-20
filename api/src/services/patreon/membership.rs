use tracing::info;

use super::steam_accounts_repository::SteamAccountsRepository;
use super::types::calculate_slot_limit;

/// Handle patron reactivation by restoring soft-deleted Steam accounts up to the slot limit.
///
/// When a patron re-subscribes (pays again) or has a slot override, reactivate their
/// previously soft-deleted accounts so they don't have to re-add them manually.
pub(crate) async fn handle_reactivation(
    steam_accounts_repository: &SteamAccountsRepository,
    patron_id: uuid::Uuid,
    patreon_user_id: &str,
    pledge_amount_cents: Option<i32>,
    is_active: bool,
    slot_override: Option<i32>,
) -> Result<(), String> {
    let slot_limit = calculate_slot_limit(slot_override, pledge_amount_cents, is_active);

    let active_count = steam_accounts_repository
        .count_active_accounts(patron_id)
        .await
        .map_err(|e| format!("Failed to count active accounts: {e}"))?;

    if active_count >= slot_limit {
        return Ok(());
    }

    #[expect(clippy::cast_sign_loss)]
    let available_slots = (slot_limit - active_count) as usize;

    let deleted_accounts = steam_accounts_repository
        .get_deleted_accounts_for_patron(patron_id)
        .await
        .map_err(|e| format!("Failed to get deleted accounts: {e}"))?;

    if deleted_accounts.is_empty() {
        return Ok(());
    }

    let accounts_to_reactivate: Vec<uuid::Uuid> = deleted_accounts
        .into_iter()
        .take(available_slots)
        .map(|a| a.id)
        .collect();

    let reactivated_count = steam_accounts_repository
        .reactivate_accounts(&accounts_to_reactivate, patron_id)
        .await
        .map_err(|e| format!("Failed to reactivate accounts: {e}"))?;

    info!(
        "Reactivated {reactivated_count} accounts for patron {patreon_user_id} (slot limit: {slot_limit})"
    );

    Ok(())
}

/// Handle patron downgrade or cancellation by soft-deleting excess Steam accounts.
///
/// Soft-deletes the oldest accounts beyond the slot limit; without an active membership or a
/// slot override that is every account.
#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) async fn handle_downgrade_or_cancellation(
    steam_accounts_repository: &SteamAccountsRepository,
    patron_id: uuid::Uuid,
    patreon_user_id: &str,
    pledge_amount_cents: Option<i32>,
    is_active: bool,
    slot_override: Option<i32>,
) -> Result<(), String> {
    // Get all active Steam accounts for this patron (ordered by created_at ASC)
    let active_accounts = steam_accounts_repository
        .get_active_accounts_for_patron(patron_id)
        .await
        .map_err(|e| format!("Failed to get active accounts: {e}"))?;

    if active_accounts.is_empty() {
        return Ok(());
    }

    let slot_limit = calculate_slot_limit(slot_override, pledge_amount_cents, is_active);
    // Safe cast: practical slot limits will never exceed i32::MAX
    let active_count = active_accounts.len() as i32;
    if active_count <= slot_limit {
        return Ok(());
    }

    // Oldest first: the accounts are already ordered by created_at ASC.
    let excess_count = (active_count - slot_limit.max(0)).unsigned_abs() as usize;
    info!(
        "Patron {patreon_user_id} has {slot_limit} slots for {active_count} active accounts, soft-deleting {excess_count} oldest"
    );
    let accounts_to_delete: Vec<_> = active_accounts.into_iter().take(excess_count).collect();

    let account_ids: Vec<uuid::Uuid> = accounts_to_delete.iter().map(|a| a.id).collect();
    let deleted_count = steam_accounts_repository
        .soft_delete_accounts(&account_ids, patron_id)
        .await
        .map_err(|e| format!("Failed to soft-delete accounts: {e}"))?;

    info!(
        "Soft-deleted {} accounts for patron {patreon_user_id}",
        deleted_count
    );

    Ok(())
}
