use clickhouse::Row;
use serde::{Deserialize, Deserializer, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

#[derive(Debug, Serialize, Deserialize)]
pub struct SteamPlayerSummaryResponse {
    pub response: SteamPlayerSummaryResponseInner,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SteamPlayerSummaryResponseInner {
    pub players: Vec<SteamPlayerSummary>,
}

#[derive(Debug, Serialize, Deserialize, Row)]
pub struct SteamPlayerSummary {
    #[serde(alias = "steamid", deserialize_with = "parse_steam_id")]
    pub account_id: u32,
    pub personaname: String,
    pub profileurl: String,
    pub avatar: String,
    pub personastate: PersonaState,
    pub realname: Option<String>,
    #[serde(alias = "loccountrycode")]
    pub countrycode: Option<String>,
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug)]
#[repr(u8)]
pub enum PersonaState {
    Offline = 0,
    Online = 1,
    Busy = 2,
    Away = 3,
    Snooze = 4,
    LookingToTrade = 5,
    LookingToPlay = 6,
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
    let str_deserialized = String::deserialize(deserializer).map_err(serde::de::Error::custom)?;
    let steam_id64 = str_deserialized
        .parse::<u64>()
        .map_err(serde::de::Error::custom)?;
    Ok(steamid64_to_steamid3(steam_id64))
}
