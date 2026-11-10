CREATE VIEW dump.server_clusters
(
    `cluster_id` UInt32,
    `region` String,
    `datacenter` String,
    `first_match_id` UInt64,
    `last_match_id` UInt64,
    `matches` UInt64
)
SQL SECURITY INVOKER
AS SELECT
    cluster_id,
    toString(region) AS region,
    toString(datacenter) AS datacenter,
    toUInt64(first_match_id) AS first_match_id,
    toUInt64(last_match_id) AS last_match_id,
    toUInt64(matches) AS matches
FROM default.server_clusters;
