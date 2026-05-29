use clickhouse::Row;
use serde::{Deserialize, Serialize};

#[derive(Row, Deserialize, Debug, Clone)]
pub(crate) struct MatchWithReplay {
    pub match_id: u64,
    pub start_time: u32,
    pub cluster_id: Option<u32>,
    pub replay_salt: Option<u32>,
}

#[derive(Debug)]
pub(crate) struct MatchUpdate {
    pub match_id: u64,
    pub start_time: u32,
    pub banned_hero_ids: Vec<u32>,
    pub players: Vec<DemoPlayer>,
}

#[derive(Debug)]
pub(crate) struct DemoPlayer {
    pub account_id: u32,
    pub hero_build_id: u64,
    pub observed_name: Option<String>,
}

#[derive(Row, Deserialize, Debug)]
pub(crate) struct ObservedSteamName {
    pub account_id: u32,
    pub observed_name: String,
}

#[derive(Row, Serialize, Debug)]
pub(crate) struct ObservedSteamNameChange {
    pub account_id: u32,
    pub observed_name: String,
    pub match_id: u64,
    pub observed_at: u32,
}
