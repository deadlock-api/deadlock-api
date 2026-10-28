pub const STEAM_ID_IDENT: u64 = 76561197960265728;

#[must_use]
pub fn account_id_to_steam_id64(account_id: u32) -> u64 {
    STEAM_ID_IDENT | u64::from(account_id)
}

/// The account id is the low 32 bits of a `SteamID64` (those of [`STEAM_ID_IDENT`] are zero).
#[must_use]
#[expect(
    clippy::cast_possible_truncation,
    reason = "the account id is the low 32 bits"
)]
pub const fn steam_id64_to_account_id(steam_id64: u64) -> u32 {
    steam_id64 as u32
}
