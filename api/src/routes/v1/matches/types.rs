use clickhouse::Row;
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};
use strum::{Display, FromRepr};
use utoipa::ToSchema;
use valveprotos::deadlock::c_msg_dev_match_info::{MatchPlayer, Team};
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
    NewPlayerPlacement = 8,
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
    KECitadelGameModeExploreNyc = 5,
    KECitadelGameModeInternal = 6,
    KECitadelGameModeInternal02 = 7,
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
        val as Self
    }
}

impl From<RegionMode> for u32 {
    fn from(val: RegionMode) -> Self {
        val as Self
    }
}

impl From<i32> for RegionMode {
    fn from(val: i32) -> Self {
        Self::from_repr(val).unwrap_or_default()
    }
}

#[derive(
    FromRepr, Debug, Clone, Copy, Serialize, Deserialize, ToSchema, Display, PartialEq, Eq, Hash,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
#[repr(u32)]
pub(crate) enum ServerRegion {
    // Europe
    Europe = 3,
    EuAmsterdam = 50,
    EuPoland = 28,
    EuStockholm = 8,
    EuHelsinki = 44,
    EuFalkenstein = 52,
    EuSpain = 21,
    EuEast = 9,
    EuLondon = 45,
    // Africa (grouped under Europe region mode)
    SouthAfrica = 11,
    // North America
    UsWest = 1,
    UsEast = 2,
    UsNorthCentral = 27,
    UsSouthCentral = 31,
    UsSouthEast = 23,
    UsSouthWest = 22,
    // Oceania
    Australia = 7,
    // Southeast Asia
    Singapore = 5,
    Japan = 19,
    HongKong = 24,
    MpHongKong = 48,
    Seoul = 39,
    // South America
    Chile = 14,
    Peru = 15,
    Argentina = 38,
    SouthAmerica = 10,
}

impl ServerRegion {
    pub(crate) const fn region_mode(self) -> RegionMode {
        match self {
            Self::Europe
            | Self::EuAmsterdam
            | Self::EuPoland
            | Self::EuStockholm
            | Self::EuHelsinki
            | Self::EuFalkenstein
            | Self::EuSpain
            | Self::EuEast
            | Self::EuLondon
            | Self::SouthAfrica => RegionMode::Europe,

            Self::UsWest
            | Self::UsEast
            | Self::UsNorthCentral
            | Self::UsSouthCentral
            | Self::UsSouthEast
            | Self::UsSouthWest => RegionMode::Row,

            Self::Australia => RegionMode::Oceania,

            Self::Singapore | Self::Japan | Self::HongKong | Self::MpHongKong | Self::Seoul => {
                RegionMode::SeAsia
            }

            Self::Chile | Self::Peru | Self::Argentina | Self::SouthAmerica => RegionMode::SAmerica,
        }
    }
}

impl From<ServerRegion> for i32 {
    fn from(val: ServerRegion) -> Self {
        val as Self
    }
}

impl From<ServerRegion> for u32 {
    fn from(val: ServerRegion) -> Self {
        val as Self
    }
}

#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
pub(super) struct ActiveMatchPlayer {
    pub(super) account_id: Option<u32>,
    team: Option<i32>,
    team_parsed: Option<ActiveMatchTeam>,
    abandoned: Option<bool>,
    /// See more: <https://api.deadlock-api.com/v1/assets/heroes>
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

#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
pub(super) struct ActiveMatchTeamStats {
    team: Option<i32>,
    team_parsed: Option<ActiveMatchTeam>,
    net_worth: Option<u32>,
    objectives_mask: Option<u64>,
    brawl_score: Option<u32>,
}

impl From<Team> for ActiveMatchTeamStats {
    fn from(value: Team) -> Self {
        Self {
            team: value.team,
            team_parsed: value.team.map(Into::into),
            net_worth: value.net_worth,
            objectives_mask: value.objectives_mask,
            brawl_score: value.brawl_score,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
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
    low_pri_pool: Option<bool>,
    team_stats: Vec<ActiveMatchTeamStats>,
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
            low_pri_pool: value.low_pri_pool,
            team_stats: value.team_stats.into_iter().map_into().collect(),
        }
    }
}

#[derive(Debug, Clone, ToSchema, Row, Serialize, Deserialize)]
pub(crate) struct ClickhouseSalts {
    pub(crate) match_id: u64,
    pub(crate) metadata_salt: Option<u32>,
    pub(crate) replay_salt: Option<u32>,
    pub(crate) cluster_id: Option<u32>,
    pub(crate) username: Option<String>,
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
            username: Some(username),
            ..(match_id, salts).into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_match_keeps_team_stats_and_low_priority_pool() {
        let info = CMsgDevMatchInfo {
            low_pri_pool: Some(true),
            team_stats: vec![Team {
                team: Some(1),
                net_worth: Some(42_000),
                objectives_mask: Some(3),
                brawl_score: Some(2),
            }],
            ..Default::default()
        };
        let json = serde_json::to_value(ActiveMatch::from(info)).unwrap();
        assert_eq!(json["low_pri_pool"], true);
        assert_eq!(json["team_stats"][0]["team"], 1);
        assert_eq!(json["team_stats"][0]["net_worth"], 42_000);
        assert_eq!(json["team_stats"][0]["objectives_mask"], 3);
        assert_eq!(json["team_stats"][0]["brawl_score"], 2);
    }
}
