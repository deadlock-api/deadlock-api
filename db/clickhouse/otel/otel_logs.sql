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
    `EventName` String CODEC(ZSTD(3)),
    INDEX idx_trace_id TraceId TYPE text(tokenizer = 'array') GRANULARITY 100000000,
    INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE text(tokenizer = 'array') GRANULARITY 100000000,
    INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE text(tokenizer = 'array') GRANULARITY 100000000,
    INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE text(tokenizer = 'array') GRANULARITY 100000000,
    INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE text(tokenizer = 'array') GRANULARITY 100000000,
    INDEX idx_log_attr_key mapKeys(LogAttributes) TYPE text(tokenizer = 'array') GRANULARITY 100000000,
    INDEX idx_log_attr_value mapValues(LogAttributes) TYPE text(tokenizer = 'array') GRANULARITY 100000000,
    INDEX idx_lower_body lower(Body) TYPE text(tokenizer = 'splitByNonAlpha') GRANULARITY 100000000
)
ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (toStartOfFiveMinutes(Timestamp), ServiceName, Timestamp)
TTL toDateTime(Timestamp) + toIntervalDay(3)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1, enable_block_number_column = 1, enable_block_offset_column = 1;
