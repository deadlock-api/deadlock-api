CREATE TABLE default.items_staging
(
    `id` UInt32 STATISTICS(tdigest),
    `name` String,
    `tier` Nullable(UInt8) STATISTICS(tdigest),
    `type` Enum8('upgrade' = 0, 'ability' = 1, 'unknown' = 2) DEFAULT 'upgrade',
    `slot_type` Nullable(Enum8('weapon' = 0, 'vitality' = 1, 'spirit' = 2)) DEFAULT NULL,
    `cost` Nullable(UInt32) STATISTICS(tdigest)
)
ENGINE = ReplacingMergeTree
ORDER BY id
SETTINGS index_granularity = 8192;
