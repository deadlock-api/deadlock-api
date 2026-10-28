//! Deserializing [`SteamId`]s and the account ids of players sent by clients.
//!
//! Ids are numbers or strings: account id (`SteamID3`), `SteamID64`, Steam3 or Steam2 id. The
//! account id deserializers reject account 0, except [`account_id_option`], which reads it as no
//! account.

use core::fmt::{self, Formatter};

use serde::de::{Error, Visitor};
use serde::{Deserialize, Deserializer};

use crate::SteamId;

struct SteamIdVisitor;

impl Visitor<'_> for SteamIdVisitor {
    type Value = SteamId;

    fn expecting(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        formatter.write_str("a steam id")
    }

    fn visit_u64<E: Error>(self, v: u64) -> Result<SteamId, E> {
        SteamId::from_account_or_steam64(v)
            .map_err(|_invalid| E::custom(format!("Invalid steam id: {v}")))
    }

    fn visit_i64<E: Error>(self, v: i64) -> Result<SteamId, E> {
        let v =
            u64::try_from(v).map_err(|_negative| E::custom(format!("Invalid steam id: {v}")))?;
        self.visit_u64(v)
    }

    fn visit_str<E: Error>(self, v: &str) -> Result<SteamId, E> {
        v.trim()
            .parse()
            .map_err(|_invalid| E::custom(format!("Invalid steam id: {v}")))
    }
}

/// A number as in [`SteamId::from_account_or_steam64`], or a string as in its [`FromStr`] impl,
/// trimmed.
///
/// [`FromStr`]: core::str::FromStr
impl<'de> Deserialize<'de> for SteamId {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(SteamIdVisitor)
    }
}

/// The account id, `None` for account 0.
fn account_id_nonzero(steam_id: SteamId) -> Option<u32> {
    Some(steam_id.account_id()).filter(|&id| id > 0)
}

fn account_id_required<E: Error>(steam_id: SteamId) -> Result<u32, E> {
    account_id_nonzero(steam_id).ok_or_else(|| E::custom("Invalid steam id: 0"))
}

/// A list of steam ids.
#[derive(Deserialize)]
#[serde(untagged)]
enum SteamIds {
    /// A comma separated string, optionally in brackets, e.g. `"1,2,3"` or `"[1,2,3]"`
    Text(String),
    /// An array of numbers or strings, e.g. `[1, 2, 3]` or `["1", "2", "3"]`
    List(Vec<SteamId>),
    /// A single number, e.g. `1`
    Single(SteamId),
}

impl SteamIds {
    fn account_ids<E: Error>(self) -> Result<Vec<u32>, E> {
        let steam_ids = match self {
            Self::List(steam_ids) => steam_ids,
            Self::Single(steam_id) => vec![steam_id],
            Self::Text(text) => {
                let text = text.trim();
                // Brackets around the list, not those of a Steam3 id like `[U:1:5]`.
                let text = text
                    .strip_prefix('[')
                    .and_then(|s| s.strip_suffix(']'))
                    .filter(|s| !s.trim_start().starts_with(char::is_alphabetic))
                    .unwrap_or(text);
                if text.trim().is_empty() {
                    return Ok(vec![]);
                }
                text.split(',')
                    .map(|s| SteamIdVisitor.visit_str(s))
                    .collect::<Result<_, E>>()?
            }
        };
        steam_ids.into_iter().map(account_id_required).collect()
    }
}

/// The account id of a player.
pub fn account_id<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u32, D::Error> {
    account_id_required(SteamId::deserialize(deserializer)?)
}

/// Like [`account_id`], but account 0 means no account.
pub fn account_id_option<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<u32>, D::Error> {
    Ok(Option::<SteamId>::deserialize(deserializer)?.and_then(account_id_nonzero))
}

/// The account ids of players, e.g. from a comma separated string. One invalid id fails the
/// whole list.
pub fn account_ids<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<u32>, D::Error> {
    SteamIds::deserialize(deserializer)?.account_ids()
}

/// [`account_ids`] for an optional parameter; an empty list is `None`.
pub fn account_ids_option<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Vec<u32>>, D::Error> {
    let Some(steam_ids) = Option::<SteamIds>::deserialize(deserializer)? else {
        return Ok(None);
    };
    let account_ids = steam_ids.account_ids()?;
    Ok((!account_ids.is_empty()).then_some(account_ids))
}

#[cfg(test)]
mod tests {
    use rstest::rstest;
    use serde::Deserialize;

    use super::*;

    #[derive(Deserialize)]
    struct AccountId {
        #[serde(deserialize_with = "account_id")]
        steam_id: u32,
    }

    #[rstest]
    #[case("76561198123456789", 163191061)] // SteamID64
    #[case("123456", 123456)] // SteamID3 stays the same
    #[case("\"76561198123456789\"", 163191061)] // As a string
    #[case("\"123456\"", 123456)]
    #[case("\" 76561198123456789 \"", 163191061)] // Padded
    #[case("\"[U:1:163191061]\"", 163191061)] // Steam3
    #[case("\"STEAM_1:1:81595530\"", 163191061)] // Steam2
    fn test_account_id(#[case] input: &str, #[case] expected: u32) {
        let json = format!("{{\"steam_id\": {input}}}");
        let result: AccountId = serde_json::from_str(&json).unwrap();
        assert_eq!(result.steam_id, expected);
    }

    #[rstest]
    #[case("0")] // Account 0
    #[case("76561197960265728")] // SteamID64 of account 0
    #[case("4294967296")] // Too big for a SteamID3, too small for a SteamID64
    #[case("-1")]
    #[case("\"abc\"")]
    #[case("\"[g:1:4]\"")] // A clan
    fn test_account_id_invalid(#[case] input: &str) {
        let json = format!("{{\"steam_id\": {input}}}");
        assert!(serde_json::from_str::<AccountId>(&json).is_err());
    }

    #[derive(Deserialize)]
    struct AccountIdOption {
        #[serde(deserialize_with = "account_id_option")]
        steam_id: Option<u32>,
    }

    #[rstest]
    #[case("{\"steam_id\": 76561198123456789}", Some(163191061))] // SteamID64
    #[case("{\"steam_id\": 123456}", Some(123456))] // SteamID3 stays the same
    #[case("{\"steam_id\": 0}", None)] // Account 0 is no account
    #[case("{\"steam_id\": null}", None)]
    #[case("{\"steam_id\": \"76561198123456789\"}", Some(163191061))] // As a string, like a query value
    #[case("{\"steam_id\": \" 123456 \"}", Some(123456))] // Padded
    #[case("{\"steam_id\": \"0\"}", None)]
    fn test_account_id_option(#[case] json: &str, #[case] expected: Option<u32>) {
        let result: AccountIdOption = serde_json::from_str(json).unwrap();
        assert_eq!(result.steam_id, expected);
    }

    #[rstest]
    #[case("{\"steam_id\": 4294967296}")] // Too big for a SteamID3, too small for a SteamID64
    #[case("{\"steam_id\": \"4294967296\"}")]
    #[case("{\"steam_id\": \"abc\"}")]
    fn test_account_id_option_invalid(#[case] json: &str) {
        assert!(serde_json::from_str::<AccountIdOption>(json).is_err());
    }

    #[derive(Deserialize, Debug)]
    struct AccountIds {
        #[serde(deserialize_with = "account_ids")]
        ids: Vec<u32>,
    }

    #[rstest]
    #[case("{\"ids\": \"123456,76561198123456789\"}", vec![123456, 163191061])] // SteamID3 and 64 mixed
    #[case("{\"ids\": \" 123456 , 76561198123456789 \"}", vec![123456, 163191061])] // Padded entries
    #[case("{\"ids\": \"[123456,76561198123456789]\"}", vec![123456, 163191061])] // Bracketed string
    #[case("{\"ids\": \"[U:1:123456],[U:1:163191061]\"}", vec![123456, 163191061])] // Steam3 ids
    #[case("{\"ids\": \"[U:1:123456]\"}", vec![123456])]
    #[case("{\"ids\": [123456, 76561198123456789]}", vec![123456, 163191061])] // Number array
    #[case("{\"ids\": [\"123456\", \"76561198123456789\"]}", vec![123456, 163191061])] // String array
    #[case("{\"ids\": [123456, \"76561198123456789\"]}", vec![123456, 163191061])] // Mixed array
    #[case("{\"ids\": 76561198123456789}", vec![163191061])] // Single number
    #[case("{\"ids\": \"\"}", vec![])]
    #[case("{\"ids\": \"[]\"}", vec![])]
    fn test_account_ids(#[case] json: &str, #[case] expected: Vec<u32>) {
        let result: AccountIds = serde_json::from_str(json).unwrap();
        assert_eq!(result.ids, expected);
    }

    #[rstest]
    #[case("{\"ids\": \"123456,a\"}")]
    #[case("{\"ids\": \"123456,4294967296\"}")] // One invalid id fails the whole list
    #[case("{\"ids\": [4294967296]}")]
    #[case("{\"ids\": \"123456,76561197960265728\"}")] // SteamID64 of account 0
    #[case("{\"ids\": \"123456,0\"}")] // Account 0
    #[case("{\"ids\": \"123456,,1\"}")] // Empty entry
    fn test_account_ids_invalid(#[case] json: &str) {
        serde_json::from_str::<AccountIds>(json).unwrap_err();
    }

    #[derive(Deserialize, Debug)]
    struct AccountIdsOption {
        #[serde(default, deserialize_with = "account_ids_option")]
        ids: Option<Vec<u32>>,
    }

    #[rstest]
    #[case("{\"ids\": \"123456,76561198123456789\"}", Some(vec![123456, 163191061]))] // SteamID3 and 64 mixed
    #[case("{\"ids\": \"76561198123456789\"}", Some(vec![163191061]))]
    #[case("{\"ids\": [123456, 76561198123456789]}", Some(vec![123456, 163191061]))] // Number array
    #[case("{\"ids\": \"\"}", None)] // Empty string
    #[case("{\"ids\": []}", None)] // Empty array
    #[case("{\"ids\": null}", None)]
    #[case("{}", None)]
    fn test_account_ids_option(#[case] json: &str, #[case] expected: Option<Vec<u32>>) {
        let result: AccountIdsOption = serde_json::from_str(json).unwrap();
        assert_eq!(result.ids, expected);
    }

    #[rstest]
    #[case("{\"ids\": \"a\"}")]
    #[case("{\"ids\": \"4294967296\"}")] // Too big for a SteamID3, too small for a SteamID64
    #[case("{\"ids\": \"76561197960265728\"}")] // SteamID64 of account 0
    #[case("{\"ids\": \"0\"}")] // Account 0
    fn test_account_ids_option_invalid(#[case] json: &str) {
        serde_json::from_str::<AccountIdsOption>(json).unwrap_err();
    }
}
