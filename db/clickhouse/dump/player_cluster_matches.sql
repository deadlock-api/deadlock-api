CREATE VIEW dump.player_cluster_matches
(
    `account_id` UInt32,
    `month` Date,
    `cluster_id` UInt32,
    `matches` UInt64
)
SQL SECURITY INVOKER
AS SELECT
    account_id,
    month,
    cluster_id,
    matches
FROM default.player_cluster_matches;
