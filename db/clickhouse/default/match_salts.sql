CREATE TABLE default.match_salts
(
    `match_id` UInt64 CODEC(Delta(8), ZSTD(1)),
    `cluster_id` Nullable(UInt32),
    `metadata_salt` Nullable(UInt32),
    `replay_salt` Nullable(UInt32),
    `created_at` DateTime DEFAULT now() CODEC(Delta(4), ZSTD(1)),
    `username` Nullable(String),
    `verified_at` Nullable(DateTime) DEFAULT NULL,
    `failed_at` Nullable(DateTime) DEFAULT NULL
)
ENGINE = CoalescingMergeTree
ORDER BY (match_id, cluster_id, metadata_salt)
SETTINGS index_granularity = 1024, allow_nullable_key = 1, auto_statistics_types = '';
