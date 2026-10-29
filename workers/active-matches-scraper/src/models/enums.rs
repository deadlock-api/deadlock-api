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
