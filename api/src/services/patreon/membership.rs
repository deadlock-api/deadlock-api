use tracing::info;

use super::steam_accounts_repository::SteamAccountsRepository;
use super::types::calculate_slot_limit;

/// Handle patron downgrade or cancellation by soft-deleting excess Steam accounts.
///
/// - If `is_active` is false (patron cancelled), soft-delete ALL accounts
/// - If new slot limit < active accounts count, soft-delete oldest accounts first
#[allow(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
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

    let accounts_to_delete = if is_active {
        let new_slot_limit = calculate_slot_limit(slot_override, pledge_amount_cents);
        // Safe cast: practical slot limits will never exceed i32::MAX
        let active_count = active_accounts.len() as i32;

        if active_count <= new_slot_limit {
            // No downgrade needed
            return Ok(());
        }

        // Downgrade: soft-delete excess accounts (oldest first, they're already ordered by created_at ASC)
        // Safe: we've verified active_count > new_slot_limit, so this is positive
        let excess_count = (active_count - new_slot_limit).unsigned_abs() as usize;
        info!(
            "Patron {patreon_user_id} downgraded: {} active accounts, {} slots allowed, soft-deleting {} oldest",
            active_count, new_slot_limit, excess_count
        );
        active_accounts.into_iter().take(excess_count).collect()
    } else {
        // Patron cancelled: soft-delete ALL accounts
        info!(
            "Patron {patreon_user_id} cancelled, soft-deleting all {} accounts",
            active_accounts.len()
        );
        active_accounts
    };

    if accounts_to_delete.is_empty() {
        return Ok(());
    }

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
