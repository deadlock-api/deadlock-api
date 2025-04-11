use crate::utils::assets;
use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Deserializer};
use std::str::FromStr;

const STEAM_ID_64_IDENT: u64 = 76561197960265728;

pub fn parse_rfc2822_datetime<'de, D>(deserializer: D) -> Result<DateTime<FixedOffset>, D::Error>
where
    D: Deserializer<'de>,
{
    String::deserialize(deserializer)
        .map_err(serde::de::Error::custom)
        .and_then(|s| DateTime::parse_from_rfc2822(&s).map_err(serde::de::Error::custom))
}

pub fn parse_steam_id<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    u64::deserialize(deserializer)
        .map_err(serde::de::Error::custom)
        .map(|steam_id| {
            if steam_id >= STEAM_ID_64_IDENT {
                (steam_id - STEAM_ID_64_IDENT) as u32
            } else {
                steam_id as u32
            }
        })
        .and_then(|steam_id| {
            if steam_id > 0 {
                Ok(steam_id)
            } else {
                Err(serde::de::Error::custom("Invalid steam id"))
            }
        })
}

pub fn parse_steam_id_option<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<u64>::deserialize(deserializer)
        .map_err(serde::de::Error::custom)
        .map(|steam_id| match steam_id {
            Some(steam_id) => {
                if steam_id >= STEAM_ID_64_IDENT {
                    Some((steam_id - STEAM_ID_64_IDENT) as u32)
                } else {
                    Some(steam_id as u32)
                }
            }
            None => None,
        })
        .map(|steam_id| steam_id.filter(|&s| s > 0))
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum CommaSeperatedNum<T>
where
    T: std::fmt::Debug + FromStr,
{
    CommaStringList(String),
    StringList(Vec<String>),
    Single(T),
    List(Vec<T>),
}

pub fn comma_separated_num_deserialize<'de, D, T>(
    deserializer: D,
) -> Result<Option<Vec<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: FromStr + Deserialize<'de> + std::fmt::Debug,
{
    let deserialized: Option<CommaSeperatedNum<T>> = Option::deserialize(deserializer)?;
    let Some(deserialized) = deserialized else {
        return Ok(None);
    };

    Ok(match deserialized {
        CommaSeperatedNum::List(vec) => Some(vec),
        CommaSeperatedNum::Single(val) => Some(vec![val]),
        CommaSeperatedNum::StringList(val) => {
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
        CommaSeperatedNum::CommaStringList(str) => {
            let str = str.replace("[", "").replace("]", "");

            let mut out = vec![];
            for s in str.split(',') {
                let parsed = s.trim().parse().map_err(|_| {
                    serde::de::Error::custom("Failed to parse comma seperated list")
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

pub async fn validate_hero_id(http_client: &reqwest::Client, hero_id: u32) -> bool {
    let Ok(hero_ids) = assets::fetch_heroes(http_client).await else {
        return false;
    };
    hero_ids.iter().any(|h| h.id == hero_id)
}

pub fn default_last_month_timestamp() -> Option<u64> {
    let now = chrono::Utc::now().date_naive();
    let last_month = now - chrono::Duration::days(30);
    let last_month = last_month.and_hms_opt(0, 0, 0)?;
    Some(last_month.and_utc().timestamp() as u64)
}

pub fn default_true() -> Option<bool> {
    true.into()
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
        let json = format!("{{\"steam_id\": {}}}", input);
        let result: SteamIdTestStruct = serde_json::from_str(&json).unwrap();
        assert_eq!(result.steam_id, expected);
    }

    #[rstest]
    #[case(0u64)] // Invalid Steam ID (0)
    fn test_parse_steam_id_invalid(#[case] input: u64) {
        let json = format!("{{\"steam_id\": {}}}", input);
        let result = serde_json::from_str::<SteamIdTestStruct>(&json);
        assert!(result.is_err());
    }

    #[derive(Deserialize)]
    struct SteamIdOptionTestStruct {
        #[serde(deserialize_with = "parse_steam_id_option")]
        steam_id: Option<u32>,
    }

    #[rstest]
    #[case(76561198123456789u64, Some(163191061u32))] // Steam ID 64 to Steam ID 32
    #[case(123456u64, Some(123456u32))] // Steam ID 32 stays the same
    #[case(0u64, None)] // Invalid Steam ID (0) becomes None
    fn test_parse_steam_id_option_with_value(#[case] input: u64, #[case] expected: Option<u32>) {
        let json = format!("{{\"steam_id\": {}}}", input);
        let result: SteamIdOptionTestStruct = serde_json::from_str(&json).unwrap();
        assert_eq!(result.steam_id, expected);
    }

    #[test]
    fn test_parse_steam_id_option_null() {
        let json = "{\"steam_id\": null}";
        let result: SteamIdOptionTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.steam_id, None);
    }

    #[derive(Deserialize, Debug)]
    struct CommaSeparatedTestStruct {
        #[serde(deserialize_with = "comma_separated_num_deserialize")]
        ids: Option<Vec<u32>>,
    }

    #[rstest]
    #[case("{\"ids\": \"1,2,3\"}", Some(vec![1, 2, 3]))] // Comma-separated string
    #[case("{\"ids\": [1, 2, 3]}", Some(vec![1, 2, 3]))] // Array
    #[case("{\"ids\": 1}", Some(vec![1]))] // Single value
    #[case("{\"ids\": [\"1\", \"2\", \"3\"]}", Some(vec![1, 2, 3]))] // String array
    #[case("{\"ids\": null}", None)] // Null
    #[case("{\"ids\": \"[1,2,3]\"}", Some(vec![1, 2, 3]))] // Brackets
    fn test_comma_separated_num_deserialize(
        #[case] json: &str,
        #[case] expected: Option<Vec<u32>>,
    ) {
        let result: CommaSeparatedTestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(result.ids, expected);
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
        let diff = if timestamp > one_month_ago {
            timestamp - one_month_ago
        } else {
            one_month_ago - timestamp
        };

        // The difference should be less than 24 hours (86400 seconds)
        assert!(diff < 86400, "Timestamp difference is too large: {}", diff);
    }

    #[test]
    fn test_default_true() {
        assert_eq!(default_true(), Some(true));
    }
}
