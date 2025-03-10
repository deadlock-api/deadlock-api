use crate::models::enums::{GameMode, MatchMode, RegionMode};
use clickhouse::Row;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
pub struct ActiveMatch {
    pub start_time: u32,
    pub winning_team: Option<u8>,
    pub match_id: u64,
    pub players: Vec<ActiveMatchPlayer>,
    pub lobby_id: u64,
    pub net_worth_team_0: u32,
    pub net_worth_team_1: u32,
    pub game_mode_version: Option<u32>,
    pub duration_s: Option<u32>,
    pub spectators: u16,
    pub open_spectator_slots: u16,
    pub objectives_mask_team0: u16,
    pub objectives_mask_team1: u16,
    pub match_mode: MatchMode,
    pub game_mode: GameMode,
    pub match_score: u16,
    pub region_mode: RegionMode,
    pub compat_version: Option<u32>,
    pub ranked_badge_level: Option<u32>,
}

#[derive(Deserialize, Debug)]
pub struct ActiveMatchPlayer {
    pub account_id: u64,
    pub team: u8,
    pub abandoned: Option<bool>,
    pub hero_id: u8,
}

#[derive(Row, Serialize, Debug)]
pub struct ClickHouseActiveMatch {
    pub start_time: u32,
    pub winning_team: u8,
    pub match_id: u64,
    #[serde(rename = "players.account_id")]
    pub players_account_id: Vec<u64>,
    #[serde(rename = "players.team")]
    pub players_team: Vec<u8>,
    #[serde(rename = "players.abandoned")]
    pub players_abandoned: Vec<bool>,
    #[serde(rename = "players.hero_id")]
    pub players_hero_id: Vec<u8>,
    pub lobby_id: String, // This is a big integer, but encoding as String to avoid overflow
    pub net_worth_team_0: u32,
    pub net_worth_team_1: u32,
    pub game_mode_version: Option<u32>,
    pub duration_s: u32, // Currently always 0
    pub spectators: u16,
    pub open_spectator_slots: u16,
    pub objectives_mask_team0: u16,
    pub objectives_mask_team1: u16,
    pub match_mode: MatchMode,
    pub game_mode: GameMode,
    pub match_score: u16,
    pub region_mode: RegionMode,
    pub compat_version: Option<u32>,
    pub ranked_badge_level: Option<u32>,
}

impl From<ActiveMatch> for ClickHouseActiveMatch {
    fn from(am: ActiveMatch) -> Self {
        Self {
            start_time: am.start_time,
            winning_team: am.winning_team.unwrap_or_default(),
            match_id: am.match_id,
            players_account_id: am.players.iter().map(|p| p.account_id).collect(),
            players_team: am.players.iter().map(|p| p.team).collect(),
            players_abandoned: am
                .players
                .iter()
                .map(|p| p.abandoned.unwrap_or_default())
                .collect(),
            players_hero_id: am.players.iter().map(|p| p.hero_id).collect(),
            lobby_id: am.lobby_id.to_string(),
            net_worth_team_0: am.net_worth_team_0,
            net_worth_team_1: am.net_worth_team_1,
            game_mode_version: am.game_mode_version,
            duration_s: am.duration_s.unwrap_or_default(),
            spectators: am.spectators,
            open_spectator_slots: am.open_spectator_slots,
            objectives_mask_team0: am.objectives_mask_team0,
            objectives_mask_team1: am.objectives_mask_team1,
            match_mode: am.match_mode,
            game_mode: am.game_mode,
            match_score: am.match_score,
            region_mode: am.region_mode,
            compat_version: am.compat_version,
            ranked_badge_level: am.ranked_badge_level,
        }
    }
}
