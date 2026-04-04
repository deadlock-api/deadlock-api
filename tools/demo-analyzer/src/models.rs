use clickhouse::Row;
use serde::{Deserialize, Serialize};

#[derive(Row, Deserialize, Debug, Clone)]
pub(crate) struct MatchWithReplay {
    pub match_id: u64,
    pub cluster_id: Option<u32>,
    pub replay_salt: Option<u32>,
}

#[derive(Row, Serialize, Debug)]
pub(crate) struct DemoPlayer {
    pub match_id: u64,
    pub account_id: u32,
    pub hero_build_id: u64,
    pub banned_hero_ids: Vec<u32>,
}
