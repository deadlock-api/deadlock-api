use clickhouse::Row;
use serde::{Deserialize, Deserializer, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct SteamPlayerSummaryResponse {
    pub response: SteamPlayerSummaryResponseInner,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct SteamPlayerSummaryResponseInner {
    pub players: Vec<SteamPlayerSummary>,
}

#[derive(Debug, Serialize, Deserialize, Row)]
pub(crate) struct SteamPlayerSummary {
    #[serde(alias = "steamid", deserialize_with = "parse_steam_id")]
    pub account_id: u32,
    pub personaname: String,
    pub profileurl: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub avatarfull: String,
    pub personastate: PersonaState,
    pub realname: Option<String>,
    #[serde(alias = "loccountrycode")]
    pub countrycode: Option<String>,
    #[serde(default, rename = "friends.account_id")]
    pub friends_account_id: Vec<u32>,
    #[serde(default, rename = "friends.friend_since")]
    pub friends_friend_since: Vec<u32>,
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug)]
#[repr(i8)]
pub(crate) enum PersonaState {
    Offline = 0,
    Online = 1,
    Busy = 2,
    Away = 3,
    Snooze = 4,
    LookingToTrade = 5,
    LookingToPlay = 6,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SteamFriendListResponse {
    pub friendslist: SteamFriendList,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SteamFriendList {
    #[serde(default)]
    pub friends: Vec<SteamFriend>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SteamFriend {
    #[serde(deserialize_with = "parse_steam_id")]
    pub steamid: u32,
    pub friend_since: u32,
}

pub(crate) fn parse_steam_id<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    let str_deserialized = String::deserialize(deserializer).map_err(serde::de::Error::custom)?;
    let steam_id64 = str_deserialized
        .parse::<u64>()
        .map_err(serde::de::Error::custom)?;
    // The account id is the low 32 bits, so a field that already is an account id is kept as-is.
    Ok(common::steam_id64_to_account_id(steam_id64))
}
