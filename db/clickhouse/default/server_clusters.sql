CREATE TABLE default.server_clusters
(
    `cluster_id` UInt32 COMMENT 'match_salts.cluster_id the demo was downloaded from',
    `region` LowCardinality(String) COMMENT 'Region in the demo server name, e.g. eu_west, us_north_central or dpkt-frankfurt',
    `datacenter` LowCardinality(String) COMMENT 'Datacenter of the server host, e.g. fra2 from srcds1010-fra2; a cluster can span several',
    `first_match_id` SimpleAggregateFunction(min, UInt64),
    `last_match_id` SimpleAggregateFunction(max, UInt64),
    `matches` SimpleAggregateFunction(sum, UInt64) COMMENT 'Demos seen'
)
ENGINE = AggregatingMergeTree
ORDER BY (cluster_id, region, datacenter)
SETTINGS index_granularity = 8192
COMMENT 'Where each cluster''s game servers are, from the server name in demo headers (demo-analyzer). Join on match_salts.cluster_id for a match''s server region.';
