use core::fmt::Debug;

use clickhouse::Row;
use serde::Deserialize;
use time::OffsetDateTime;

#[derive(Row, Deserialize, Clone)]
pub(crate) struct MatchSalts {
    pub match_id: u64,
    pub cluster_id: Option<u32>,
    pub metadata_salt: Option<u32>,
    #[serde(with = "clickhouse::serde::time::datetime::option")]
    pub force_retry_at: Option<OffsetDateTime>,
}

impl PartialEq for MatchSalts {
    fn eq(&self, other: &Self) -> bool {
        self.match_id == other.match_id
    }
}

impl Eq for MatchSalts {}

impl core::hash::Hash for MatchSalts {
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        self.match_id.hash(state);
    }
}

#[allow(clippy::missing_fields_in_debug)]
impl Debug for MatchSalts {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("MatchSalts")
            .field("match_id", &self.match_id)
            .finish()
    }
}
