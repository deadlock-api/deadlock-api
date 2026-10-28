//! Conversions between Steam account ids and `SteamID64`s.

#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

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
