CREATE TABLE otel.otel_metrics_summary
(
    `ResourceAttributes` Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    `ResourceSchemaUrl` String CODEC(ZSTD(3)),
    `ScopeName` String CODEC(ZSTD(3)),
    `ScopeVersion` String CODEC(ZSTD(3)),
    `ScopeAttributes` Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    `ScopeDroppedAttrCount` UInt32 CODEC(ZSTD(3)),
    `ScopeSchemaUrl` String CODEC(ZSTD(3)),
    `ServiceName` LowCardinality(String) CODEC(ZSTD(3)),
    `MetricName` LowCardinality(String) CODEC(ZSTD(3)),
    `MetricDescription` String CODEC(ZSTD(3)),
    `MetricUnit` String CODEC(ZSTD(3)),
    `Attributes` Map(LowCardinality(String), String) CODEC(ZSTD(3)),
    `StartTimeUnix` DateTime CODEC(Delta(4), ZSTD(3)),
    `TimeUnix` DateTime CODEC(Delta(4), ZSTD(3)),
    `Count` UInt64 CODEC(Delta(8), ZSTD(3)),
    `Sum` Float64 CODEC(ZSTD(3)),
    `ValueAtQuantiles.Quantile` Array(Float64) CODEC(ZSTD(3)),
    `ValueAtQuantiles.Value` Array(Float64) CODEC(ZSTD(3)),
    `Flags` UInt32 CODEC(ZSTD(3)),
    INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_attr_key mapKeys(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_attr_value mapValues(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_time_minmax TimeUnix TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(TimeUnix)
ORDER BY (ServiceName, MetricName, toStartOfHour(TimeUnix), cityHash64(Attributes), TimeUnix)
TTL TimeUnix + toIntervalDay(30)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;
