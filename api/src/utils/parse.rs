use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Deserializer};
use std::str::FromStr;

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

fn steamid64_to_steamid3(steam_id: u64) -> u32 {
    // If steam id is smaller than the Steam ID 64 identifier, it's a Steam ID 3
    if steam_id < STEAM_ID_64_IDENT {
        return steam_id as u32;
    }
    (steam_id - STEAM_ID_64_IDENT) as u32
}

pub(crate) fn parse_steam_id<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    u64::deserialize(deserializer)
        .map_err(serde::de::Error::custom)
        .map(steamid64_to_steamid3)
        .and_then(|steam_id| {
            (steam_id > 0)
                .then_some(steam_id)
                .ok_or_else(|| serde::de::Error::custom("Invalid steam id"))
        })
}

pub(crate) fn parse_steam_id_option<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<u64>::deserialize(deserializer)
        .map_err(serde::de::Error::custom)
        .map(|steam_id| steam_id.map(steamid64_to_steamid3))
        .map(|steam_id| steam_id.filter(|&s| s > 0))
}

// Query Parameter Parsing
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum CommaSeparatedNum<T>
where
    T: std::fmt::Debug + FromStr,
{
    /// A List of numbers in a single comma separated string, e.g. "1,2,3"
    CommaStringList(String),
    /// A List of numbers in a string array, e.g. ["1", "2", "3"]
    StringList(Vec<String>),
    /// A single number, e.g. 1
    Single(T),
    /// A list of numbers, e.g. [1, 2, 3]
    List(Vec<T>),
}

pub(crate) fn comma_separated_num_deserialize_option<'de, D, T>(
    deserializer: D,
) -> Result<Option<Vec<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: FromStr + Deserialize<'de> + std::fmt::Debug,
{
    let deserialized: Option<CommaSeparatedNum<T>> = Option::deserialize(deserializer)?;
    let Some(deserialized) = deserialized else {
        return Ok(None);
    };

    Ok(match deserialized {
        CommaSeparatedNum::List(vec) => Some(vec),
        CommaSeparatedNum::Single(val) => Some(vec![val]),
        CommaSeparatedNum::StringList(val) => {
            let mut out = vec![];
            for s in val {
                let parsed = s
                    .parse()
                    .map_err(|_| serde::de::Error::custom("Failed to parse list item"))?;
                out.push(parsed);
            }
            match out.is_empty() {
                true => None,
                false => Some(out),
            }
        }
        CommaSeparatedNum::CommaStringList(str) => {
            let str = str.replace("[", "").replace("]", "");

            // If the string is empty, return None
            if str.is_empty() {
                return Ok(None);
            }

            let mut out = vec![];
            for s in str.split(',') {
                let parsed = s.trim().parse().map_err(|_| {
                    serde::de::Error::custom("Failed to parse comma separated list")
                })?;
                out.push(parsed);
            }
            match out.is_empty() {
                true => None,
                false => Some(out),
            }
        }
    })
}

pub(crate) fn default_last_month_timestamp() -> Option<u64> {
    let now = chrono::Utc::now().date_naive();
    let last_month = now - chrono::Duration::days(30);
    let last_month = last_month.and_hms_opt(0, 0, 0)?;
    Some(last_month.and_utc().timestamp() as u64)
}

pub(crate) fn default_true_option() -> Option<bool> {
    true.into()
}

pub(crate) fn default_true() -> bool {
    true
}

type QueryParam<'a> = (&'a str, &'a str);
type QueryParams<'a> = Vec<QueryParam<'a>>;
pub(crate) fn querify(string: &str) -> QueryParams {
    let mut v = Vec::new();
    for pair in string.split('&') {
        let mut it = pair.split('=').take(2);
        let kv = match (it.next(), it.next()) {
            (Some(k), Some(v)) => (k, v),
            _ => continue,
        };
        v.push(kv);
    }
    v
}
pub fn stringify(query: QueryParams) -> String {
    query.iter().fold(String::new(), |acc, &tuple| {
        acc + tuple.0 + "=" + tuple.1 + "&"
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use rstest::rstest;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct SteamIdTestStruct {
        #[serde(deserialize_with = "parse_steam_id")]
        steam_id: u32,
    }

    #[rstest]
    #[case(76561198123456789u64, 163191061u32)] // Steam ID 64 to Steam ID 32
    #[case(123456u64, 123456u32)] // Steam ID 32 stays the same
    fn test_parse_steam_id_valid(#[case] input: u64, #[case] expected: u32) {
        let json = format!("{{\"steam_id\": {input}}}");
        let result: SteamIdTestStruct = serde_json::from_str(&json).unwrap();
        assert_eq!(result.steam_id, expected);
    }

    #[rstest]
    #[case(0u64)] // Invalid Steam ID (0)
    fn test_parse_steam_id_invalid(#[case] input: u64) {
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
    fn test_parse_steam_id_option(#[case] json: &str, #[case] expected: Option<u32>) {
        let result: SteamIdOptionTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.steam_id, expected);
    }

    #[derive(Deserialize, Debug)]
    struct CommaSeparatedTestStruct {
        #[serde(deserialize_with = "comma_separated_num_deserialize_option")]
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
    fn test_comma_separated_num_deserialize_option(
        #[case] json: &str,
        #[case] expected: Option<Vec<u32>>,
    ) {
        let result: CommaSeparatedTestStruct = serde_json::from_str(json).unwrap();
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
    fn test_comma_separated_num_deserialize_option_invalid(#[case] json: &str) {
        let result = serde_json::from_str::<CommaSeparatedTestStruct>(json);
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

        let now = Utc::now().timestamp() as u64;
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
        let query = querify("key1=value1&key2=value2&key3=value3");
        assert_eq!(
            query,
            vec![("key1", "value1"), ("key2", "value2"), ("key3", "value3")]
        );
    }

    #[test]
    fn test_stringify() {
        let query = vec![("key1", "value1"), ("key2", "value2"), ("key3", "value3")];
        assert_eq!(stringify(query), "key1=value1&key2=value2&key3=value3&");
    }
}
