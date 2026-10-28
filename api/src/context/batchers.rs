use core::time::Duration;
use std::sync::Arc;

use clickhouse::{RowOwned, RowWrite};
use clickhouse_utils::{BatchInserter, BatchInserterConfig};

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
            match_history_insert: insert_batcher(ch_client, "player_match_history"),
            match_salts_read: MatchSaltsReadBatcher::new(ch_client_ro.clone()),
            match_salts_graphql: MatchSaltsGraphQlBatcher::new(ch_client_ro.clone()),
            match_salts_exists: MatchSaltsExistsBatcher::new(ch_client_ro.clone()),
            match_info_exists: MatchInfoExistsBatcher::new(ch_client_ro.clone()),
            pending_match_insert: insert_batcher(ch_client, "pending_matches"),
            estimated_start_time: EstimatedStartTimeBatcher::new(ch_client_ro.clone()),
            player_hero_stats: PlayerHeroStatsBatcher::new(ch_client_ro.clone()),
            demo_player: DemoPlayerBatcher::new(ch_client_ro.clone()),
            steam_profile: SteamProfileBatcher::new(ch_client_ro.clone()),
            steam_profile_graphql: SteamProfileGraphQlBatcher::new(ch_client_ro.clone()),
            player_rank: PlayerRankBatcher::new(ch_client_ro.clone()),
        }
    }
}

/// A [`BatchInserter`] for `table` that flushes every 10 s or at 10k rows, and runs its final
/// flush once [`crate::BACKGROUND_SHUTDOWN`] fires (after the server stopped serving).
pub(crate) fn insert_batcher<T>(
    ch_client: &clickhouse::Client,
    table: &str,
) -> Arc<BatchInserter<T>>
where
    T: RowOwned + RowWrite + Send + Sync + 'static,
{
    let inserter = Arc::new(BatchInserter::spawn(
        ch_client,
        BatchInserterConfig {
            table: table.to_owned(),
            metrics_prefix: "clickhouse_insert_batcher".to_owned(),
            max_rows: 10_000,
            flush_interval: Some(Duration::from_secs(10)),
            workers: 1,
            queue_capacity: 10_000,
        },
    ));
    let shutdown = Arc::clone(&inserter);
    crate::BACKGROUND_TASKS.spawn(async move {
        crate::BACKGROUND_SHUTDOWN.cancelled().await;
        shutdown.shutdown().await;
    });
    inserter
}
