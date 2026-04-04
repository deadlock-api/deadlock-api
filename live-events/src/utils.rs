use core::num::TryFromIntError;
use core::str::FromStr;
use core::time::Duration;

use reqwest::Response;
use serde::{Deserialize, Deserializer};

use crate::error::APIError;

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

pub(crate) fn comma_separated_deserialize_option<'de, D, T>(
    deserializer: D,
) -> Result<Option<Vec<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: FromStr + Deserialize<'de> + core::fmt::Debug,
{
    let parsed: CommaSeparated<T> = match Option::deserialize(deserializer)? {
        Some(v) => v,
        None => return Ok(None),
    };

    Ok(match parsed {
        CommaSeparated::List(vec) => Some(vec),
        CommaSeparated::Single(val) => Some(vec![val]),
        CommaSeparated::StringList(val) => {
            let mut out = vec![];
            for s in val {
                let parsed = s
                    .parse()
                    .map_err(|_| serde::de::Error::custom("Failed to parse list item"))?;
                out.push(parsed);
            }
            if out.is_empty() { None } else { Some(out) }
        }
        CommaSeparated::CommaStringList(str) => {
            let str = str.replace(['[', ']'], "");

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
            if out.is_empty() { None } else { Some(out) }
        }
    })
}

const STEAM_ID_64_IDENT: u64 = 76561197960265728;

pub(crate) fn steamid64_to_steamid3(steam_id: u64) -> Result<u32, TryFromIntError> {
    // If steam id is smaller than the Steam ID 64 identifier, it's a Steam ID 3
    if steam_id < STEAM_ID_64_IDENT {
        return u32::try_from(steam_id);
    }
    // (steam_id - STEAM_ID_64_IDENT) as u32
    u32::try_from(steam_id - STEAM_ID_64_IDENT)
}

#[derive(Deserialize, Debug)]
pub(crate) struct SpectateMatchResponse {
    pub broadcast_url: String,
}

pub(crate) async fn spectate_match(
    http_client: &reqwest::Client,
    match_id: u64,
    api_key: Option<&str>,
) -> reqwest::Result<SpectateMatchResponse> {
    http_client
        .get(format!(
            "https://api.deadlock-api.com/v1/matches/{match_id}/live/url"
        ))
        .header("X-API-Key", api_key.unwrap_or_default())
        .send()
        .await?
        .error_for_status()?
        .json()
        .await
}

pub(crate) async fn live_demo_exists(
    http_client: &reqwest::Client,
    broadcast_url: &str,
) -> reqwest::Result<()> {
    let broadcast_url = broadcast_url.strip_suffix('/').unwrap_or(broadcast_url);
    http_client
        .head(format!("{broadcast_url}/sync"))
        .send()
        .await
        .and_then(Response::error_for_status)
        .map(drop)
}

pub(crate) async fn wait_for_live_demo(
    http_client: &reqwest::Client,
    broadcast_url: &str,
) -> Result<(), APIError> {
    tryhard::retry_fn(|| live_demo_exists(http_client, broadcast_url))
        .retries(60)
        .fixed_backoff(Duration::from_millis(500))
        .await
        .map_err(|e| APIError::internal(format!("Demo not available: {e}")))
}
