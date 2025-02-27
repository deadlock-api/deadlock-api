use itertools::Itertools;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgClientToGcGetLeaderboardResponse, c_msg_client_to_gc_get_leaderboard_response,
};

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default)]
#[repr(i32)]
pub enum LeaderboardRegion {
    #[default]
    Europe = 1,
    Asia = 2,
    NAmerica = 3,
    SAmerica = 4,
    Oceania = 5,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LeaderboardEntry {
    pub account_name: Option<String>,
    pub rank: Option<u32>,
    #[serde(default)]
    pub top_hero_ids: Vec<u32>,
    pub badge_level: Option<u32>,
}

impl From<c_msg_client_to_gc_get_leaderboard_response::LeaderboardEntry> for LeaderboardEntry {
    fn from(value: c_msg_client_to_gc_get_leaderboard_response::LeaderboardEntry) -> Self {
        Self {
            account_name: value.account_name,
            rank: value.rank,
            top_hero_ids: value.top_hero_ids,
            badge_level: value.badge_level,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub struct Leaderboard {
    pub entries: Vec<LeaderboardEntry>,
}

impl From<CMsgClientToGcGetLeaderboardResponse> for Leaderboard {
    fn from(value: CMsgClientToGcGetLeaderboardResponse) -> Self {
        Self {
            entries: value.entries.into_iter().map_into().collect(),
        }
    }
}
