use clickhouse::Row;
use serde::{Deserialize, Serialize};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response;

pub(crate) type PlayerMatchHistory = Vec<PlayerMatchHistoryEntry>;

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub(crate) struct PlayerMatchHistoryEntry {
    pub account_id: u32,
    pub match_id: u64,
    pub hero_id: u32,
    pub hero_level: u32,
    pub start_time: u32,
    pub game_mode: i8,
    pub match_mode: i8,
    pub player_team: i8,
    pub player_kills: u32,
    pub player_deaths: u32,
    pub player_assists: u32,
    pub denies: u32,
    pub net_worth: u32,
    pub last_hits: u32,
    pub team_abandoned: Option<bool>,
    pub abandoned_time_s: Option<u32>,
    pub match_duration_s: u32,
    pub match_result: u32,
    pub objectives_mask_team0: u32,
    pub objectives_mask_team1: u32,
}

impl PlayerMatchHistoryEntry {
    pub(crate) fn from_protobuf(
        account_id: u32,
        entry: c_msg_client_to_gc_get_match_history_response::Match,
    ) -> Option<Self> {
        Some(Self {
            account_id,
            match_id: entry.match_id?,
            hero_id: entry.hero_id?,
            hero_level: entry.hero_level?,
            start_time: entry.start_time?,
            game_mode: entry.game_mode? as i8,
            match_mode: entry.match_mode? as i8,
            player_team: entry.player_team? as i8,
            player_kills: entry.player_kills?,
            player_deaths: entry.player_deaths?,
            player_assists: entry.player_assists?,
            denies: entry.denies?,
            net_worth: entry.net_worth?,
            last_hits: entry.last_hits?,
            team_abandoned: entry.team_abandoned,
            abandoned_time_s: entry.abandoned_time_s,
            match_duration_s: entry.match_duration_s?,
            match_result: entry.match_result?,
            objectives_mask_team0: entry.objectives_mask_team0? as u32,
            objectives_mask_team1: entry.objectives_mask_team1? as u32,
        })
    }
}
