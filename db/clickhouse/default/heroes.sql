CREATE TABLE default.heroes
(
    `id` UInt8 STATISTICS(tdigest),
    `name` String
)
ENGINE = ReplacingMergeTree
ORDER BY id
SETTINGS index_granularity = 8192;
