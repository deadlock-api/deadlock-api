use clickhouse::Row;
use serde::{Deserialize, Serialize};

#[derive(Row, Deserialize, PartialEq, Eq, Hash, Clone)]
pub(crate) struct MatchIdQueryResult {
    pub(crate) match_id: u64,
}

#[derive(Serialize, Deserialize, Debug, Row)]
pub(crate) struct MatchSalt {
    pub(crate) match_id: u64,
    pub(crate) cluster_id: Option<u32>,
    pub(crate) metadata_salt: Option<u32>,
    pub(crate) replay_salt: Option<u32>,
    pub(crate) username: Option<String>,
}
