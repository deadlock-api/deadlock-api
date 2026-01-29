CREATE TABLE IF NOT EXISTS request_logs
(
    timestamp       DateTime64(3),
    method          LowCardinality(String),
    path            LowCardinality(String),
    uri             String,
    query_params    Map(String, String),
    status_code     UInt16,
    duration_ms     UInt64,
    user_agent      Nullable(String),
    api_key         Nullable(UUID),
    client_ip       Nullable(String),
    response_size   UInt64,
    content_type    Nullable(String),
    referer         Nullable(String),
    accept          Nullable(String),
    accept_encoding Nullable(String)
)
    ENGINE = MergeTree
        PARTITION BY toYYYYMMDD(timestamp)
        ORDER BY (timestamp, path, method)
        TTL toDateTime(timestamp) + INTERVAL 2 WEEK
        SETTINGS index_granularity = 8192;

ALTER TABLE request_logs
    ADD INDEX idx_path path TYPE bloom_filter GRANULARITY 4;
ALTER TABLE request_logs
    ADD INDEX idx_api_key api_key TYPE bloom_filter GRANULARITY 4;
