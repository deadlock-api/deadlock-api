CREATE TABLE default.request_logs
(
    `timestamp` DateTime64(3),
    `method` LowCardinality(String),
    `path` LowCardinality(String),
    `uri` String,
    `query_params` Map(String, String),
    `status_code` UInt16 STATISTICS(tdigest),
    `duration_ms` UInt64 STATISTICS(tdigest),
    `user_agent` Nullable(String),
    `api_key` Nullable(UUID),
    `client_ip` Nullable(String),
    `response_size` UInt64 STATISTICS(tdigest),
    `content_type` Nullable(String),
    `referer` Nullable(String),
    `accept` Nullable(String),
    `accept_encoding` Nullable(String),
    `rate_limit_remaining` Nullable(UInt64) DEFAULT NULL STATISTICS(tdigest),
    `rate_limit_reset` Nullable(UInt64) DEFAULT NULL STATISTICS(tdigest),
    `graphql_complexity` Nullable(UInt64) DEFAULT NULL,
    `graphql_depth` Nullable(UInt64) DEFAULT NULL,
    `graphql_query` Nullable(String) DEFAULT NULL CODEC(ZSTD(3)),
    `graphql_variables` Nullable(String) DEFAULT NULL CODEC(ZSTD(3)),
    `graphql_request_id` Nullable(UUID) DEFAULT NULL,
    `request_id` String DEFAULT '',
    INDEX idx_path path TYPE bloom_filter GRANULARITY 4,
    INDEX idx_api_key api_key TYPE bloom_filter GRANULARITY 4,
    INDEX idx_request_id request_id TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (timestamp, path, method)
TTL toDateTime(timestamp) + toIntervalWeek(2)
SETTINGS index_granularity = 8192;
