use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use strum::{Display, FromRepr};
use utoipa::{IntoParams, ToSchema};
use valveprotos::deadlock::c_msg_dev_match_info::MatchPlayer;
use valveprotos::deadlock::{CMsgClientToGcGetMatchMetaDataResponse, CMsgDevMatchInfo};

#[derive(FromRepr, Debug, Clone, Copy, Serialize, ToSchema, Default)]
#[repr(i32)]
enum ActiveMatchTeam {
    #[default]
    Team0 = 0,
    Team1 = 1,
    Spectator = 16,
}

impl From<i32> for ActiveMatchTeam {
    fn from(value: i32) -> Self {
        Self::from_repr(value).unwrap_or_default()
    }
}

#[derive(FromRepr, Debug, Clone, Copy, Serialize, ToSchema, Default)]
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
        Self::from_repr(value).unwrap_or_default()
    }
}

#[derive(FromRepr, Debug, Clone, Copy, Serialize, ToSchema, Default)]
#[repr(i32)]
enum ActiveMatchGameMode {
    #[default]
    KECitadelGameModeInvalid = 0,
    KECitadelGameModeNormal = 1,
    KECitadelGameMode1v1Test = 2,
    KECitadelGameModeSandbox = 3,
    KECitadelGameModeStreetBrawl = 4,
}

impl From<i32> for ActiveMatchGameMode {
    fn from(value: i32) -> Self {
        Self::from_repr(value).unwrap_or_default()
    }
}

#[derive(
    FromRepr,
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    ToSchema,
    Display,
    PartialEq,
    Eq,
    Hash,
    Default,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
#[repr(i32)]
pub(crate) enum RegionMode {
    #[default]
    Row = 0,
    Europe = 1,
    SeAsia = 2,
    SAmerica = 3,
    Russia = 4,
    Oceania = 5,
}

impl From<RegionMode> for i32 {
    fn from(val: RegionMode) -> Self {
        val as i32
    }
}

impl From<RegionMode> for u32 {
    fn from(val: RegionMode) -> Self {
        val as u32
    }
}

impl From<i32> for RegionMode {
    fn from(val: i32) -> Self {
        Self::from_repr(val).unwrap_or_default()
    }
}

#[derive(
    FromRepr,
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    ToSchema,
    Display,
    PartialEq,
    Eq,
    Hash,
    Default,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
#[repr(i32)]
pub enum GameMode {
    #[default]
    Normal = 1,
    StreetBrawl = 4,
}

impl GameMode {
    pub fn default_option() -> Option<Self> {
        Some(Self::Normal)
    }

    /// Returns a SQL filter clause for `game_mode`.
    /// If a specific game mode is provided, returns `game_mode = {value}`.
    /// If None, returns a filter for all valid game modes: `game_mode IN (1, 4)`.
    pub fn sql_filter(game_mode: Option<Self>) -> String {
        match game_mode {
            Some(mode) => format!("game_mode = {}", mode as i32),
            None => format!(
                "game_mode IN ({}, {})",
                Self::Normal as i32,
                Self::StreetBrawl as i32
            ),
        }
    }
}

impl From<GameMode> for i32 {
    fn from(val: GameMode) -> Self {
        val as i32
    }
}

impl From<GameMode> for u32 {
    fn from(val: GameMode) -> Self {
        val as u32
    }
}

impl From<i32> for GameMode {
    fn from(val: i32) -> Self {
        Self::from_repr(val).unwrap_or_default()
    }
}

#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
pub(super) struct ActiveMatchPlayer {
    pub(super) account_id: Option<u32>,
    team: Option<i32>,
    team_parsed: Option<ActiveMatchTeam>,
    abandoned: Option<bool>,
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: Option<u32>,
}

impl From<MatchPlayer> for ActiveMatchPlayer {
    fn from(value: MatchPlayer) -> Self {
        Self {
            account_id: value.account_id,
            team: value.team,
            team_parsed: value.team.map(Into::into),
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
    game_mode_parsed: Option<ActiveMatchGameMode>,
    match_score: Option<u32>,
    region_mode: Option<i32>,
    region_mode_parsed: Option<RegionMode>,
    compat_version: Option<u32>,
}

impl From<CMsgDevMatchInfo> for ActiveMatch {
    fn from(value: CMsgDevMatchInfo) -> Self {
        Self {
            start_time: value.start_time,
            winning_team: value.winning_team,
            winning_team_parsed: value.winning_team.map(Into::into),
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
            match_mode_parsed: value.match_mode.map(Into::into),
            game_mode: value.game_mode,
            game_mode_parsed: value.game_mode.map(Into::into),
            match_score: value.match_score,
            region_mode: value.region_mode,
            region_mode_parsed: value.region_mode.map(Into::into),
            compat_version: value.compat_version,
        }
    }
}

#[derive(Debug, Clone, IntoParams, ToSchema, Row, Serialize, Deserialize)]
pub(crate) struct ClickhouseSalts {
    pub(crate) match_id: u64,
    pub(crate) metadata_salt: Option<u32>,
    pub(crate) replay_salt: Option<u32>,
    pub(crate) cluster_id: Option<u32>,
    username: Option<String>,
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

impl From<(u64, CMsgClientToGcGetMatchMetaDataResponse)> for ClickhouseSalts {
    fn from((match_id, salts): (u64, CMsgClientToGcGetMatchMetaDataResponse)) -> Self {
        Self {
            match_id,
            metadata_salt: salts.metadata_salt,
            replay_salt: salts.replay_salt,
            cluster_id: salts.replay_group_id,
            username: None,
        }
    }
}

impl From<(u64, CMsgClientToGcGetMatchMetaDataResponse, String)> for ClickhouseSalts {
    fn from(
        (match_id, salts, username): (u64, CMsgClientToGcGetMatchMetaDataResponse, String),
    ) -> Self {
        Self {
            match_id,
            metadata_salt: salts.metadata_salt,
            replay_salt: salts.replay_salt,
            cluster_id: salts.replay_group_id,
            username: Some(username),
        }
    }
}
