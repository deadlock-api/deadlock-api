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
