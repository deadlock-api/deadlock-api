use clickhouse::Row;
use serde::{Deserialize, Serialize};

#[derive(Row, Debug, Clone, Deserialize)]
pub struct AccountId {
    pub account_id: u32,
}

// Steam API response structures
#[derive(Debug, Serialize, Deserialize)]
pub struct SteamPlayerSummaryResponse {
    pub response: SteamPlayerSummaryResponseInner,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SteamPlayerSummaryResponseInner {
    pub players: Vec<SteamPlayerSummary>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SteamPlayerSummary {
    pub steamid: String,
    pub communityvisibilitystate: u8,
    pub personaname: String,
    pub profileurl: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub avatarfull: String,
    pub personastate: u8,
    pub realname: Option<String>,
    pub loccountrycode: Option<String>,
}
