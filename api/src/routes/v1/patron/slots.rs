//! The slot rules for a patron's prioritized Steam accounts. Free of I/O and of the clock (`now`
//! is passed in), so the handlers only load the inputs and persist the outcome.

use chrono::{DateTime, TimeDelta, Utc};
use uuid::Uuid;

use crate::services::patreon::steam_accounts_repository::SteamAccount;

/// How long a removed account keeps holding its slot.
const COOLDOWN: TimeDelta = TimeDelta::hours(24);

/// Whether an account removed at `deleted_at` still holds its slot at `now`.
pub(super) fn in_cooldown(deleted_at: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
    let Some(threshold) = now.checked_sub_signed(COOLDOWN) else {
        return false;
    };
    deleted_at.is_some_and(|deleted| deleted > threshold)
}

/// All slots are taken: `used` of `limit`.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct SlotLimitExceeded {
    pub(super) used: i32,
    pub(super) limit: i32,
}

/// Checks that one more account fits. `used_slots` counts the active accounts and the removed
/// ones still in cooldown; `holds_slot` means the account to (re)activate is one of the latter,
/// so it is already counted and needs no additional slot.
fn check_free_slot(
    used_slots: i32,
    slot_limit: i32,
    holds_slot: bool,
) -> Result<(), SlotLimitExceeded> {
    let used = used_slots.saturating_sub(i32::from(holds_slot));
    if used >= slot_limit {
        return Err(SlotLimitExceeded {
            used,
            limit: slot_limit,
        });
    }
    Ok(())
}

/// How to add a Steam account.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum AddAction {
    /// Restore this removed entry for the same `steam_id3`.
    Reactivate(Uuid),
    /// Create a new entry.
    Insert,
}

/// Adding an account restores the patron's removed entry for the same `steam_id3`, if any,
/// instead of creating a second one.
pub(super) fn plan_add(
    removed: Option<&SteamAccount>,
    used_slots: i32,
    slot_limit: i32,
    now: DateTime<Utc>,
) -> Result<AddAction, SlotLimitExceeded> {
    let holds_slot = removed.is_some_and(|account| in_cooldown(account.deleted_at, now));
    check_free_slot(used_slots, slot_limit, holds_slot)?;
    Ok(removed.map_or(AddAction::Insert, |account| {
        AddAction::Reactivate(account.id)
    }))
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum ReactivateRejection {
    AlreadyActive,
    SlotLimit(SlotLimitExceeded),
}

/// Only a removed account can be reactivated, and only if it fits within the slot limit.
pub(super) fn check_reactivate(
    account: &SteamAccount,
    used_slots: i32,
    slot_limit: i32,
    now: DateTime<Utc>,
) -> Result<(), ReactivateRejection> {
    if account.deleted_at.is_none() {
        return Err(ReactivateRejection::AlreadyActive);
    }
    check_free_slot(used_slots, slot_limit, in_cooldown(account.deleted_at, now))
        .map_err(ReactivateRejection::SlotLimit)
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum ReplaceRejection {
    Active,
    InCooldown,
}

/// Only a removed account whose cooldown has passed can be swapped for another `steam_id3`.
pub(super) fn check_replace(
    account: &SteamAccount,
    now: DateTime<Utc>,
) -> Result<(), ReplaceRejection> {
    match account.deleted_at {
        None => Err(ReplaceRejection::Active),
        Some(deleted_at) if in_cooldown(Some(deleted_at), now) => Err(ReplaceRejection::InCooldown),
        Some(_) => Ok(()),
    }
}

/// Slot usage over all of a patron's entries, active and removed.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct SlotUsage {
    pub(super) used: i32,
    pub(super) available: i32,
    pub(super) in_cooldown: i32,
}

pub(super) fn slot_usage(
    accounts: &[SteamAccount],
    slot_limit: i32,
    now: DateTime<Utc>,
) -> SlotUsage {
    let mut active = 0i32;
    let mut cooling = 0i32;
    for account in accounts {
        if account.deleted_at.is_none() {
            active = active.saturating_add(1);
        } else if in_cooldown(account.deleted_at, now) {
            cooling = cooling.saturating_add(1);
        }
    }
    let used = active.saturating_add(cooling);
    SlotUsage {
        used,
        available: slot_limit.saturating_sub(used).max(0),
        in_cooldown: cooling,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> DateTime<Utc> {
        DateTime::from_timestamp(1_790_000_000, 0).unwrap()
    }

    fn hours_ago(hours: i64) -> DateTime<Utc> {
        now() - TimeDelta::hours(hours)
    }

    fn account(deleted_at: Option<DateTime<Utc>>) -> SteamAccount {
        SteamAccount {
            id: Uuid::from_u128(7),
            patron_id: None,
            steam_id3: 42,
            created_at: now() - TimeDelta::days(30),
            deleted_at,
            user_deleted: false,
        }
    }

    #[test]
    fn cooldown_lasts_exactly_24_hours() {
        assert!(!in_cooldown(None, now()));
        assert!(in_cooldown(Some(hours_ago(0)), now()));
        assert!(in_cooldown(
            Some(now() - COOLDOWN + TimeDelta::seconds(1)),
            now()
        ));
        assert!(!in_cooldown(Some(now() - COOLDOWN), now()));
        assert!(!in_cooldown(Some(hours_ago(25)), now()));
    }

    #[test]
    fn add_inserts_while_a_slot_is_free() {
        assert_eq!(plan_add(None, 2, 3, now()), Ok(AddAction::Insert));
        assert_eq!(
            plan_add(None, 3, 3, now()),
            Err(SlotLimitExceeded { used: 3, limit: 3 })
        );
    }

    #[test]
    fn add_reactivates_the_removed_entry() {
        let removed = account(Some(hours_ago(48)));
        assert_eq!(
            plan_add(Some(&removed), 2, 3, now()),
            Ok(AddAction::Reactivate(removed.id))
        );
        // Past its cooldown the entry no longer holds a slot, so it needs a free one.
        assert_eq!(
            plan_add(Some(&removed), 3, 3, now()),
            Err(SlotLimitExceeded { used: 3, limit: 3 })
        );
    }

    #[test]
    fn add_reuses_the_slot_a_cooling_entry_holds() {
        let removed = account(Some(hours_ago(1)));
        // All 3 slots are taken, one of them by this entry's cooldown.
        assert_eq!(
            plan_add(Some(&removed), 3, 3, now()),
            Ok(AddAction::Reactivate(removed.id))
        );
        assert_eq!(
            plan_add(Some(&removed), 4, 3, now()),
            Err(SlotLimitExceeded { used: 3, limit: 3 })
        );
    }

    #[test]
    fn reactivate_needs_a_removed_account() {
        assert_eq!(
            check_reactivate(&account(None), 0, 3, now()),
            Err(ReactivateRejection::AlreadyActive)
        );
    }

    #[test]
    fn reactivate_counts_the_slot_a_cooling_account_holds() {
        assert_eq!(
            check_reactivate(&account(Some(hours_ago(1))), 3, 3, now()),
            Ok(())
        );
        assert_eq!(
            check_reactivate(&account(Some(hours_ago(48))), 3, 3, now()),
            Err(ReactivateRejection::SlotLimit(SlotLimitExceeded {
                used: 3,
                limit: 3
            }))
        );
        assert_eq!(
            check_reactivate(&account(Some(hours_ago(48))), 2, 3, now()),
            Ok(())
        );
    }

    #[test]
    fn replace_needs_a_removed_account_past_its_cooldown() {
        assert_eq!(
            check_replace(&account(None), now()),
            Err(ReplaceRejection::Active)
        );
        assert_eq!(
            check_replace(&account(Some(hours_ago(1))), now()),
            Err(ReplaceRejection::InCooldown)
        );
        assert_eq!(check_replace(&account(Some(hours_ago(25))), now()), Ok(()));
    }

    #[test]
    fn usage_counts_active_and_cooling_accounts() {
        let accounts = [
            account(None),
            account(None),
            account(Some(hours_ago(1))),
            account(Some(hours_ago(48))),
        ];
        assert_eq!(
            slot_usage(&accounts, 5, now()),
            SlotUsage {
                used: 3,
                available: 2,
                in_cooldown: 1
            }
        );
        // A lowered slot limit never shows negative availability.
        assert_eq!(slot_usage(&accounts, 2, now()).available, 0);
    }
}
