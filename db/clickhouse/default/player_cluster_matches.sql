CREATE TABLE default.player_cluster_matches
(
    `account_id` UInt32,
    `month` Date COMMENT 'First day of the match month (toStartOfMonth(start_time))',
    `cluster_id` UInt32 COMMENT 'match_salts.cluster_id; server_clusters maps it to the server region and datacenter',
    `matches` UInt64
)
ENGINE = SummingMergeTree
ORDER BY (account_id, month, cluster_id)
SETTINGS index_granularity = 256
COMMENT 'Matches per player, month and server cluster: player_cluster_matches_mv for match_player inserts since 2026-11-10, earlier rows backfilled. Re-inserted matches count again. server_clusters maps cluster_id to region and datacenter.';
