use serde_repr::{Deserialize_repr, Serialize_repr};
use valveprotos::deadlock::c_msg_match_meta_data_contents::EMatchOutcome;
use valveprotos::deadlock::c_msg_match_player_paths_data::{ECombatType, EMoveType};
use valveprotos::deadlock::{
    ECitadelGameMode, ECitadelLobbyTeam, ECitadelMatchMode, ECitadelTeamObjective,
};

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug, Clone)]
#[repr(u8)]
pub enum GameMode {
    Invalid = 0,
    Normal = 1,
    OnevOneTest = 2,
    Sandbox = 3,
}

impl From<ECitadelGameMode> for GameMode {
    fn from(value: ECitadelGameMode) -> Self {
        match value {
            ECitadelGameMode::KECitadelGameModeInvalid => Self::Invalid,
            ECitadelGameMode::KECitadelGameModeNormal => Self::Normal,
            ECitadelGameMode::KECitadelGameMode1v1Test => Self::OnevOneTest,
            ECitadelGameMode::KECitadelGameModeSandbox => Self::Sandbox,
        }
    }
}

impl From<u8> for GameMode {
    fn from(value: u8) -> Self {
        match value {
            0 => GameMode::Invalid,
            1 => GameMode::Normal,
            2 => GameMode::OnevOneTest,
            3 => GameMode::Sandbox,
            _ => GameMode::Invalid,
        }
    }
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug, Clone)]
#[repr(u8)]
pub enum MatchMode {
    Invalid = 0,
    Unranked = 1,
    PrivateLobby = 2,
    CoopBot = 3,
    Ranked = 4,
    ServerTest = 5,
    Tutorial = 6,
    HeroLabs = 7,
}

impl From<ECitadelMatchMode> for MatchMode {
    fn from(value: ECitadelMatchMode) -> Self {
        match value {
            ECitadelMatchMode::KECitadelMatchModeInvalid => Self::Invalid,
            ECitadelMatchMode::KECitadelMatchModeUnranked => Self::Unranked,
            ECitadelMatchMode::KECitadelMatchModePrivateLobby => Self::PrivateLobby,
            ECitadelMatchMode::KECitadelMatchModeCoopBot => Self::CoopBot,
            ECitadelMatchMode::KECitadelMatchModeRanked => Self::Ranked,
            ECitadelMatchMode::KECitadelMatchModeServerTest => Self::ServerTest,
            ECitadelMatchMode::KECitadelMatchModeTutorial => Self::Tutorial,
            ECitadelMatchMode::KECitadelMatchModeHeroLabs => Self::HeroLabs,
        }
    }
}

impl From<u8> for MatchMode {
    fn from(value: u8) -> Self {
        match value {
            0 => MatchMode::Invalid,
            1 => MatchMode::Unranked,
            2 => MatchMode::PrivateLobby,
            3 => MatchMode::CoopBot,
            4 => MatchMode::Ranked,
            5 => MatchMode::ServerTest,
            6 => MatchMode::Tutorial,
            7 => MatchMode::HeroLabs,
            _ => MatchMode::Invalid,
        }
    }
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug, Clone)]
#[repr(u8)]
pub enum MatchOutcome {
    TeamWin = 0,
    Error = 1,
}

impl From<EMatchOutcome> for MatchOutcome {
    fn from(value: EMatchOutcome) -> Self {
        match value {
            EMatchOutcome::KEOutcomeTeamWin => MatchOutcome::TeamWin,
            EMatchOutcome::KEOutcomeError => MatchOutcome::Error,
        }
    }
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug, Clone)]
#[repr(u8)]
pub enum Team {
    Team0 = 0,
    Team1 = 1,
    Spectator = 16,
}

impl From<ECitadelLobbyTeam> for Team {
    fn from(value: ECitadelLobbyTeam) -> Self {
        match value {
            ECitadelLobbyTeam::KECitadelLobbyTeamTeam0 => Self::Team0,
            ECitadelLobbyTeam::KECitadelLobbyTeamTeam1 => Self::Team1,
            ECitadelLobbyTeam::KECitadelLobbyTeamSpectator => Self::Spectator,
        }
    }
}

impl From<u8> for Team {
    fn from(value: u8) -> Self {
        match value {
            0 => Team::Team0,
            1 => Team::Team1,
            16 => Team::Spectator,
            _ => Team::Spectator,
        }
    }
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug, Clone)]
#[repr(u8)]
pub enum Objective {
    Core = 0,
    Tier1Lane1 = 1,
    Tier1Lane2 = 2,
    Tier1Lane3 = 3,
    Tier1Lane4 = 4,
    Tier2Lane1 = 5,
    Tier2Lane2 = 6,
    Tier2Lane3 = 7,
    Tier2Lane4 = 8,
    Titan = 9,
    TitanShieldGenerator1 = 10,
    TitanShieldGenerator2 = 11,
    BarrackBossLane1 = 12,
    BarrackBossLane2 = 13,
    BarrackBossLane3 = 14,
    BarrackBossLane4 = 15,
}

impl From<ECitadelTeamObjective> for Objective {
    fn from(value: ECitadelTeamObjective) -> Self {
        match value {
            ECitadelTeamObjective::KECitadelTeamObjectiveCore => Self::Core,
            ECitadelTeamObjective::KECitadelTeamObjectiveTier1Lane1 => Self::Tier1Lane1,
            ECitadelTeamObjective::KECitadelTeamObjectiveTier1Lane2 => Self::Tier1Lane2,
            ECitadelTeamObjective::KECitadelTeamObjectiveTier1Lane3 => Self::Tier1Lane3,
            ECitadelTeamObjective::KECitadelTeamObjectiveTier1Lane4 => Self::Tier1Lane4,
            ECitadelTeamObjective::KECitadelTeamObjectiveTier2Lane1 => Self::Tier2Lane1,
            ECitadelTeamObjective::KECitadelTeamObjectiveTier2Lane2 => Self::Tier2Lane2,
            ECitadelTeamObjective::KECitadelTeamObjectiveTier2Lane3 => Self::Tier2Lane3,
            ECitadelTeamObjective::KECitadelTeamObjectiveTier2Lane4 => Self::Tier2Lane4,
            ECitadelTeamObjective::KECitadelTeamObjectiveTitan => Self::Titan,
            ECitadelTeamObjective::KECitadelTeamObjectiveTitanShieldGenerator1 => {
                Self::TitanShieldGenerator1
            }
            ECitadelTeamObjective::KECitadelTeamObjectiveTitanShieldGenerator2 => {
                Self::TitanShieldGenerator2
            }
            ECitadelTeamObjective::KECitadelTeamObjectiveBarrackBossLane1 => Self::BarrackBossLane1,
            ECitadelTeamObjective::KECitadelTeamObjectiveBarrackBossLane2 => Self::BarrackBossLane2,
            ECitadelTeamObjective::KECitadelTeamObjectiveBarrackBossLane3 => Self::BarrackBossLane3,
            ECitadelTeamObjective::KECitadelTeamObjectiveBarrackBossLane4 => Self::BarrackBossLane4,
        }
    }
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug, Clone)]
#[repr(u8)]
pub enum RegionMode {
    Row = 0,
    Europe = 1,
    SEAsia = 2,
    SAmerica = 3,
    Russia = 4,
    Oceania = 5,
}

impl From<u8> for RegionMode {
    fn from(value: u8) -> Self {
        match value {
            0 => RegionMode::Row,
            1 => RegionMode::Europe,
            2 => RegionMode::SEAsia,
            3 => RegionMode::SAmerica,
            4 => RegionMode::Russia,
            5 => RegionMode::Oceania,
            _ => RegionMode::Row,
        }
    }
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug, Clone)]
#[repr(u8)]
pub enum CombatType {
    Out = 0,
    Player = 1,
    EnemyNpc = 2,
    Neutral = 3,
}

impl From<ECombatType> for CombatType {
    fn from(value: ECombatType) -> Self {
        match value {
            ECombatType::KECombatTypeOut => Self::Out,
            ECombatType::KECombatTypePlayer => Self::Player,
            ECombatType::KECombatTypeEnemyNpc => Self::EnemyNpc,
            ECombatType::KECombatTypeNeutral => Self::Neutral,
        }
    }
}

impl From<i32> for CombatType {
    fn from(value: i32) -> Self {
        match value {
            0 => CombatType::Out,
            1 => CombatType::Player,
            2 => CombatType::EnemyNpc,
            3 => CombatType::Neutral,
            _ => CombatType::Out,
        }
    }
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug, Clone)]
#[repr(u8)]
pub enum MoveType {
    Normal = 0,
    Ability = 1,
    AbilityDebuff = 2,
    GroundDash = 3,
    Slide = 4,
    RopeClimbing = 5,
    Ziplining = 6,
    InAir = 7,
    AirDash = 8,
}

impl From<EMoveType> for MoveType {
    fn from(value: EMoveType) -> Self {
        match value {
            EMoveType::KEMoveTypeNormal => Self::Normal,
            EMoveType::KEMoveTypeAbility => Self::Ability,
            EMoveType::KEMoveTypeAbilityDebuff => Self::AbilityDebuff,
            EMoveType::KEMoveTypeGroundDash => Self::GroundDash,
            EMoveType::KEMoveTypeSlide => Self::Slide,
            EMoveType::KEMoveTypeRopeClimbing => Self::RopeClimbing,
            EMoveType::KEMoveTypeZiplining => Self::Ziplining,
            EMoveType::KEMoveTypeInAir => Self::InAir,
            EMoveType::KEMoveTypeAirDash => Self::AirDash,
        }
    }
}

impl From<i32> for MoveType {
    fn from(value: i32) -> Self {
        match value {
            0 => MoveType::Normal,
            1 => MoveType::Ability,
            2 => MoveType::AbilityDebuff,
            3 => MoveType::GroundDash,
            4 => MoveType::Slide,
            5 => MoveType::RopeClimbing,
            6 => MoveType::Ziplining,
            7 => MoveType::InAir,
            8 => MoveType::AirDash,
            _ => MoveType::Normal,
        }
    }
}
