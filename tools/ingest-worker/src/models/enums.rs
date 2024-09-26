use serde_repr::{Deserialize_repr, Serialize_repr};

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
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug, Clone)]
#[repr(u8)]
pub enum GameMode {
    Invalid = 0,
    Normal = 1,
    OneVsOneTest = 2,
    Sandbox = 3,
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
            _ => MatchMode::Invalid,
        }
    }
}

impl From<u8> for GameMode {
    fn from(value: u8) -> Self {
        match value {
            0 => GameMode::Invalid,
            1 => GameMode::Normal,
            2 => GameMode::OneVsOneTest,
            3 => GameMode::Sandbox,
            _ => GameMode::Invalid,
        }
    }
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
