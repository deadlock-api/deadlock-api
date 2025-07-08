use core::fmt::Debug;

use clickhouse::Row;
use serde::Deserialize;

#[derive(Row, Deserialize, PartialEq, Eq, Hash, Clone)]
pub(crate) struct MatchSalts {
    pub match_id: u64,
    pub cluster_id: Option<u32>,
    pub metadata_salt: Option<u32>,
    pub replay_salt: Option<u32>,
}

#[allow(clippy::missing_fields_in_debug)]
impl Debug for MatchSalts {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("MatchSalts")
            .field("match_id", &self.match_id)
            .finish()
    }
}
