use itertools::Itertools;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgClientToGcGetLeaderboardResponse, c_msg_client_to_gc_get_leaderboard_response,
};

use crate::error::APIError;

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Eq, PartialEq, Hash)]
#[repr(i32)]
pub(crate) enum LeaderboardRegion {
    #[default]
    Europe = 1,
    Asia = 2,
    NAmerica = 3,
    SAmerica = 4,
    Oceania = 5,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct LeaderboardEntry {
    /// The account name of the player.
    pub(crate) account_name: Option<String>,
    /// The possible account IDs of the player. **CAVEAT: This is not always correct, as Steam account names are not unique.**
    #[serde(default)]
    pub(super) possible_account_ids: Vec<u32>,
    /// The rank of the player. See more: <https://assets.deadlock-api.com/v2/ranks>
    pub(crate) rank: Option<u32>,
    /// The top hero IDs of the player. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[serde(default)]
    top_hero_ids: Vec<u32>,
    /// The badge level of the player. See more: <https://assets.deadlock-api.com/v2/ranks>
    pub(crate) badge_level: Option<u32>,
    /// The ranked rank of the player. See more: <https://assets.deadlock-api.com/v2/ranks>
    ranked_rank: Option<u32>,
    /// The ranked subrank of the player. See more: <https://assets.deadlock-api.com/v2/ranks>
    ranked_subrank: Option<u32>,
}

impl From<c_msg_client_to_gc_get_leaderboard_response::LeaderboardEntry> for LeaderboardEntry {
    fn from(value: c_msg_client_to_gc_get_leaderboard_response::LeaderboardEntry) -> Self {
        Self {
            account_name: value.account_name,
            possible_account_ids: vec![],
            rank: value.rank,
            top_hero_ids: value.top_hero_ids,
            badge_level: value.badge_level,
            ranked_rank: value.badge_level.map(|b| b / 10),
            ranked_subrank: value.badge_level.map(|b| b % 10),
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub(crate) struct Leaderboard {
    /// The leaderboard entries.
    pub(crate) entries: Vec<LeaderboardEntry>,
}

impl TryFrom<CMsgClientToGcGetLeaderboardResponse> for Leaderboard {
    type Error = APIError;

    fn try_from(value: CMsgClientToGcGetLeaderboardResponse) -> Result<Self, Self::Error> {
        if value.result.is_none_or(|r| {
            r != c_msg_client_to_gc_get_leaderboard_response::EResult::KESuccess as i32
        }) {
            return Err(APIError::internal(format!(
                "Failed to fetch leaderboard: {value:?}"
            )));
        }
        Ok(Self {
            entries: value.entries.into_iter().map_into().collect(),
        })
    }
}
