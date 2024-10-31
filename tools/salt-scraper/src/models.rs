use clickhouse::Row;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InvokeResponse200 {
    pub(crate) data: String,
}

#[derive(Row, Deserialize, PartialEq, Eq, Hash, Clone)]
pub struct MatchIdQueryResult {
    pub(crate) match_id: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MatchSalt {
    pub(crate) cluster_id: u32,
    pub(crate) match_id: u64,
    pub(crate) metadata_salt: u32,
    pub(crate) replay_salt: u32,
}
