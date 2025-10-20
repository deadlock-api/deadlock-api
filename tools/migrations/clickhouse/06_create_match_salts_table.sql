create table match_salts
(
    match_id      UInt64 CODEC (Delta, ZSTD),
    cluster_id    Nullable(UInt32),
    metadata_salt Nullable(UInt32),
    replay_salt   Nullable(UInt32),
    created_at    DateTime default now() CODEC (Delta, ZSTD),
    username      Nullable(String)
)
    engine = CoalescingMergeTree PARTITION BY toStartOfMonth(created_at)
        ORDER BY (toStartOfMonth(created_at), match_id)
        SETTINGS index_granularity = 8192;
