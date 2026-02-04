use clickhouse::Row;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Row)]
pub(crate) struct MatchSalt {
    pub(crate) match_id: u64,
    pub(crate) cluster_id: Option<u32>,
    pub(crate) metadata_salt: Option<u32>,
    pub(crate) replay_salt: Option<u32>,
    pub(crate) username: Option<String>,
}

/// A pending match with its participant `account_id` values for prioritization checking.
#[derive(Serialize, Deserialize, Debug, Row)]
pub(crate) struct PendingMatch {
    pub(crate) match_id: u64,
    /// List of participant `account_id` values (`UInt32` in `ClickHouse`)
    pub(crate) participants: Vec<u32>,
}

/// A match marked with its prioritization status.
#[derive(Debug)]
pub(crate) struct PrioritizedMatch {
    pub(crate) match_id: u64,
    /// Whether this match involves at least one prioritized account.
    pub(crate) is_prioritized: bool,
}
