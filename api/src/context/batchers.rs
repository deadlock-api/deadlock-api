use std::sync::Arc;

use crate::routes::v1::graphql::salts::MatchSaltsGraphQlBatcher;
use crate::routes::v1::matches::metadata::DemoPlayerBatcher;
use crate::routes::v1::matches::salts::{
    MatchInfoExistsBatcher, MatchSaltsExistsBatcher, MatchSaltsReadBatcher,
};
use crate::routes::v1::matches::to_fetch::{EstimatedStartTimeBatcher, PendingMatchInsertBatcher};
use crate::routes::v1::players::hero_stats::PlayerHeroStatsBatcher;
use crate::routes::v1::players::match_history::{
    MatchHistoryInsertBatcher, MatchHistoryReadBatcher,
};
use crate::routes::v1::players::rank::PlayerRankBatcher;
use crate::routes::v1::players::steam::route::{SteamProfileBatcher, SteamProfileGraphQlBatcher};

#[derive(Clone)]
pub(crate) struct Batchers {
    pub(crate) match_history_read: MatchHistoryReadBatcher,
    pub(crate) match_history_insert: Arc<MatchHistoryInsertBatcher>,
    pub(crate) match_salts_read: MatchSaltsReadBatcher,
    pub(crate) match_salts_graphql: MatchSaltsGraphQlBatcher,
    pub(crate) match_salts_exists: MatchSaltsExistsBatcher,
    pub(crate) match_info_exists: MatchInfoExistsBatcher,
    pub(crate) pending_match_insert: Arc<PendingMatchInsertBatcher>,
    pub(crate) estimated_start_time: EstimatedStartTimeBatcher,
    pub(crate) player_hero_stats: PlayerHeroStatsBatcher,
    pub(crate) demo_player: DemoPlayerBatcher,
    pub(crate) steam_profile: SteamProfileBatcher,
    pub(crate) steam_profile_graphql: SteamProfileGraphQlBatcher,
    pub(crate) player_rank: PlayerRankBatcher,
}

impl Batchers {
    pub(crate) fn new(ch_client: &clickhouse::Client, ch_client_ro: &clickhouse::Client) -> Self {
        Self {
            match_history_read: MatchHistoryReadBatcher::new(ch_client_ro.clone()),
            match_history_insert: Arc::new(MatchHistoryInsertBatcher::new(ch_client.clone())),
            match_salts_read: MatchSaltsReadBatcher::new(ch_client_ro.clone()),
            match_salts_graphql: MatchSaltsGraphQlBatcher::new(ch_client_ro.clone()),
            match_salts_exists: MatchSaltsExistsBatcher::new(ch_client_ro.clone()),
            match_info_exists: MatchInfoExistsBatcher::new(ch_client_ro.clone()),
            pending_match_insert: Arc::new(PendingMatchInsertBatcher::new(ch_client.clone())),
            estimated_start_time: EstimatedStartTimeBatcher::new(ch_client_ro.clone()),
            player_hero_stats: PlayerHeroStatsBatcher::new(ch_client_ro.clone()),
            demo_player: DemoPlayerBatcher::new(ch_client_ro.clone()),
            steam_profile: SteamProfileBatcher::new(ch_client_ro.clone()),
            steam_profile_graphql: SteamProfileGraphQlBatcher::new(ch_client_ro.clone()),
            player_rank: PlayerRankBatcher::new(ch_client_ro.clone()),
        }
    }

    /// Spawn background flush tasks for all insert batchers.
    pub(crate) fn start_background_flushes(&self) {
        Arc::clone(&self.match_history_insert).start_background_flush();
        Arc::clone(&self.pending_match_insert).start_background_flush();
    }
}
