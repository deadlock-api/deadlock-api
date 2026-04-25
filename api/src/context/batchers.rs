use std::sync::Arc;

use crate::routes::v1::matches::metadata::DemoPlayerBatcher;
use crate::routes::v1::matches::salts::{
    MatchInfoExistsBatcher, MatchSaltsExistsBatcher, MatchSaltsInsertBatcher, MatchSaltsReadBatcher,
};
use crate::routes::v1::players::match_history::{
    MatchHistoryInsertBatcher, MatchHistoryReadBatcher,
};
use crate::routes::v1::players::rank_predict::RankPredictMatchesBatcher;
use crate::routes::v1::players::steam::route::SteamProfileBatcher;
use crate::routes::v1::servers::metrics::GameServerMetricsInsertBatcher;

#[derive(Clone)]
pub(crate) struct Batchers {
    pub(crate) match_history_read: MatchHistoryReadBatcher,
    pub(crate) match_history_insert: Arc<MatchHistoryInsertBatcher>,
    pub(crate) match_salts_read: MatchSaltsReadBatcher,
    pub(crate) match_salts_exists: MatchSaltsExistsBatcher,
    pub(crate) match_salts_insert: Arc<MatchSaltsInsertBatcher>,
    pub(crate) match_info_exists: MatchInfoExistsBatcher,
    pub(crate) game_server_metrics: Arc<GameServerMetricsInsertBatcher>,
    pub(crate) rank_predict_matches: RankPredictMatchesBatcher,
    pub(crate) demo_player: DemoPlayerBatcher,
    pub(crate) steam_profile: SteamProfileBatcher,
}

impl Batchers {
    pub(crate) fn new(ch_client: &clickhouse::Client, ch_client_ro: &clickhouse::Client) -> Self {
        Self {
            match_history_read: MatchHistoryReadBatcher::new(ch_client_ro.clone()),
            match_history_insert: Arc::new(MatchHistoryInsertBatcher::new(ch_client.clone())),
            match_salts_read: MatchSaltsReadBatcher::new(ch_client_ro.clone()),
            match_salts_exists: MatchSaltsExistsBatcher::new(ch_client_ro.clone()),
            match_salts_insert: Arc::new(MatchSaltsInsertBatcher::new(ch_client.clone())),
            match_info_exists: MatchInfoExistsBatcher::new(ch_client_ro.clone()),
            game_server_metrics: Arc::new(GameServerMetricsInsertBatcher::new(ch_client.clone())),
            rank_predict_matches: RankPredictMatchesBatcher::new(ch_client_ro.clone()),
            demo_player: DemoPlayerBatcher::new(ch_client_ro.clone()),
            steam_profile: SteamProfileBatcher::new(ch_client_ro.clone()),
        }
    }

    /// Spawn background flush tasks for all insert batchers.
    pub(crate) fn start_background_flushes(&self) {
        self.match_history_insert.clone().start_background_flush();
        self.match_salts_insert.clone().start_background_flush();
        self.game_server_metrics.clone().start_background_flush();
    }
}
