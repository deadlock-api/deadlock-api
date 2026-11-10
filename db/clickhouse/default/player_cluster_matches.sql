CREATE TABLE default.player_cluster_matches
(
    `account_id` UInt32,
    `week` Date COMMENT 'Monday of the match week (toMonday(start_time))',
    `cluster_id` UInt32 COMMENT 'match_salts.cluster_id; server_clusters maps it to the server region and datacenter',
    `matches` UInt64
)
ENGINE = SummingMergeTree
ORDER BY (account_id, week, cluster_id)
SETTINGS index_granularity = 8192
COMMENT 'Matches per player, week and server cluster: player_cluster_matches_mv for match_player inserts since 2026-11-10, earlier rows backfilled. Re-inserted matches count again. server_clusters maps cluster_id to region and datacenter.';
