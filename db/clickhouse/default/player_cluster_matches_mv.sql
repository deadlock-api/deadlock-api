CREATE MATERIALIZED VIEW default.player_cluster_matches_mv TO default.player_cluster_matches
(
    `account_id` UInt32,
    `week` Date,
    `cluster_id` UInt32,
    `matches` UInt64
)
AS SELECT
    mp.account_id AS account_id,
    toMonday(mp.start_time) AS week,
    s.salt_cluster_id AS cluster_id,
    uniqExact(mp.match_id) AS matches
FROM default.match_player AS mp
INNER JOIN
(
    SELECT
        match_id,
        any(cluster_id) AS salt_cluster_id
    FROM default.match_salts
    WHERE (match_id IN (
        SELECT match_id
        FROM default.match_player
    )) AND (cluster_id > 0)
    GROUP BY match_id
) AS s ON s.match_id = mp.match_id
WHERE mp.account_id > 0
GROUP BY
    account_id,
    week,
    cluster_id;
