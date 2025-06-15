use clickhouse::Row;
use serde::{Deserialize, Serialize};

#[derive(Row, Deserialize, PartialEq, Eq, Hash, Clone)]
pub struct MatchIdQueryResult {
    pub(crate) match_id: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MatchSalt {
    pub(crate) cluster_id: u32,
    pub(crate) match_id: u32,
    pub(crate) metadata_salt: u32,
    pub(crate) replay_salt: u32,
    pub(crate) username: Option<String>,
}
