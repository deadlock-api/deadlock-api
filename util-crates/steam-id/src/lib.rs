//! [`SteamId`]: the Steam id of a player, built from and rendered to its account id (`SteamID3`),
//! `SteamID64`, Steam3 (`[U:1:123]`) and Steam2 (`STEAM_1:1:61`) forms.
//!
//! Only individual accounts in the public universe are players, so every other kind of Steam id
//! (clans, game servers, other universes) is rejected.

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

#[cfg(feature = "serde")]
pub mod de;

use core::fmt::{self, Display, Formatter};
use core::str::FromStr;

/// The high 32 bits of a player's `SteamID64`: public universe, individual account, desktop
/// instance. The low 32 bits are the account id.
const STEAM64_PLAYER_BITS: u64 = 0x0110_0001_0000_0000;

/// A malformed Steam id, or one that is not a player's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParseError;

impl Display for ParseError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("invalid steam id")
    }
}

impl core::error::Error for ParseError {}

/// The Steam id of a player.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SteamId(u32);

impl SteamId {
    #[must_use]
    pub const fn from_account_id(account_id: u32) -> Self {
        Self(account_id)
    }

    pub fn from_steam64(steam64: u64) -> Result<Self, ParseError> {
        steam64
            .checked_sub(STEAM64_PLAYER_BITS)
            .and_then(|account_id| u32::try_from(account_id).ok())
            .map(Self)
            .ok_or(ParseError)
    }

    /// By the account id (any number up to `u32::MAX`) or the `SteamID64`, as clients send them.
    pub fn from_account_or_steam64(id: u64) -> Result<Self, ParseError> {
        u32::try_from(id).map_or_else(|_steam64| Self::from_steam64(id), |id| Ok(Self(id)))
    }

    /// The account id, called `SteamID3` by the game and the api.
    #[must_use]
    pub const fn account_id(self) -> u32 {
        self.0
    }

    #[must_use]
    pub fn steam64(self) -> u64 {
        STEAM64_PLAYER_BITS | u64::from(self.0)
    }

    /// `[U:1:<account id>]`
    #[must_use]
    pub fn steam3(self) -> String {
        format!("[U:1:{}]", self.0)
    }

    /// Parses `[U:1:<account id>]`.
    pub fn from_steam3(steam3: &str) -> Result<Self, ParseError> {
        let account_id = steam3
            .strip_prefix("[U:1:")
            .and_then(|s| s.strip_suffix(']'))
            .ok_or(ParseError)?;
        digits(account_id).map(Self)
    }

    /// `STEAM_1:<account id & 1>:<account id >> 1>`
    #[must_use]
    pub fn steam2(self) -> String {
        format!("STEAM_1:{}:{}", self.0 & 1, self.0 >> 1)
    }

    /// Parses `STEAM_1:<0|1>:<account id >> 1>`, also with universe 0, which old games show for
    /// the public universe.
    pub fn from_steam2(steam2: &str) -> Result<Self, ParseError> {
        let rest = steam2
            .strip_prefix("STEAM_1:")
            .or_else(|| steam2.strip_prefix("STEAM_0:"))
            .ok_or(ParseError)?;
        let (low_bit, high_bits) = match rest.split_once(':') {
            Some(("0", high_bits)) => (0, high_bits),
            Some(("1", high_bits)) => (1, high_bits),
            _ => return Err(ParseError),
        };
        let account_id = digits::<u32>(high_bits)?.checked_mul(2).ok_or(ParseError)? | low_bit;
        Ok(Self(account_id))
    }
}

/// A non-empty run of ASCII digits, without the sign [`str::parse`] would accept.
fn digits<T: FromStr>(s: &str) -> Result<T, ParseError> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ParseError);
    }
    s.parse().map_err(|_overflow| ParseError)
}

impl From<SteamId> for u64 {
    fn from(steam_id: SteamId) -> Self {
        steam_id.steam64()
    }
}

/// The `SteamID64`.
impl Display for SteamId {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.steam64())
    }
}

impl FromStr for SteamId {
    type Err = ParseError;

    /// A number as in [`SteamId::from_account_or_steam64`], a Steam3 or a Steam2 id.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if s.starts_with('[') {
            Self::from_steam3(s)
        } else if s.starts_with("STEAM_") {
            Self::from_steam2(s)
        } else {
            Self::from_account_or_steam64(digits(s)?)
        }
    }
}

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use super::*;

    #[test]
    fn test_forms() {
        let steam_id = SteamId::from_steam64(76561197960287930).unwrap();
        assert_eq!(steam_id, SteamId::from_account_id(22202));
        assert_eq!(steam_id.account_id(), 22202);
        assert_eq!(steam_id.steam64(), 76561197960287930);
        assert_eq!(steam_id.to_string(), "76561197960287930");
        assert_eq!(steam_id.steam3(), "[U:1:22202]");
        assert_eq!(steam_id.steam2(), "STEAM_1:0:11101");
    }

    #[rstest]
    #[case(76561198123456789, 163191061)] // SteamID64
    #[case(123456, 123456)] // Account id
    #[case(0, 0)]
    #[case(76561197960265728, 0)] // SteamID64 of account 0
    fn test_from_account_or_steam64(#[case] id: u64, #[case] account_id: u32) {
        let steam_id = SteamId::from_account_or_steam64(id).unwrap();
        assert_eq!(steam_id.account_id(), account_id);
    }

    #[rstest]
    #[case(4294967296)] // Too big for an account id, too small for a SteamID64
    #[case(76561202255233024)] // Console instance
    #[case(0x0170_0001_0000_0005)] // Clan
    fn test_from_account_or_steam64_invalid(#[case] id: u64) {
        SteamId::from_account_or_steam64(id).unwrap_err();
    }

    #[rstest]
    #[case("76561198123456789", 163191061)]
    #[case("123456", 123456)]
    #[case("[U:1:163191061]", 163191061)]
    #[case("STEAM_1:1:81595530", 163191061)]
    #[case("STEAM_0:1:81595530", 163191061)] // Old games show universe 0
    fn test_from_str(#[case] s: &str, #[case] account_id: u32) {
        assert_eq!(s.parse::<SteamId>().unwrap().account_id(), account_id);
    }

    #[rstest]
    #[case("")]
    #[case("+123")]
    #[case(" 123")]
    #[case("abc")]
    #[case("4294967296")]
    #[case("[U:1:]")]
    #[case("[U:1:5")]
    #[case("[U:1:5:1]")]
    #[case("[g:1:4]")] // Clan
    #[case("[U:2:5]")] // Beta universe
    #[case("STEAM_1:2:5")]
    #[case("STEAM_2:0:5")]
    #[case("STEAM_1:0:2147483648")] // Account id overflows
    #[case("STEAM_1:0")]
    fn test_from_str_invalid(#[case] s: &str) {
        s.parse::<SteamId>().unwrap_err();
    }

    #[rstest]
    #[case(0)]
    #[case(163191061)]
    #[case(u32::MAX)]
    fn test_round_trips(#[case] account_id: u32) {
        let steam_id = SteamId::from_account_id(account_id);
        assert_eq!(SteamId::from_steam64(steam_id.steam64()), Ok(steam_id));
        assert_eq!(SteamId::from_steam3(&steam_id.steam3()), Ok(steam_id));
        assert_eq!(SteamId::from_steam2(&steam_id.steam2()), Ok(steam_id));
    }
}
