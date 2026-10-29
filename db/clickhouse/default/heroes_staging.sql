CREATE TABLE default.heroes_staging
(
    `id` UInt8 STATISTICS(tdigest),
    `name` String
)
ENGINE = ReplacingMergeTree
ORDER BY id
SETTINGS index_granularity = 8192;
