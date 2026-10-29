CREATE TABLE default.steam_profile_observed_names
(
    `account_id` UInt32,
    `observed_name` String CODEC(ZSTD(1)),
    `match_id` UInt64,
    `observed_at` DateTime CODEC(Delta(4), ZSTD(1))
)
ENGINE = ReplacingMergeTree(observed_at)
PARTITION BY toStartOfMonth(observed_at)
ORDER BY (account_id, observed_name)
SETTINGS index_granularity = 8192;
