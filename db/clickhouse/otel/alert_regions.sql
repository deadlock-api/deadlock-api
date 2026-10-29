CREATE TABLE otel.alert_regions
(
    `time` DateTime,
    `timeEnd` DateTime,
    `text` String,
    `tags` Array(String)
)
ENGINE = MergeTree
ORDER BY time
SETTINGS index_granularity = 8192;
