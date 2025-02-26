use itertools::Itertools;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use valveprotos::deadlock::CMsgDevMatchInfo;
use valveprotos::deadlock::c_msg_dev_match_info::MatchPlayer;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, Default)]
#[repr(i32)]
pub enum ActiveMatchTeam {
    #[default]
    Team0 = 0,
    Team1 = 1,
    Spectator = 16,
}

impl From<i32> for ActiveMatchTeam {
    fn from(value: i32) -> Self {
        match value {
            0 => Self::Team0,
            1 => Self::Team1,
            16 => Self::Spectator,
            _ => Self::Team0,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, Default)]
#[repr(i32)]
pub enum ActiveMatchMode {
    #[default]
    Invalid = 0,
    Unranked = 1,
    PrivateLobby = 2,
    CoopBot = 3,
    Ranked = 4,
    ServerTest = 5,
    Tutorial = 6,
    HeroLabs = 7,
}
impl From<i32> for ActiveMatchMode {
    fn from(value: i32) -> Self {
        match value {
            0 => Self::Invalid,
            1 => Self::Unranked,
            2 => Self::PrivateLobby,
            3 => Self::CoopBot,
            4 => Self::Ranked,
            5 => Self::ServerTest,
            6 => Self::Tutorial,
            7 => Self::HeroLabs,
            _ => Self::Invalid,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, Default)]
#[repr(i32)]
pub enum ActiveMatchGameMode {
    #[default]
    KECitadelGameModeInvalid = 0,
    KECitadelGameModeNormal = 1,
    KECitadelGameMode1v1Test = 2,
    KECitadelGameModeSandbox = 3,
}

impl From<i32> for ActiveMatchGameMode {
    fn from(value: i32) -> Self {
        match value {
            0 => Self::KECitadelGameModeInvalid,
            1 => Self::KECitadelGameModeNormal,
            2 => Self::KECitadelGameMode1v1Test,
            3 => Self::KECitadelGameModeSandbox,
            _ => Self::KECitadelGameModeInvalid,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, Default)]
#[repr(i32)]
pub enum ActiveMatchRegionMode {
    #[default]
    Row = 0,
    Europe = 1,
    SeAsia = 2,
    SAmerica = 3,
    Russia = 4,
    Oceania = 5,
}

impl From<i32> for ActiveMatchRegionMode {
    fn from(value: i32) -> Self {
        match value {
            0 => Self::Row,
            1 => Self::Europe,
            2 => Self::SeAsia,
            3 => Self::SAmerica,
            4 => Self::Russia,
            5 => Self::Oceania,
            _ => Self::Row,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
pub struct ActiveMatchPlayer {
    pub account_id: Option<u32>,
    pub team: Option<ActiveMatchTeam>,
    pub abandoned: Option<bool>,
    pub hero_id: Option<u32>,
}

impl From<MatchPlayer> for ActiveMatchPlayer {
    fn from(value: MatchPlayer) -> Self {
        Self {
            account_id: value.account_id,
            team: value.team.map(|m| m.into()),
            abandoned: value.abandoned,
            hero_id: value.hero_id,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub struct ActiveMatch {
    pub start_time: Option<u32>,
    pub winning_team: Option<ActiveMatchTeam>,
    pub match_id: Option<u64>,
    pub players: Vec<ActiveMatchPlayer>,
    pub lobby_id: Option<u64>,
    pub game_mode_version: Option<u32>,
    pub net_worth_team_0: Option<u32>,
    pub net_worth_team_1: Option<u32>,
    pub duration_s: Option<u32>,
    pub spectators: Option<u32>,
    pub open_spectator_slots: Option<u32>,
    pub objectives_mask_team0: Option<u64>,
    pub objectives_mask_team1: Option<u64>,
    pub match_mode: Option<ActiveMatchMode>,
    pub game_mode: Option<i32>,
    pub match_score: Option<u32>,
    pub region_mode: Option<ActiveMatchRegionMode>,
    pub compat_version: Option<u32>,
}

impl From<CMsgDevMatchInfo> for ActiveMatch {
    fn from(value: CMsgDevMatchInfo) -> Self {
        Self {
            start_time: value.start_time,
            winning_team: value.winning_team.map(|m| m.into()),
            match_id: value.match_id,
            players: value.players.into_iter().map_into().collect(),
            lobby_id: value.lobby_id,
            game_mode_version: value.game_mode_version,
            net_worth_team_0: value.net_worth_team_0,
            net_worth_team_1: value.net_worth_team_1,
            duration_s: value.duration_s,
            spectators: value.spectators,
            open_spectator_slots: value.open_spectator_slots,
            objectives_mask_team0: value.objectives_mask_team0,
            objectives_mask_team1: value.objectives_mask_team1,
            match_mode: value.match_mode.map(|m| m.into()),
            game_mode: value.game_mode,
            match_score: value.match_score,
            region_mode: value.region_mode.map(|m| m.into()),
            compat_version: value.compat_version,
        }
    }
}
