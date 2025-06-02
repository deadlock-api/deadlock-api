use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use valveprotos::deadlock::c_msg_dev_match_info::MatchPlayer;
use valveprotos::deadlock::{CMsgClientToGcGetMatchMetaDataResponse, CMsgDevMatchInfo};

#[derive(Debug, Clone, Copy, Serialize, ToSchema, Default)]
#[repr(i32)]
enum ActiveMatchTeam {
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

#[derive(Debug, Clone, Copy, Serialize, ToSchema, Default)]
#[repr(i32)]
enum ActiveMatchMode {
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

#[derive(Debug, Clone, Copy, Serialize, ToSchema, Default)]
#[repr(i32)]
enum ActiveMatchGameMode {
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

#[derive(Debug, Clone, Copy, Serialize, ToSchema, Default)]
#[repr(i32)]
enum ActiveMatchRegionMode {
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

#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
pub(super) struct ActiveMatchPlayer {
    pub(super) account_id: Option<u32>,
    team: Option<i32>,
    team_parsed: Option<ActiveMatchTeam>,
    abandoned: Option<bool>,
    hero_id: Option<u32>,
}

impl From<MatchPlayer> for ActiveMatchPlayer {
    fn from(value: MatchPlayer) -> Self {
        Self {
            account_id: value.account_id,
            team: value.team,
            team_parsed: value.team.map(|m| m.into()),
            abandoned: value.abandoned,
            hero_id: value.hero_id,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all(deserialize = "camelCase"))]
pub(super) struct ActiveMatch {
    start_time: Option<u32>,
    winning_team: Option<i32>,
    winning_team_parsed: Option<ActiveMatchTeam>,
    match_id: Option<u64>,
    pub(super) players: Vec<ActiveMatchPlayer>,
    lobby_id: Option<u64>,
    game_mode_version: Option<u32>,
    net_worth_team_0: Option<u32>,
    net_worth_team_1: Option<u32>,
    duration_s: Option<u32>,
    spectators: Option<u32>,
    open_spectator_slots: Option<u32>,
    objectives_mask_team0: Option<u64>,
    objectives_mask_team1: Option<u64>,
    match_mode: Option<i32>,
    match_mode_parsed: Option<ActiveMatchMode>,
    game_mode: Option<i32>,
    match_score: Option<u32>,
    region_mode: Option<i32>,
    region_mode_parsed: Option<ActiveMatchRegionMode>,
    compat_version: Option<u32>,
}

impl From<CMsgDevMatchInfo> for ActiveMatch {
    fn from(value: CMsgDevMatchInfo) -> Self {
        Self {
            start_time: value.start_time,
            winning_team: value.winning_team,
            winning_team_parsed: value.winning_team.map(|m| m.into()),
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
            match_mode: value.match_mode,
            match_mode_parsed: value.match_mode.map(|m| m.into()),
            game_mode: value.game_mode,
            match_score: value.match_score,
            region_mode: value.region_mode,
            region_mode_parsed: value.region_mode.map(|m| m.into()),
            compat_version: value.compat_version,
        }
    }
}

#[derive(Deserialize, IntoParams)]
pub(super) struct MatchIdQuery {
    pub(super) match_id: u64,
}

#[derive(Debug, Clone, IntoParams, ToSchema, Row, Serialize, Deserialize)]
pub(super) struct ClickhouseSalts {
    pub(super) match_id: u64,
    pub(super) metadata_salt: Option<u32>,
    replay_salt: Option<u32>,
    pub(super) cluster_id: Option<u32>,
    username: Option<String>,
}

impl ClickhouseSalts {
    pub(super) fn has_metadata_salt(&self) -> bool {
        self.cluster_id.is_some() && self.metadata_salt.unwrap_or_default() != 0
    }
    pub(super) fn has_replay_salt(&self) -> bool {
        self.cluster_id.is_some() && self.replay_salt.unwrap_or_default() != 0
    }
}

impl From<ClickhouseSalts> for CMsgClientToGcGetMatchMetaDataResponse {
    fn from(value: ClickhouseSalts) -> Self {
        Self {
            result: None,
            metadata_salt: value.metadata_salt,
            replay_salt: value.replay_salt,
            replay_group_id: value.cluster_id,
            replay_valid_through: None,
            replay_processing_through: None,
        }
    }
}

impl From<(u64, CMsgClientToGcGetMatchMetaDataResponse, Option<String>)> for ClickhouseSalts {
    fn from(
        (match_id, salts, username): (u64, CMsgClientToGcGetMatchMetaDataResponse, Option<String>),
    ) -> Self {
        Self {
            match_id,
            metadata_salt: salts.metadata_salt,
            replay_salt: salts.replay_salt,
            cluster_id: salts.replay_group_id,
            username,
        }
    }
}
