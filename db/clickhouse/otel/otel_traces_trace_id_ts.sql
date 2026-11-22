CREATE TABLE otel.otel_traces_trace_id_ts
(
    `TraceId` String CODEC(ZSTD(3)),
    `Start` DateTime CODEC(Delta(4), ZSTD(3)),
    `End` DateTime CODEC(Delta(4), ZSTD(3)),
    INDEX idx_trace_id TraceId TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(Start)
ORDER BY (TraceId, Start)
TTL Start + toIntervalDay(3)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;
