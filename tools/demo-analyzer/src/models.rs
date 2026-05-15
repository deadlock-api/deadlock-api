use clickhouse::Row;
use serde::Deserialize;

#[derive(Row, Deserialize, Debug, Clone)]
pub(crate) struct MatchWithReplay {
    pub match_id: u64,
    pub cluster_id: Option<u32>,
    pub replay_salt: Option<u32>,
}

#[derive(Debug)]
pub(crate) struct MatchUpdate {
    pub match_id: u64,
    pub banned_hero_ids: Vec<u32>,
    pub players: Vec<(u32, u64)>,
}
