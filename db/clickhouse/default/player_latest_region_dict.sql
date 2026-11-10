CREATE DICTIONARY default.player_latest_region_dict
(
    `account_id` UInt64,
    `region` String,
    `month` Date
)
PRIMARY KEY account_id
SOURCE(CLICKHOUSE(HOST 'localhost' PORT 9000 USER 'api_readonly_user' PASSWORD '[HIDDEN]' DB 'default' QUERY 'SELECT account_id, argMax(r, (n, r)) AS region, any(mo) AS month FROM (SELECT account_id, month AS mo, dictGet(\'default.server_clusters_dict\', \'region\', toUInt64(cluster_id)) AS r, sum(matches) AS n FROM default.player_cluster_matches WHERE (account_id, month) IN (SELECT account_id, max(month) FROM default.player_cluster_matches WHERE dictHas(\'default.server_clusters_dict\', toUInt64(cluster_id)) GROUP BY account_id) AND dictHas(\'default.server_clusters_dict\', toUInt64(cluster_id)) GROUP BY account_id, mo, r) GROUP BY account_id'))
LIFETIME(MIN 3600 MAX 7200)
LAYOUT(HASHED_ARRAY())
COMMENT 'Per player: the server region with the most matches in their latest month with a known cluster (player_cluster_matches + server_clusters_dict). Protected accounts excluded by the row policy.';
