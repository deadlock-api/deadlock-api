use core::num::TryFromIntError;
use core::str::FromStr;

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Deserializer};

// Date Parsing
pub(crate) fn parse_rfc2822_datetime<'de, D>(
    deserializer: D,
) -> Result<DateTime<FixedOffset>, D::Error>
where
    D: Deserializer<'de>,
{
    String::deserialize(deserializer)
        .map_err(serde::de::Error::custom)
        .and_then(|s| DateTime::parse_from_rfc2822(&s).map_err(serde::de::Error::custom))
}

// Steam ID Parsing
const STEAM_ID_64_IDENT: u64 = 76561197960265728;

pub(crate) fn steamid64_to_steamid3(steam_id: u64) -> Result<u32, TryFromIntError> {
    // If steam id is smaller than the Steam ID 64 identifier, it's a Steam ID 3
    if steam_id < STEAM_ID_64_IDENT {
        return u32::try_from(steam_id);
    }
    // (steam_id - STEAM_ID_64_IDENT) as u32
    u32::try_from(steam_id - STEAM_ID_64_IDENT)
}

pub(crate) fn steamid3_to_steamid64(steam_id: u32) -> u64 {
    u64::from(steam_id) + STEAM_ID_64_IDENT
}

/// A Steam account id as sent by a client: a number or a string, `SteamID3` or `SteamID64`.
#[derive(Deserialize)]
#[serde(untagged)]
enum SteamIdRaw {
    U64(u64),
    String(String),
}

impl SteamIdRaw {
    fn steam_id3(self) -> Result<u32, String> {
        let steam_id = match self {
            Self::U64(v) => v,
            Self::String(s) => s
                .trim()
                .parse::<u64>()
                .map_err(|_| "Invalid steam id string".to_owned())?,
        };
        steamid64_to_steamid3(steam_id).map_err(|_| format!("Invalid steam id: {steam_id}"))
    }
}

/// Converts one entry of an account id list to a `SteamID3`. The `SteamID64` of account 0 is
/// rejected, as the single id parsers do.
pub(crate) fn list_steam_id3(steam_id: u64) -> Result<u32, String> {
    if steam_id == STEAM_ID_64_IDENT {
        return Err(format!("Invalid steam id: {steam_id}"));
    }
    steamid64_to_steamid3(steam_id).map_err(|_| format!("Invalid steam id: {steam_id}"))
}

fn steam_ids3<E: serde::de::Error>(steam_ids: Vec<u64>) -> Result<Vec<u32>, E> {
    steam_ids
        .into_iter()
        .map(|id| list_steam_id3(id).map_err(E::custom))
        .collect()
}

pub(crate) fn parse_steam_id<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    let steam_id3 = SteamIdRaw::deserialize(deserializer)?
        .steam_id3()
        .map_err(serde::de::Error::custom)?;
    if steam_id3 == 0 {
        return Err(serde::de::Error::custom("Invalid steam id"));
    }
    Ok(steam_id3)
}

/// Like [`parse_steam_id`], but `0` means no account (the filter is left out).
pub(crate) fn parse_steam_id_option<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    let steam_id3 = Option::<SteamIdRaw>::deserialize(deserializer)?
        .map(SteamIdRaw::steam_id3)
        .transpose()
        .map_err(serde::de::Error::custom)?;
    Ok(steam_id3.filter(|&id| id > 0))
}

/// A comma separated list of Steam account ids, `SteamID3` or `SteamID64`, as `SteamID3`s.
pub(crate) fn comma_separated_steam_ids<'de, D>(deserializer: D) -> Result<Vec<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    steam_ids3(comma_separated_deserialize::<D, u64>(deserializer)?)
}

/// [`comma_separated_steam_ids`] for an optional parameter.
pub(crate) fn comma_separated_steam_ids_option<'de, D>(
    deserializer: D,
) -> Result<Option<Vec<u32>>, D::Error>
where
    D: Deserializer<'de>,
{
    comma_separated_deserialize_option::<D, u64>(deserializer)?
        .map(steam_ids3)
        .transpose()
}

// Query Parameter Parsing
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum CommaSeparated<T>
where
    T: core::fmt::Debug + FromStr,
{
    /// A List of numbers in a single comma separated string, e.g. "1,2,3"
    CommaStringList(String),
    /// A List of numbers in a string array, e.g. `["1", "2", "3"]`
    StringList(Vec<String>),
    /// A single number, e.g. 1
    Single(T),
    /// A list of numbers, e.g. [1, 2, 3]
    List(Vec<T>),
}

impl<T> CommaSeparated<T>
where
    T: core::fmt::Debug + FromStr,
{
    fn into_vec<E: serde::de::Error>(self) -> Result<Vec<T>, E> {
        match self {
            Self::List(vec) => Ok(vec),
            Self::Single(val) => Ok(vec![val]),
            Self::StringList(val) => val
                .iter()
                .map(|s| {
                    s.parse()
                        .map_err(|_| E::custom("Failed to parse list item"))
                })
                .collect(),
            Self::CommaStringList(str) => {
                let str = str.replace(['[', ']'], "");
                if str.is_empty() {
                    return Ok(vec![]);
                }
                str.split(',')
                    .map(|s| {
                        s.trim()
                            .parse()
                            .map_err(|_| E::custom("Failed to parse comma separated list"))
                    })
                    .collect()
            }
        }
    }
}

pub(crate) fn comma_separated_deserialize_option<'de, D, T>(
    deserializer: D,
) -> Result<Option<Vec<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: FromStr + Deserialize<'de> + core::fmt::Debug,
{
    let Some(parsed) = Option::<CommaSeparated<T>>::deserialize(deserializer)? else {
        return Ok(None);
    };
    let out = parsed.into_vec()?;
    Ok((!out.is_empty()).then_some(out))
}

pub(crate) fn comma_separated_deserialize<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: FromStr + Deserialize<'de> + core::fmt::Debug,
{
    CommaSeparated::deserialize(deserializer)?.into_vec()
}

/// Deserializes a repeatable, comma-separated list query parameter into a list of
/// "chains" (`Vec<Vec<u32>>`). Each occurrence of the parameter is one comma-separated
/// ordered list, e.g. `item_order=1,2,3` -> `[[1, 2, 3]]` and
/// `item_order=1,2&item_order=3,4` -> `[[1, 2], [3, 4]]`. Tolerates surrounding
/// brackets and whitespace like [`comma_separated_deserialize_option`]. Empty input
/// (and empty chains) collapse away; the result is `None` when nothing remains.
pub(crate) fn comma_separated_chains_deserialize_option<'de, D>(
    deserializer: D,
) -> Result<Option<Vec<Vec<u32>>>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ChainsRaw {
        /// A single occurrence, e.g. `"1,2,3"`.
        One(String),
        /// Multiple occurrences (repeated key) or a string array, e.g. `["1,2", "3,4"]`.
        Many(Vec<String>),
    }

    let Some(raw) = Option::<ChainsRaw>::deserialize(deserializer)? else {
        return Ok(None);
    };
    let chain_strs = match raw {
        ChainsRaw::One(s) => vec![s],
        ChainsRaw::Many(v) => v,
    };

    let mut chains = Vec::new();
    for chain_str in chain_strs {
        let chain_str = chain_str.replace(['[', ']'], "");
        let mut chain = Vec::new();
        for part in chain_str.split(',') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            let id = part
                .parse()
                .map_err(|_| serde::de::Error::custom("Failed to parse item_order list"))?;
            chain.push(id);
        }
        if !chain.is_empty() {
            chains.push(chain);
        }
    }

    Ok((!chains.is_empty()).then_some(chains))
}

/// March 1, 2026 00:00:00 UTC — absolute minimum for demo_player-based endpoints.
pub(crate) const MIN_DEMO_PLAYER_TIMESTAMP: i64 = 1_772_323_200;

pub(crate) fn default_last_month_timestamp() -> Option<i64> {
    let now = chrono::Utc::now().date_naive();
    let last_month = now - chrono::Duration::days(30);
    let last_month = last_month.and_hms_opt(0, 0, 0)?;
    last_month.and_utc().timestamp().into()
}

pub(crate) fn default_true_option() -> Option<bool> {
    true.into()
}

pub(crate) fn default_true() -> bool {
    true
}

/// The `key=value` pairs of a raw query string, skipping pairs with an empty key or value.
/// Values are not percent-decoded.
pub(crate) fn querify(string: &str) -> impl Iterator<Item = (&str, &str)> {
    string.split('&').filter_map(|pair| {
        let mut it = pair.split('=');
        match (it.next(), it.next()) {
            (Some(k), Some(v)) if !k.is_empty() && !v.is_empty() => Some((k, v)),
            _ => None,
        }
    })
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use rstest::rstest;
    use serde::Deserialize;

    use super::*;

    #[derive(Deserialize)]
    struct SteamIdTestStruct {
        #[serde(deserialize_with = "parse_steam_id")]
        steam_id: u32,
    }

    #[rstest]
    #[case(76561198123456789u64, 163191061u32)] // Steam ID 64 to Steam ID 32
    #[case(123456u64, 123456u32)] // Steam ID 32 stays the same
    fn test_parse_steam_id3_valid(#[case] input: u64, #[case] expected: u32) {
        let json = format!("{{\"steam_id\": {input}}}");
        let result: SteamIdTestStruct = serde_json::from_str(&json).unwrap();
        assert_eq!(result.steam_id, expected);
    }

    #[rstest]
    #[case("76561198123456789", 163191061u32)] // Steam ID 64 to Steam ID 32
    #[case("123456", 123456u32)] // Steam ID 32 stays the same
    #[case(" 76561198123456789 ", 163191061u32)] // Padded
    fn test_parse_steam_id3_valid_from_string(#[case] input: String, #[case] expected: u32) {
        let json = format!("{{\"steam_id\": \"{input}\"}}");
        let result: SteamIdTestStruct = serde_json::from_str(&json).unwrap();
        assert_eq!(result.steam_id, expected);
    }

    #[rstest]
    #[case(123456u32, 76561197960389184u64)] // Steam ID 32 to Steam ID 64
    fn test_parse_steam_id64_valid(#[case] input: u32, #[case] expected: u64) {
        let result = steamid3_to_steamid64(input);
        assert_eq!(result, expected);
    }

    #[rstest]
    #[case("0")] // Invalid Steam ID (0)
    #[case("76561197960265728")] // Steam ID 64 of account 0
    #[case("4294967296")] // Too big for a Steam ID 32, too small for a Steam ID 64
    #[case("\"abc\"")]
    fn test_parse_steam_id_invalid(#[case] input: &str) {
        let json = format!("{{\"steam_id\": {input}}}");
        let result = serde_json::from_str::<SteamIdTestStruct>(&json);
        assert!(result.is_err());
    }

    #[derive(Deserialize)]
    struct SteamIdOptionTestStruct {
        #[serde(deserialize_with = "parse_steam_id_option")]
        steam_id: Option<u32>,
    }

    #[rstest]
    #[case("{\"steam_id\": 76561198123456789}", Some(163191061u32))] // Steam ID 64 to Steam ID 32
    #[case("{\"steam_id\": 123456}", Some(123456u32))] // Steam ID 32 stays the same
    #[case("{\"steam_id\": 0}", None)] // Invalid Steam ID (0) becomes None
    #[case("{\"steam_id\": null}", None)] // Null becomes None
    #[case("{\"steam_id\": \"76561198123456789\"}", Some(163191061u32))] // As a string, like a query value
    #[case("{\"steam_id\": \" 123456 \"}", Some(123456u32))] // Padded, like parse_steam_id accepts
    #[case("{\"steam_id\": \"0\"}", None)] // 0 as a string also becomes None
    fn test_parse_steam_id_option(#[case] json: &str, #[case] expected: Option<u32>) {
        let result: SteamIdOptionTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.steam_id, expected);
    }

    #[rstest]
    #[case("{\"steam_id\": 4294967296}")] // Too big for a Steam ID 32, too small for a Steam ID 64
    #[case("{\"steam_id\": \"4294967296\"}")]
    #[case("{\"steam_id\": \"abc\"}")]
    fn test_parse_steam_id_option_invalid(#[case] json: &str) {
        assert!(serde_json::from_str::<SteamIdOptionTestStruct>(json).is_err());
    }

    #[derive(Deserialize, Debug)]
    struct SteamIdsTestStruct {
        #[serde(deserialize_with = "comma_separated_steam_ids")]
        ids: Vec<u32>,
    }

    #[rstest]
    #[case("{\"ids\": \"123456,76561198123456789\"}", vec![123456, 163191061])] // Steam ID 32 and 64 mixed
    #[case("{\"ids\": \" 123456 , 76561198123456789 \"}", vec![123456, 163191061])] // Padded entries
    #[case("{\"ids\": \"[123456,76561198123456789]\"}", vec![123456, 163191061])] // Bracketed string
    #[case("{\"ids\": [123456, 76561198123456789]}", vec![123456, 163191061])] // Number array
    #[case("{\"ids\": [\"123456\", \"76561198123456789\"]}", vec![123456, 163191061])] // String array
    #[case("{\"ids\": 76561198123456789}", vec![163191061])] // Single number
    fn test_comma_separated_steam_ids(#[case] json: &str, #[case] expected: Vec<u32>) {
        let result: SteamIdsTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.ids, expected);
    }

    #[rstest]
    #[case("{\"ids\": \"123456,a\"}")]
    #[case("{\"ids\": \"123456,4294967296\"}")] // One invalid id fails the whole list
    #[case("{\"ids\": [4294967296]}")]
    #[case("{\"ids\": \"123456,76561197960265728\"}")] // Steam ID 64 of account 0
    fn test_comma_separated_steam_ids_invalid(#[case] json: &str) {
        assert!(serde_json::from_str::<SteamIdsTestStruct>(json).is_err());
    }

    #[derive(Deserialize, Debug)]
    struct SteamIdsOptionTestStruct {
        #[serde(default, deserialize_with = "comma_separated_steam_ids_option")]
        ids: Option<Vec<u32>>,
    }

    #[rstest]
    #[case("{\"ids\": \"123456,76561198123456789\"}", Some(vec![123456, 163191061]))] // Steam ID 32 and 64 mixed
    #[case("{\"ids\": \"76561198123456789\"}", Some(vec![163191061]))]
    #[case("{\"ids\": [123456, 76561198123456789]}", Some(vec![123456, 163191061]))] // Number array
    #[case("{\"ids\": \"\"}", None)] // Empty string
    #[case("{\"ids\": null}", None)]
    #[case("{}", None)]
    fn test_comma_separated_steam_ids_option(
        #[case] json: &str,
        #[case] expected: Option<Vec<u32>>,
    ) {
        let result: SteamIdsOptionTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.ids, expected);
    }

    #[rstest]
    #[case("{\"ids\": \"a\"}")]
    #[case("{\"ids\": \"4294967296\"}")] // Too big for a Steam ID 32, too small for a Steam ID 64
    #[case("{\"ids\": \"76561197960265728\"}")] // Steam ID 64 of account 0
    fn test_comma_separated_steam_ids_option_invalid(#[case] json: &str) {
        assert!(serde_json::from_str::<SteamIdsOptionTestStruct>(json).is_err());
    }

    #[derive(Deserialize, Debug)]
    struct CommaSeparatedOptionTestStruct {
        #[serde(deserialize_with = "comma_separated_deserialize_option")]
        ids: Option<Vec<u32>>,
    }

    #[rstest]
    #[case("{\"ids\": \"1,2,3\"}", Some(vec![1, 2, 3]))] // Comma-separated string
    #[case("{\"ids\": [1, 2, 3]}", Some(vec![1, 2, 3]))] // Array
    #[case("{\"ids\": 1}", Some(vec![1]))] // Single value
    #[case("{\"ids\": [\"1\", \"2\", \"3\"]}", Some(vec![1, 2, 3]))] // String array
    #[case("{\"ids\": null}", None)] // Null
    #[case("{\"ids\": \"[1,2,3]\"}", Some(vec![1, 2, 3]))] // Brackets
    #[case("{\"ids\": \"1, 2, 3\"}", Some(vec![1, 2, 3]))] // Spaces
    #[case("{\"ids\": \"1,2, 3\"}", Some(vec![1, 2, 3]))] // Mixed spaces and no spaces
    #[case("{\"ids\": \"\"}", None)] // Empty string
    #[case("{\"ids\": []}", None)] // Empty array
    fn test_comma_separated_deserialize_option(
        #[case] json: &str,
        #[case] expected: Option<Vec<u32>>,
    ) {
        let result: CommaSeparatedOptionTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.ids, expected);
    }

    #[rstest]
    #[case("{\"ids\": \"a\"}")]
    #[case("{\"ids\": \"a,b,c\"}")]
    #[case("{\"ids\": [\"a\", \"b\", \"c\"]}")]
    #[case("{\"ids\": \"1,2,notanumber\"}")]
    #[case("{\"ids\": [1, 2, \"oops\"]}")]
    #[case("{\"ids\": [18446744073709551615u64]}")] // u64 that overflows u32
    #[case("{\"ids\": \"1,\"2\", 3\"}")] // Mixed numbers and strings, do we want to support this?
    fn test_comma_separated_deserialize_option_invalid(#[case] json: &str) {
        let result = serde_json::from_str::<CommaSeparatedOptionTestStruct>(json);
        assert!(result.is_err());
    }

    #[derive(Deserialize)]
    struct CommaSeparatedTestStruct {
        #[serde(deserialize_with = "comma_separated_deserialize")]
        ids: Vec<u32>,
    }

    #[rstest]
    #[case("{\"ids\": \"1,2,3\"}", vec![1, 2, 3])] // Comma-separated string
    #[case("{\"ids\": [1, 2, 3]}", vec![1, 2, 3])] // Array
    #[case("{\"ids\": 1}", vec![1])] // Single value
    #[case("{\"ids\": [\"1\", \"2\", \"3\"]}", vec![1, 2, 3])] // String array
    #[case("{\"ids\": \"[1,2,3]\"}", vec![1, 2, 3])] // Brackets
    #[case("{\"ids\": \"1, 2, 3\"}", vec![1, 2, 3])] // Spaces
    #[case("{\"ids\": \"1,2, 3\"}", vec![1, 2, 3])] // Mixed spaces and no spaces
    fn test_comma_separated_deserialize(#[case] json: &str, #[case] expected: Vec<u32>) {
        let result: CommaSeparatedTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.ids, expected);
    }

    #[rstest]
    #[case("{\"ids\": \"a\"}")]
    #[case("{\"ids\": \"a,b,c\"}")]
    #[case("{\"ids\": [\"a\", \"b\", \"c\"]}")]
    #[case("{\"ids\": \"1,2,notanumber\"}")]
    #[case("{\"ids\": [1, 2, \"oops\"]}")]
    #[case("{\"ids\": [18446744073709551615]}")] // u64 that overflows u32
    #[case("{\"ids\": \"1,\"2\", 3\"}")] // Mixed numbers and strings, do we want to support this?
    fn test_comma_separated_deserialize_invalid(#[case] json: &str) {
        let result = serde_json::from_str::<CommaSeparatedTestStruct>(json);
        assert!(result.is_err());
    }

    #[derive(Deserialize, Debug)]
    struct ChainsOptionTestStruct {
        #[serde(
            default,
            deserialize_with = "comma_separated_chains_deserialize_option"
        )]
        order: Option<Vec<Vec<u32>>>,
    }

    #[rstest]
    #[case("{\"order\": \"1,2,3\"}", Some(vec![vec![1, 2, 3]]))] // single chain
    #[case("{\"order\": [\"1,2\", \"3,4\"]}", Some(vec![vec![1, 2], vec![3, 4]]))] // repeated keys
    #[case("{\"order\": \"1, 2, 3\"}", Some(vec![vec![1, 2, 3]]))] // spaces
    #[case("{\"order\": \"[1,2]\"}", Some(vec![vec![1, 2]]))] // brackets
    #[case("{\"order\": [\"1,2\", \"\"]}", Some(vec![vec![1, 2]]))] // empty chain dropped
    #[case("{\"order\": \"\"}", None)] // empty string
    #[case("{\"order\": null}", None)] // null
    #[case("{\"order\": []}", None)] // empty array
    #[case("{}", None)] // missing
    fn test_comma_separated_chains_deserialize_option(
        #[case] json: &str,
        #[case] expected: Option<Vec<Vec<u32>>>,
    ) {
        let result: ChainsOptionTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.order, expected);
    }

    #[rstest]
    #[case("{\"order\": \"1,x\"}")]
    #[case("{\"order\": [\"1,2\", \"a\"]}")]
    #[case("{\"order\": \"1,2,notanumber\"}")]
    fn test_comma_separated_chains_deserialize_option_invalid(#[case] json: &str) {
        let result = serde_json::from_str::<ChainsOptionTestStruct>(json);
        assert!(result.is_err());
    }

    #[derive(Deserialize)]
    struct DateTimeTestStruct {
        #[serde(deserialize_with = "parse_rfc2822_datetime")]
        date: DateTime<FixedOffset>,
    }

    #[rstest]
    #[case(
        "{\"date\": \"Wed, 21 Oct 2015 07:28:00 GMT\"}",
        "Wed, 21 Oct 2015 07:28:00 +0000"
    )]
    fn test_parse_rfc2822_datetime_valid(#[case] json: &str, #[case] expected: &str) {
        let result: DateTimeTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.date.to_rfc2822(), expected);
    }

    #[rstest]
    #[case("{\"date\": \"2015-10-21T07:28:00Z\"}")]
    fn test_parse_rfc2822_datetime_invalid(#[case] json: &str) {
        let result = serde_json::from_str::<DateTimeTestStruct>(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_default_last_month_timestamp() {
        let result = default_last_month_timestamp();
        assert!(result.is_some());

        let now = Utc::now().timestamp();
        let one_month_ago = now - (30 * 24 * 60 * 60); // 30 days in seconds

        // The result should be approximately one month ago (allowing for some difference due to time of day)
        let timestamp = result.unwrap();
        let diff = timestamp.abs_diff(one_month_ago);

        // The difference should be less than 24 hours (86400 seconds)
        assert!(diff < 86400, "Timestamp difference is too large: {diff}");
    }

    #[test]
    fn test_default_true_option() {
        assert_eq!(default_true_option(), Some(true));
    }

    #[test]
    fn test_default_true() {
        assert!(default_true());
    }

    #[test]
    fn test_querify() {
        fn querify(s: &str) -> Vec<(&str, &str)> {
            super::querify(s).collect()
        }
        assert_eq!(
            querify("a=1&b=2&c=3"),
            vec![("a", "1"), ("b", "2"), ("c", "3")]
        );
        assert_eq!(
            querify("a=1&b=2&c=3&"),
            vec![("a", "1"), ("b", "2"), ("c", "3")]
        );
        assert_eq!(
            querify("a=1&b=2&c=3&d"),
            vec![("a", "1"), ("b", "2"), ("c", "3")]
        );
        assert_eq!(
            querify("a=1&b=2&c=3&d="),
            vec![("a", "1"), ("b", "2"), ("c", "3")]
        );
        assert_eq!(
            querify("a=1&b=2&c=3&d=4"),
            vec![("a", "1"), ("b", "2"), ("c", "3"), ("d", "4")]
        );
    }
}
