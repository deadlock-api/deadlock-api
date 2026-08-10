use core::fmt::Debug;

use clickhouse::Row;
use serde::Deserialize;

#[derive(Row, Deserialize, Clone, PartialEq, Eq, Hash)]
pub(crate) struct MatchSalts {
    pub match_id: u64,
    pub cluster_id: Option<u32>,
    pub metadata_salt: Option<u32>,
    /// Unix seconds. Part of the row identity, so a verdict must carry it to land on this
    /// candidate instead of creating a new one.
    pub created_at: u32,
}

/// Salts are secrets: anyone holding one can pull the replay.
#[allow(clippy::missing_fields_in_debug)]
impl Debug for MatchSalts {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("MatchSalts")
            .field("match_id", &self.match_id)
            .finish()
    }
}

/// Every unresolved candidate for one match, newest first.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct MatchCandidates {
    pub match_id: u64,
    pub candidates: Vec<MatchSalts>,
}
