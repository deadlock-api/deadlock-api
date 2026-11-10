CREATE DICTIONARY default.server_clusters_dict
(
    `cluster_id` UInt64,
    `region` String,
    `datacenter` String
)
PRIMARY KEY cluster_id
SOURCE(CLICKHOUSE(HOST 'localhost' PORT 9000 USER 'api_readonly_user' PASSWORD '[HIDDEN]' DB 'default' QUERY 'SELECT cluster_id, argMax(region, last_match_id) AS region, arrayStringConcat(arraySort(groupUniqArray(datacenter)), \',\') AS datacenter FROM default.server_clusters GROUP BY cluster_id'))
LIFETIME(MIN 300 MAX 600)
LAYOUT(HASHED());
