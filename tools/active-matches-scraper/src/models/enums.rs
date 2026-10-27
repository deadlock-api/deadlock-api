use serde_repr::{Deserialize_repr, Serialize_repr};

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug)]
#[repr(i8)]
pub(crate) enum MatchMode {
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

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug)]
#[repr(i8)]
pub(crate) enum GameMode {
    Invalid = 0,
    Normal = 1,
    OneVsOneTest = 2,
    Sandbox = 3,
    StreetBrawl = 4,
    ExploreNYC = 5,
    Internal = 6,
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Debug)]
#[repr(i8)]
pub(crate) enum RegionMode {
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
            1 => Self::Unranked,
            2 => Self::PrivateLobby,
            3 => Self::CoopBot,
            4 => Self::Ranked,
            5 => Self::ServerTest,
            6 => Self::Tutorial,
            7 => Self::HeroLabs,
            8 => Self::NewPlayerPlacement,
            _ => Self::Invalid,
        }
    }
}

impl From<u8> for GameMode {
    fn from(value: u8) -> Self {
        match value {
            1 => Self::Normal,
            2 => Self::OneVsOneTest,
            3 => Self::Sandbox,
            4 => Self::StreetBrawl,
            _ => Self::Invalid,
        }
    }
}

impl From<u8> for RegionMode {
    fn from(value: u8) -> Self {
        match value {
            1 => Self::Europe,
            2 => Self::SEAsia,
            3 => Self::SAmerica,
            4 => Self::Russia,
            5 => Self::Oceania,
            _ => Self::Row,
        }
    }
}
