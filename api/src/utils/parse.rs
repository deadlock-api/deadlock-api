use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Deserializer};

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
}

pub fn parse_steam_id_option<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Option::<u64>::deserialize(deserializer)
        .ok()
        .and_then(|steam_id| match steam_id {
            Some(steam_id) => {
                if steam_id >= STEAM_ID_64_IDENT {
                    Some((steam_id - STEAM_ID_64_IDENT) as u32)
                } else {
                    Some(steam_id as u32)
                }
            }
            None => None,
        }))
}
