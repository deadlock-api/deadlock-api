CREATE TABLE default.cohort_agg_refresh_state
(
    `table_name` String,
    `day` Date,
    `source_max_created_at` DateTime,
    `refreshed_at` DateTime DEFAULT now(),
    `source_match_count` UInt64 DEFAULT 0
)
ENGINE = ReplacingMergeTree(refreshed_at)
ORDER BY (table_name, day)
SETTINGS index_granularity = 8192;
