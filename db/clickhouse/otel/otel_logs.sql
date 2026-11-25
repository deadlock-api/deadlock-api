CREATE TABLE otel.otel_logs
(
    `Timestamp` DateTime64(9) CODEC(Delta(8), ZSTD(3)),
    `TraceId` String CODEC(ZSTD(3)),
    `SpanId` String CODEC(ZSTD(3)),
    `TraceFlags` UInt8,
    `SeverityText` LowCardinality(String) CODEC(ZSTD(3)),
    `SeverityNumber` UInt8,
    `ServiceName` LowCardinality(String) CODEC(ZSTD(3)),
    `Body` String CODEC(ZSTD(3)),
    `ResourceSchemaUrl` LowCardinality(String) CODEC(ZSTD(3)),
    `ResourceAttributes` Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    `ScopeSchemaUrl` LowCardinality(String) CODEC(ZSTD(3)),
    `ScopeName` String CODEC(ZSTD(3)),
    `ScopeVersion` LowCardinality(String) CODEC(ZSTD(3)),
    `ScopeAttributes` Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    `LogAttributes` Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    `EventName` String CODEC(ZSTD(3))
)
ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (toStartOfFiveMinutes(Timestamp), ServiceName, Timestamp)
TTL toDateTime(Timestamp) + toIntervalDay(3)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1, enable_block_number_column = 1, enable_block_offset_column = 1;
