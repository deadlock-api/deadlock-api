CREATE TABLE IF NOT EXISTS game_server_metrics
(
    timestamp         DateTime64(3) DEFAULT now64(3),
    server_id         LowCardinality(String),
    region            LowCardinality(String),
    game_mode         LowCardinality(String),
    game_mode_version LowCardinality(String) DEFAULT '',
    map               LowCardinality(String) DEFAULT '',
    metric_name       LowCardinality(String),
    account_id        UInt32,
    metric_value      Float64,
    metadata          Map(String, String)
)
    ENGINE = MergeTree
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (game_mode, metric_name, game_mode_version, map, timestamp, account_id)
        TTL toDateTime(timestamp) + INTERVAL 1 YEAR
        SETTINGS index_granularity = 8192;

ALTER TABLE game_server_metrics
    ADD INDEX idx_account_id account_id TYPE bloom_filter GRANULARITY 4;
ALTER TABLE game_server_metrics
    ADD INDEX idx_server_id server_id TYPE bloom_filter GRANULARITY 4;
