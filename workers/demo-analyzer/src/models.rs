use clickhouse::Row;
use serde::{Deserialize, Serialize};

use crate::server::ServerLocation;

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
    /// The `match_salts` cluster the demo was downloaded from.
    pub cluster_id: u32,
    /// Where the game server ran, if the demo header's server name could be parsed.
    pub server: Option<ServerLocation>,
}

#[derive(Debug)]
pub(crate) struct DemoPlayer {
    pub account_id: u32,
    pub hero_build_id: u64,
    pub pregame_hero_id: Option<u32>,
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

/// One row of `server_clusters`: which region and datacenter a cluster's servers are in, folded
/// over the demos of one batch (`AggregatingMergeTree` keeps the min/max/sum across batches).
#[derive(Row, Serialize, Debug)]
pub(crate) struct ServerClusterRow {
    pub cluster_id: u32,
    pub region: String,
    pub datacenter: String,
    pub first_match_id: u64,
    pub last_match_id: u64,
    pub matches: u64,
}
